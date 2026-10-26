import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { equipment, fetchEquipment } from "../worker/equipment.mjs";
import { handle } from "../worker/index.mjs";
import { hash, now } from "../worker/security.mjs";
import known from "../data/census-items.json" with { type: "json" };
const character = {
  character_id: "562949954119859",
  world_id: "2",
  name: "Fixture",
};
const row = {
  character_id: character.character_id,
  world_id: "2",
  item_id: "2548220",
  equipment_slot_id: "14",
  quantity: "1",
  durability: "-1",
  aug_item_id_1: "2549518",
  aug_item_id_2: "-1",
};
const response = (rows = [row]) =>
  Response.json({ characters_item_list: rows, returned: rows.length });
function setup() {
  const sqlite = new DatabaseSync(":memory:");
  for (const migration of [
    "0001_accounts",
    "0002_article_revisions",
    "0003_unique_character_claim",
    "0005_equipment_snapshots",
    "0006_item_identifications",
    "0007_overlay_items",
    "0008_item_details",
  ])
    sqlite.exec(readFileSync(`migrations/${migration}.sql`, "utf8"));
  const env = {
    CENSUS_SERVICE_ID: "christitustech",
    SITE_ORIGIN: "https://dcuo-wiki.com",
    DISCORD_CLIENT_ID: "test",
    DISCORD_CLIENT_SECRET: "test",
    DB: {
      prepare(sql) {
        return {
          bind(...args) {
            return {
              async all() {
                return { results: sqlite.prepare(sql).all(...args) };
              },
              async first() {
                return sqlite.prepare(sql).get(...args) || null;
              },
              async run() {
                return { meta: sqlite.prepare(sql).run(...args) };
              },
            };
          },
        };
      },
    },
  };
  return { env, sqlite };
}
test("equipment query is scoped to the linked character and world and uses the assigned service ID", async () => {
  const items = await fetchEquipment(
    { CENSUS_SERVICE_ID: "christitustech" },
    character.character_id,
    "2",
    async (url) => {
      assert.equal(
        url.pathname,
        "/s:christitustech/get/dcuo:v1/characters_item/",
      );
      assert.equal(
        url.searchParams.get("character_id"),
        character.character_id,
      );
      assert.equal(url.searchParams.get("world_id"), "2");
      assert.equal(url.searchParams.get("c:limit"), "100");
      return response();
    },
  );
  assert.equal(items[0].durability, null);
  assert.deepEqual(items[0].augments, ["2549518"]);
});
test("rejects outages, malformed, mixed-character, duplicate-slot and truncated snapshots", async () => {
  const bad = [
    Response.json({ error: "service_unavailable" }),
    Response.json({}),
    response([{ ...row, character_id: "1" }]),
    response([{ ...row, world_id: "3" }]),
    response([{ ...row, item_id: 123 }]),
    response([row, row]),
    response(Array(100).fill(row)),
    Response.json({ characters_item_list: [row], returned: 2 }),
    new Response("x".repeat(270000)),
    new Response("upstream", { status: 503 }),
  ];
  for (const result of bad)
    await assert.rejects(
      fetchEquipment(
        { CENSUS_SERVICE_ID: "christitustech" },
        character.character_id,
        "2",
        async () => result,
      ),
    );
});
test("cache, owner cooldown, source-backed links and unknown IDs", async () => {
  const { env } = setup();
  let calls = 0;
  const fetcher = async () => {
    calls++;
    return response([row, { ...row, equipment_slot_id: "2", item_id: "999" }]);
  };
  const first = await equipment(env, character, { fetcher });
  assert.equal(first.items[0].name, "Census item 999");
  assert.equal(first.items[0].href, undefined);
  assert.equal(first.items[1].href, "/wiki/Digital_Invader_Helm/");
  assert.equal(first.items[1].augments[0].href, "/wiki/Vitalization_v6_2/");
  assert.equal(first.stale, false);
  await equipment(env, character, { fetcher });
  await equipment(env, character, { fetcher, manual: true });
  assert.equal(calls, 1);
});
test("outages preserve the last loadout and empty successful snapshots replace it", async () => {
  const { env, sqlite } = setup();
  await equipment(env, character, { fetcher: async () => response() });
  sqlite.exec(
    "UPDATE equipment_snapshots SET synced_at=1,next_refresh_at=0,attempted_at=0",
  );
  const failed = await equipment(env, character, {
    fetcher: async () => Response.json({ error: "service_unavailable" }),
  });
  assert.equal(failed.items.length, 1);
  assert.equal(failed.syncedAt, 1);
  assert.equal(failed.unavailable, true);
  assert.equal(failed.stale, true);
  let calls = 0;
  await equipment(env, character, {
    fetcher: async () => {
      calls++;
      return response();
    },
  });
  assert.equal(calls, 0, "failed attempts back off for five minutes");
  sqlite.exec(
    "UPDATE equipment_snapshots SET next_refresh_at=0,attempted_at=0",
  );
  const empty = await equipment(env, character, {
    fetcher: async () => response([]),
  });
  assert.deepEqual(empty.items, []);
  assert.equal(empty.unavailable, false);
});
test("a refresh lease prevents simultaneous public requests from fanning out to Census", async () => {
  const { env } = setup();
  let complete,
    calls = 0;
  const pending = equipment(env, character, {
    fetcher: () => {
      calls++;
      return new Promise((resolve) => {
        complete = resolve;
      });
    },
  });
  while (!complete) await new Promise((resolve) => setImmediate(resolve));
  const concurrent = await equipment(env, character, {
    fetcher: () => {
      throw new Error("must not fetch twice");
    },
  });
  assert.equal(concurrent.refreshing, true);
  assert.equal(calls, 1);
  complete(response());
  await pending;
});
test("stale snapshots return immediately while Worker background refresh runs", async () => {
  const { env, sqlite } = setup();
  await equipment(env, character, { fetcher: async () => response() });
  sqlite.exec(
    "UPDATE equipment_snapshots SET synced_at=1,next_refresh_at=0,attempted_at=0",
  );
  let job;
  const cached = await equipment(env, character, {
    context: {
      waitUntil(p) {
        job = p;
      },
    },
    fetcher: async () => response([]),
  });
  assert.equal(cached.items.length, 1);
  assert.equal(cached.refreshing, true);
  await job;
  const updated = await equipment(env, character);
  assert.deepEqual(updated.items, []);
});
test("a different character or world never inherits a cached loadout", async () => {
  const { env } = setup();
  await equipment(env, character, { fetcher: async () => response() });
  const other = await equipment(
    { ...env, CENSUS_SERVICE_ID: undefined },
    { ...character, character_id: "99" },
  );
  assert.equal(other.items, null);
  const world = await equipment(
    { ...env, CENSUS_SERVICE_ID: undefined },
    { ...character, world_id: "3" },
  );
  assert.equal(world.items, null);
  const disabled = await equipment(
    { ...env, CENSUS_SERVICE_ID: undefined },
    character,
  );
  assert.equal(disabled.items.length, 1);
  assert.equal(disabled.unavailable, true);
});
test("known item mappings retain exact numeric evidence and published destinations", () => {
  const catalog = JSON.parse(
    readFileSync("content/catalog/Equipment.json", "utf8"),
  );
  assert.equal(new Set(known.map((i) => i.itemId)).size, known.length);
  for (const item of known) {
    const article = catalog.find((a) => a.slug === item.slug);
    assert.equal(item.title, article.title);
    assert(article.sections.some((s) => s.items?.includes(item.evidence)));
    assert(item.evidence.includes(item.itemId));
  }
});
test("API refresh requires sign-in, correct origin and a saved profile; clients cannot choose a character", async () => {
  const { env, sqlite } = setup();
  const user = "11111111-1111-4111-8111-111111111111",
    token = "a".repeat(64),
    origin = env.SITE_ORIGIN;
  sqlite
    .prepare("INSERT INTO users VALUES (?,?,?,?)")
    .run(user, "100", "Test", now());
  sqlite
    .prepare("INSERT INTO sessions VALUES (?,?,?)")
    .run(await hash(token), user, now() + 600);
  const request = (headers = {}, body = "{}") =>
    new Request(origin + "/api/profile/equipment/refresh", {
      method: "POST",
      headers: {
        Origin: origin,
        "Content-Type": "application/json",
        ...headers,
      },
      body,
    });
  const auth = { Cookie: `__Host-dcuo-session=${token}` };
  assert.equal((await handle(request(), env)).status, 401);
  assert.equal(
    (await handle(request({ ...auth, Origin: "https://other.example" }), env))
      .status,
    403,
  );
  assert.equal((await handle(request(auth), env)).status, 403);
  sqlite
    .prepare(
      "INSERT INTO profiles(user_id,character_id,character_name,world_id,census_json,matched_at,updated_at) VALUES (?,?,?,?,?,?,?)",
    )
    .run(
      user,
      character.character_id,
      character.name,
      "2",
      JSON.stringify(character),
      now(),
      now(),
    );
  assert.equal(
    (await handle(request(auth, '{"characterId":"99"}'), env)).status,
    400,
  );
  const refreshed = await handle(request(auth), env, async () => response());
  assert.equal(refreshed.status, 200);
  assert.equal((await refreshed.json()).characterId, character.character_id);
  const publicResponse = await handle(
    new Request(`${origin}/api/profiles/${user}/equipment`),
    env,
    () => {
      throw new Error("cached");
    },
  );
  assert.equal(publicResponse.status, 200);
  const publicData = await publicResponse.json();
  assert.equal(publicData.items.length, 1);
  assert.equal(publicData.discord_id, undefined);
  assert.equal(publicResponse.headers.get("Cache-Control"), "no-store");
});

test("cached equipment identities resolve to local consumable, artifact and ally pages", async () => {
  const { env } = setup();
  const data = await equipment(env, character, {
    fetcher: async () =>
      response([
        { ...row, item_id: "783542", equipment_slot_id: "14" },
        { ...row, item_id: "6795977", equipment_slot_id: "22" },
        { ...row, item_id: "8129032", equipment_slot_id: "32" },
      ]),
  });
  assert.deepEqual(
    data.items.map((item) => item.href),
    [
      "/wiki/Soder_Cola_Extreme/",
      "/wiki/The_Transformation_Card/",
      "/wiki/Ally_Shazam/",
    ],
  );
  const cached = await equipment(env, character, {
    fetcher: () => {
      throw new Error("must reuse the saved snapshot");
    },
  });
  assert.deepEqual(cached.items, data.items);
});
