import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { handle } from "../worker/index.mjs";
import { hash, now } from "../worker/security.mjs";
const origin = "https://dcuo-wiki.com";
const image = readFileSync("public/images/dcuo-logo.png").toString("base64");
const evidence = {
  itemId: "999000111",
  name: "Verified Fixture Helmet",
  evidence:
    "Tooltip captured with the same helmet equipped. Compared the slot before and after replacing this item.",
  image,
};
async function setup() {
  const sqlite = new DatabaseSync(":memory:");
  for (const file of [
    "0001_accounts",
    "0002_article_revisions",
    "0003_unique_character_claim",
    "0005_equipment_snapshots",
    "0006_item_identifications",
  ])
    sqlite.exec(readFileSync(`migrations/${file}.sql`, "utf8"));
  const DB = {
    prepare(sql) {
      return {
        bind(...args) {
          const bound = args.map((v) =>
            v instanceof ArrayBuffer ? new Uint8Array(v) : v,
          );
          return {
            async first() {
              return sqlite.prepare(sql).get(...bound) || null;
            },
            async all() {
              return { results: sqlite.prepare(sql).all(...bound) };
            },
            async run() {
              return { meta: sqlite.prepare(sql).run(...bound) };
            },
          };
        },
      };
    },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const result = [];
        for (const s of statements) result.push(await s.run());
        sqlite.exec("COMMIT");
        return result;
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
  };
  const env = {
    DB,
    DISCORD_CLIENT_ID: "test",
    DISCORD_CLIENT_SECRET: "test",
    DISCORD_MODERATOR_IDS: "900",
    SITE_ORIGIN: origin,
  };
  for (const [id, discord, token] of [
    ["player", "100", "a"],
    ["other", "200", "c"],
    ["mod", "900", "b"],
  ]) {
    sqlite
      .prepare("INSERT INTO users VALUES (?,?,?,?)")
      .run(id, discord, id, now());
    sqlite
      .prepare("INSERT INTO sessions VALUES (?,?,?)")
      .run(await hash(token.repeat(64)), id, now() + 3600);
  }
  sqlite
    .prepare(
      "INSERT INTO profiles(user_id,character_id,character_name,world_id,census_json,matched_at,updated_at) VALUES (?,?,?,?,?,?,?)",
    )
    .run(
      "player",
      "123",
      "Fixture",
      "2",
      JSON.stringify({ character_id: "123", world_id: "2" }),
      now(),
      now(),
    );
  const items = [
    { itemId: "999000111", slot: "1", quantity: 1, augments: ["999000112"] },
    { itemId: "999000111", slot: "2", quantity: 1, augments: [] },
    { itemId: "783542", slot: "14", quantity: 1, augments: [] },
  ];
  sqlite
    .prepare(
      "INSERT INTO equipment_snapshots(character_id,world_id,items_json,synced_at,next_refresh_at) VALUES (?,?,?,?,?)",
    )
    .run("123", "2", JSON.stringify(items), now(), now() + 1000);
  const request = (path, method = "GET", body, token = "a", extra = {}) =>
    handle(
      new Request(origin + path, {
        method,
        headers: {
          Cookie: `__Host-dcuo-session=${token.repeat(64)}`,
          Origin: origin,
          "Content-Type": "application/json",
          ...extra,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      env,
    );
  return { sqlite, env, request };
}
test("queue deduplicates equipment, includes augments, excludes known names and publishes no character IDs", async () => {
  const { request } = await setup();
  const r = await request("/api/items/unidentified");
  assert.equal(r.status, 200);
  const d = await r.json();
  assert.deepEqual(
    d.items.map((i) => i.item_id),
    ["999000111", "999000112"],
  );
  assert.equal(d.items[0].characters, 1);
  assert(!JSON.stringify(d).includes("Fixture"));
  assert.equal(d.next, null);
  assert.equal(
    (await request("/api/items/unidentified?after=bad")).status,
    400,
  );
});
test("queue pagination cannot lose unknown IDs when a whole scanned page contains known IDs", async () => {
  const { request, sqlite } = await setup();
  const known = JSON.parse(readFileSync("data/census-item-index.json", "utf8"))
    .slice(0, 220)
    .map(([itemId], i) => ({ itemId, slot: String(i), augments: [] }));
  sqlite
    .prepare("UPDATE equipment_snapshots SET items_json=?")
    .run(
      JSON.stringify([
        ...known,
        { itemId: "99999999999", slot: "999", augments: [] },
      ]),
    );
  let after = "",
    ids = [],
    pages = 0;
  do {
    const d = await (
      await request(
        "/api/items/unidentified" + (after ? "?after=" + after : ""),
      )
    ).json();
    ids.push(...d.items.map((i) => i.item_id));
    after = d.next;
    pages++;
  } while (after);
  assert.deepEqual(ids, ["99999999999"]);
  assert.equal(pages, 2);
});
test("submission binds a screenshot and evidence to the linked character snapshot and duplicate requests are rejected", async () => {
  const { request, sqlite } = await setup();
  const r = await request("/api/items/evidence", "POST", evidence);
  assert.equal(r.status, 201);
  const { id } = await r.json();
  const saved = sqlite
    .prepare("SELECT * FROM item_evidence WHERE id=?")
    .get(id);
  assert.equal(saved.character_id, "123");
  assert.equal(saved.world_id, "2");
  assert.equal(saved.status, "pending");
  assert(saved.snapshot_json.includes("999000111"));
  assert.equal(
    (await request("/api/items/evidence", "POST", evidence)).status,
    409,
  );
  const screenshot = await request(`/api/items/evidence/${id}/image`);
  assert.equal(screenshot.status, 200);
  assert.equal(screenshot.headers.get("Cache-Control"), "no-store");
  assert.equal(
    Buffer.from(await screenshot.arrayBuffer()).toString("base64"),
    image,
  );
  assert.equal(
    (await request(`/api/items/evidence/${id}/image`, "GET", undefined, "c"))
      .status,
    404,
  );
  assert.equal(
    (await request(`/api/items/evidence/${id}/image`, "GET", undefined, "b"))
      .status,
    200,
  );
  assert.equal(
    (await request("/api/items/evidence", "GET", undefined, "c")).status,
    200,
  );
  assert.equal(
    (await (await request("/api/items/evidence", "GET", undefined, "c")).json())
      .submissions.length,
    0,
  );
});
test("submission rejects unlinked, unobserved, stale, known, malformed, excessive and cross-origin evidence", async () => {
  const { request, sqlite } = await setup();
  assert.equal(
    (await request("/api/items/evidence", "POST", evidence, "c")).status,
    403,
  );
  assert.equal(
    (
      await request("/api/items/evidence", "POST", {
        ...evidence,
        itemId: "999000999",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request("/api/items/evidence", "POST", {
        ...evidence,
        itemId: "783542",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await request("/api/items/evidence", "POST", {
        ...evidence,
        image: "PHN2Zz48L3N2Zz4=",
      })
    ).status,
    415,
  );
  assert.equal(
    (
      await request("/api/items/evidence", "POST", {
        ...evidence,
        image: "a".repeat(349529),
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/api/items/evidence", "POST", evidence, "a", {
        Origin: "https://evil.example",
      })
    ).status,
    403,
  );
  sqlite.exec("UPDATE equipment_snapshots SET synced_at=1");
  assert.equal(
    (await request("/api/items/evidence", "POST", evidence)).status,
    409,
  );
});
test("only moderators can publish; approval updates cached loadouts and removes the queue entry; revocation restores unknown display and audit", async () => {
  const { request, sqlite, env } = await setup();
  const { id } = await (
    await request("/api/items/evidence", "POST", evidence)
  ).json();
  const decision = {
    id,
    status: "approved",
    name: "Verified Helmet <script>",
    slug: "Powers",
    notes: "Fixture variant only: 10 defense, verified from tooltip.",
    reason: "Verified the exact tooltip and before/after Census slot evidence.",
  };
  assert.equal((await request("/api/items/review")).status, 403);
  assert.equal(
    (await request("/api/items/review", "POST", decision)).status,
    403,
  );
  assert.equal(
    (
      await request(
        "/api/items/review",
        "POST",
        { ...decision, slug: "Missing_Article_Unknown" },
        "b",
      )
    ).status,
    404,
  );
  assert.equal(
    (await request("/api/items/review", "POST", decision, "b")).status,
    200,
  );
  const { equipment } = await import("../worker/equipment.mjs");
  const resolved = await equipment(env, { character_id: "123", world_id: "2" });
  assert.equal(resolved.items[0].name, decision.name);
  assert.equal(resolved.items[0].notes, decision.notes);
  assert.equal(resolved.items[1].name, decision.name);
  const publicData = await (await request("/api/items/unidentified")).json();
  assert.deepEqual(
    publicData.items.map((i) => i.item_id),
    ["999000112"],
  );
  assert.equal(
    (await request("/api/items/review", "POST", decision, "b")).status,
    409,
  );
  assert.equal(
    (
      await request(
        "/api/items/review",
        "POST",
        {
          id,
          status: "revoked",
          reason:
            "Tooltip variant was wrong; restore unknown until reverified.",
        },
        "b",
      )
    ).status,
    200,
  );
  assert.equal(
    (await equipment(env, { character_id: "123", world_id: "2" })).items[0]
      .identified,
    false,
  );
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS n FROM item_identifications").get().n,
    0,
  );
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) AS n FROM item_evidence_reviews").get().n,
    2,
  );
  assert.equal(
    (await (await request("/api/items/unidentified")).json()).items.length,
    2,
  );
});
test("rejection retains evidence and an explanation without publishing; augments can be identified", async () => {
  const { request, sqlite } = await setup();
  const { id } = await (
    await request("/api/items/evidence", "POST", {
      ...evidence,
      itemId: "999000112",
    })
  ).json();
  assert.equal(
    (
      await request(
        "/api/items/review",
        "POST",
        {
          id,
          status: "rejected",
          reason: "The screenshot does not show the augment tooltip.",
        },
        "b",
      )
    ).status,
    200,
  );
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) n FROM item_identifications").get().n,
    0,
  );
  assert.equal(
    (await (await request("/api/items/evidence")).json()).submissions[0]
      .review_reason,
    "The screenshot does not show the augment tooltip.",
  );
});

test("review and personal queues paginate without hiding older evidence; audit survives revoke", async () => {
  const { request, sqlite } = await setup();
  const insert = sqlite.prepare(
    `INSERT INTO item_evidence(id,user_id,character_id,character_name,world_id,item_id,proposed_name,evidence,snapshot_json,synced_at,screenshot,screenshot_type,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  );
  for (let i = 0; i < 55; i++)
    insert.run(
      `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      "player",
      "123",
      "Fixture",
      "2",
      String(998000000 + i),
      "Old evidence",
      "Fixture evidence for pagination.",
      "[]",
      now(),
      new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, ...Array(16).fill(0)]),
      "image/png",
      now() - 55 + i,
    );
  for (const path of ["/api/items/evidence", "/api/items/review"]) {
    const token = path.endsWith("review") ? "b" : "a";
    const first = await (await request(path, "GET", undefined, token)).json();
    assert.equal(first.submissions.length, 50);
    assert(first.next);
    const second = await (
      await request(
        path + "?before=" + encodeURIComponent(first.next),
        "GET",
        undefined,
        token,
      )
    ).json();
    assert.equal(second.submissions.length, 5);
    assert.equal(second.next, null);
    assert.equal(
      new Set([...first.submissions, ...second.submissions].map((s) => s.id))
        .size,
      55,
    );
  }
  assert.equal((await request("/api/items/evidence?before=bad")).status, 400);
});
test("a second approval cannot replace an already published item identity", async () => {
  const { request, sqlite } = await setup();
  const { id: first } = await (
    await request("/api/items/evidence", "POST", evidence)
  ).json();
  sqlite
    .prepare(
      `INSERT INTO profiles(user_id,character_id,character_name,world_id,census_json,matched_at,updated_at) VALUES ('other','321','Other fixture','2','{}',?,?)`,
    )
    .run(now(), now());
  sqlite
    .prepare(
      `INSERT INTO equipment_snapshots(character_id,world_id,items_json,synced_at,next_refresh_at) SELECT '321',world_id,items_json,synced_at,next_refresh_at FROM equipment_snapshots WHERE character_id='123'`,
    )
    .run();
  const { id: second } = await (
    await request(
      "/api/items/evidence",
      "POST",
      { ...evidence, name: "Conflicting helmet" },
      "c",
    )
  ).json();
  const approve = (id) =>
    request(
      "/api/items/review",
      "POST",
      {
        id,
        status: "approved",
        name: id === first ? "First verified name" : "Conflicting name",
        reason: "Verified source evidence for this identity.",
      },
      "b",
    );
  assert.equal((await approve(first)).status, 200);
  assert.equal((await approve(second)).status, 409);
  assert.equal(
    sqlite.prepare("SELECT name FROM item_identifications").get().name,
    "First verified name",
  );
  assert.equal(
    sqlite.prepare("SELECT COUNT(*) n FROM item_evidence_reviews").get().n,
    1,
  );
  assert.equal(
    sqlite.prepare("SELECT status FROM item_evidence WHERE id=?").get(second)
      .status,
    "pending",
  );
});
