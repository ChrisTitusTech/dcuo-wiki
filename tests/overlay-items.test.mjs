import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import {
  createOverlayToken,
  revokeOverlayToken,
  overlayItems,
  submitOverlayItems,
} from "../worker/overlay-items.mjs";
import { evidenceImage, listItemEvidence } from "../worker/item-evidence.mjs";
import { now } from "../worker/security.mjs";
function setup() {
  const sqlite = new DatabaseSync(":memory:");
  for (const f of [
    "0001_accounts",
    "0003_unique_character_claim",
    "0005_equipment_snapshots",
    "0006_item_identifications",
    "0007_overlay_items",
    "0008_item_details",
  ])
    sqlite.exec(readFileSync(`migrations/${f}.sql`, "utf8"));
  const DB = {
    prepare(sql) {
      return {
        bind(...args) {
          args = args.map((a) =>
            a instanceof ArrayBuffer ? new Uint8Array(a) : a,
          );
          return {
            async first() {
              return sqlite.prepare(sql).get(...args) || null;
            },
            async all() {
              return { results: sqlite.prepare(sql).all(...args) };
            },
            async run() {
              return { meta: sqlite.prepare(sql).run(...args) };
            },
          };
        },
      };
    },
    async batch(statements) {
      sqlite.exec("BEGIN");
      try {
        const r = [];
        for (const s of statements) r.push(await s.run());
        sqlite.exec("COMMIT");
        return r;
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
  };
  sqlite
    .prepare("INSERT INTO users VALUES (?,?,?,?)")
    .run("u", "1", "Fixture", now());
  sqlite
    .prepare(
      "INSERT INTO profiles(user_id,character_id,character_name,world_id,census_json,matched_at,updated_at) VALUES (?,?,?,?,?,?,?)",
    )
    .run("u", "123", "Fixture", "2", "{}", now(), now());
  sqlite
    .prepare(
      "INSERT INTO equipment_snapshots(character_id,world_id,items_json,synced_at,next_refresh_at) VALUES (?,?,?,?,?)",
    )
    .run(
      "123",
      "2",
      JSON.stringify([
        { itemId: "999000111", augments: ["999000112"] },
        { itemId: "999000111" },
      ]),
      now(),
      now(),
    );
  return { env: { DB }, sqlite };
}
const user = { id: "u" };
const request = (token, b) =>
  new Request("https://dcuo-wiki.com/api/overlay/items", {
    method: b ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(b ? { body: JSON.stringify(b) } : {}),
  });
const body = () => ({
  schemaVersion: 1,
  character: { id: "123", name: "Fixture", worldId: "2" },
  build: "a".repeat(64),
  profile: "item-names-v1",
  capturedAt: now(),
  items: [{ itemId: "999000111", name: "Fixture Helmet" }],
});
test("tokens are hashed, rotated, bound, expiring and revocable", async () => {
  const { env, sqlite } = setup();
  const a = await createOverlayToken(env, user);
  assert.match(a.token, /^[a-f0-9]{64}$/);
  assert.equal(a.expiresAt, now() + 30 * 86400);
  assert.notEqual(
    sqlite.prepare("SELECT token_hash FROM overlay_tokens").get().token_hash,
    a.token,
  );
  const b = await createOverlayToken(env, user);
  await assert.rejects(overlayItems(request(a.token), env), { status: 401 });
  sqlite.exec("UPDATE profiles SET character_name='Changed'");
  await assert.rejects(overlayItems(request(b.token), env), { status: 401 });
  sqlite.exec("UPDATE profiles SET character_name='Fixture'");
  const expired = await createOverlayToken(env, user);
  sqlite.exec("UPDATE overlay_tokens SET expires_at=1");
  await assert.rejects(overlayItems(request(expired.token), env), {
    status: 401,
  });
  await revokeOverlayToken(env, user);
  assert.equal(
    sqlite.prepare("SELECT count(*) AS n FROM overlay_tokens").get().n,
    0,
  );
});
test("changing a linked character permanently revokes the old token even after relinking", async () => {
  const { env, sqlite } = setup();
  const { token } = await createOverlayToken(env, user);
  sqlite.exec(
    "UPDATE profiles SET character_name='Other'; UPDATE profiles SET character_name='Fixture'",
  );
  await assert.rejects(overlayItems(request(token), env), { status: 401 });
  const next = await createOverlayToken(env, user);
  sqlite.exec("DELETE FROM profiles");
  await assert.rejects(overlayItems(request(next.token), env), { status: 401 });
});
test("queue includes unique unresolved equipment and augments; native submissions publish with an audit", async () => {
  const { env, sqlite } = setup();
  const { token } = await createOverlayToken(env, user);
  assert.deepEqual((await overlayItems(request(token), env)).items, [
    { itemId: "999000111" },
    { itemId: "999000112" },
  ]);
  assert.deepEqual(await submitOverlayItems(request(token, body()), env), {
    submitted: 1,
    skipped: 0,
  });
  assert.deepEqual(await submitOverlayItems(request(token, body()), env), {
    submitted: 0,
    skipped: 1,
  });
  const row = sqlite.prepare("SELECT * FROM item_evidence").get();
  assert.equal(row.status, "approved");
  assert.equal(row.source, "companion");
  assert.equal(JSON.parse(row.capture_json).build, "a".repeat(64));
  assert.equal(
    sqlite.prepare("SELECT count(*) AS n FROM item_identifications").get().n,
    1,
  );
  const audit = sqlite.prepare("SELECT * FROM item_evidence_reviews").get();
  assert.equal(audit.reviewer_id, "u");
  assert.equal(audit.decision, "approved");
  assert.match(audit.reason, /not moderator verified/);
  assert.deepEqual((await overlayItems(request(token), env)).items, [
    { itemId: "999000111" },
    { itemId: "999000112" },
  ]);
  const listing = await listItemEvidence(env, user);
  assert.equal(listing.submissions[0].hasScreenshot, false);
  await assert.rejects(evidenceImage(env, user, row.id, false), {
    status: 404,
  });
});
test("reject stale snapshots, wrong identity, invalid bounds and foreign items", async () => {
  const { env, sqlite } = setup();
  const { token } = await createOverlayToken(env, user);
  for (const mutate of [
    (b) => b.items.push({ ...b.items[0] }),
    (b) => (b.character.worldId = "1"),
    (b) => (b.build = "bad"),
    (b) => (b.capturedAt = 1),
    (b) => (b.items[0].itemId = "1"),
    (b) => (b.items[0].itemId = 999000111),
    (b) => (b.items[0].name = "a\u0000b"),
  ]) {
    const b = body();
    mutate(b);
    await assert.rejects(submitOverlayItems(request(token, b), env));
  }
  sqlite.exec("UPDATE equipment_snapshots SET synced_at=1");
  await assert.rejects(overlayItems(request(token), env), { status: 409 });
});
test("revocation between read and write cannot insert evidence", async () => {
  const { env, sqlite } = setup();
  const { token } = await createOverlayToken(env, user);
  const original = env.DB.batch;
  env.DB.batch = async (statements) => {
    sqlite.exec("DELETE FROM overlay_tokens");
    return original(statements);
  };
  await assert.rejects(submitOverlayItems(request(token, body()), env), {
    status: 401,
  });
  assert.equal(
    sqlite.prepare("SELECT count(*) AS n FROM item_evidence").get().n,
    0,
  );
});

test("publication preserves pending tooltip evidence and its screenshot", async () => {
  const { env, sqlite } = setup();
  const { token } = await createOverlayToken(env, user);
  sqlite
    .prepare(
      `INSERT INTO item_evidence(id,user_id,character_id,character_name,world_id,item_id,proposed_name,evidence,snapshot_json,synced_at,screenshot,screenshot_type,created_at) VALUES ('tooltip','u','123','Fixture','2','999000111','Old tooltip name','Original tooltip observation','[]',?,?,'image/png',?)`,
    )
    .run(now(), new Uint8Array([1, 2, 3]), now());
  assert.deepEqual(await submitOverlayItems(request(token, body()), env), {
    submitted: 1,
    skipped: 0,
  });
  const old = sqlite
    .prepare("SELECT * FROM item_evidence WHERE id='tooltip'")
    .get();
  assert.equal(old.status, "pending");
  assert.equal(old.proposed_name, "Old tooltip name");
  assert.deepEqual([...old.screenshot], [1, 2, 3]);
  assert.equal(
    sqlite.prepare("SELECT name FROM item_identifications").get().name,
    "Fixture Helmet",
  );
});

test("a failed publication audit rolls back evidence and public identity together", async () => {
  const { env, sqlite } = setup();
  const { token } = await createOverlayToken(env, user);
  sqlite.exec(
    "CREATE TRIGGER fail_audit BEFORE INSERT ON item_evidence_reviews BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END",
  );
  await assert.rejects(
    submitOverlayItems(request(token, body()), env),
    /audit unavailable/,
  );
  assert.equal(
    sqlite.prepare("SELECT count(*) AS n FROM item_evidence").get().n,
    0,
  );
  assert.equal(
    sqlite.prepare("SELECT count(*) AS n FROM item_identifications").get().n,
    0,
  );
});

test("an identity published after the initial read is safely skipped", async () => {
  const { env, sqlite } = setup();
  const { token } = await createOverlayToken(env, user);
  const batch = env.DB.batch;
  env.DB.batch = async (statements) => {
    sqlite
      .prepare(
        `INSERT INTO item_evidence(id,user_id,character_id,character_name,world_id,item_id,proposed_name,evidence,snapshot_json,synced_at,screenshot,screenshot_type,created_at,status) VALUES ('winner','u','123','Fixture','2','999000111','Winning name','Earlier publication','[]',?,?,'',?,'approved')`,
      )
      .run(now(), new Uint8Array(0), now());
    sqlite.exec(
      "INSERT INTO item_identifications(item_id,name,evidence_id) VALUES ('999000111','Winning name','winner')",
    );
    return batch(statements);
  };
  assert.deepEqual(await submitOverlayItems(request(token, body()), env), {
    submitted: 0,
    skipped: 1,
  });
  assert.equal(
    sqlite.prepare("SELECT name FROM item_identifications").get().name,
    "Winning name",
  );
  assert.equal(
    sqlite.prepare("SELECT count(*) AS n FROM item_evidence").get().n,
    1,
  );
});

test("changed snapshot rejects incomplete publication and a retry succeeds", async () => {
  const { env, sqlite } = setup();
  const { token } = await createOverlayToken(env, user);
  const batch = env.DB.batch;
  env.DB.batch = async (statements) => {
    sqlite
      .prepare("UPDATE equipment_snapshots SET items_json=?")
      .run(
        JSON.stringify([
          { itemId: "999000111", augments: ["999000112"], quantity: 2 },
        ]),
      );
    return batch(statements);
  };
  await assert.rejects(submitOverlayItems(request(token, body()), env), {
    status: 409,
  });
  assert.equal(
    sqlite.prepare("SELECT count(*) AS n FROM item_identifications").get().n,
    0,
  );
  env.DB.batch = batch;
  assert.deepEqual(await submitOverlayItems(request(token, body()), env), {
    submitted: 1,
    skipped: 0,
  });
});

test("fifty publications use three atomic batch statements", async () => {
  const { env, sqlite } = setup();
  const { token } = await createOverlayToken(env, user);
  const items = Array.from({ length: 50 }, (_, i) => ({
    itemId: String(990000000 + i),
    name: `Fixture Item ${i}`,
  }));
  sqlite
    .prepare("UPDATE equipment_snapshots SET items_json=?")
    .run(JSON.stringify(items));
  const batch = env.DB.batch;
  env.DB.batch = async (statements) => {
    assert.equal(statements.length, 3);
    return batch(statements);
  };
  assert.deepEqual(
    await submitOverlayItems(request(token, { ...body(), items }), env),
    { submitted: 50, skipped: 0 },
  );
  assert.equal(
    sqlite.prepare("SELECT count(*) AS n FROM item_evidence").get().n,
    50,
  );
  assert.equal(
    sqlite.prepare("SELECT count(*) AS n FROM item_identifications").get().n,
    50,
  );
  assert.equal(
    sqlite.prepare("SELECT count(*) AS n FROM item_evidence_reviews").get().n,
    50,
  );
});

test("rich captures enrich already named items and retain their original identity audit", async () => {
  const { env, sqlite } = setup();
  const { token } = await createOverlayToken(env, user);
  await submitOverlayItems(request(token, body()), env);
  const original = sqlite
    .prepare("SELECT evidence_id FROM item_identifications")
    .get().evidence_id;
  const rich = {
    ...body(),
    schemaVersion: 2,
    profile: "item-details-v1",
    items: [
      {
        itemId: "999000111",
        name: "Fixture Helmet",
        details: {
          description: "A protective helmet.",
          style: "Tech Armor",
          requiredLevel: 30,
          requiredCombatRating: 100,
          qualityId: 4,
          categoryId: 2,
          iconResource: "DUIICONSLIBS123/UIICONSLIBS123#321",
        },
      },
    ],
  };
  assert.deepEqual(await submitOverlayItems(request(token, rich), env), {
    submitted: 1,
    skipped: 0,
    iconsUploaded: 0,
    iconsMissing: rich.items.filter((i) => i.details.iconResource).length,
  });
  assert.notEqual(
    sqlite.prepare("SELECT evidence_id FROM item_identifications").get()
      .evidence_id,
    original,
  );
  assert.equal(
    sqlite.prepare("SELECT status FROM item_evidence WHERE id=?").get(original)
      .status,
    "approved",
  );
  const saved = sqlite.prepare("SELECT * FROM item_details").get();
  assert.deepEqual(JSON.parse(saved.details_json), rich.items[0].details);
  const { itemIdentities, describeItem } =
    await import("../worker/item-identities.mjs");
  const publicItem = describeItem(
    "999000111",
    await itemIdentities(env, ["999000111"]),
  );
  assert.equal(publicItem.details.style, "Tech Armor");
  assert.equal(
    sqlite.prepare("SELECT count(*) AS n FROM item_evidence_reviews").get().n,
    2,
  );
  assert.deepEqual((await overlayItems(request(token), env)).items, [
    { itemId: "999000111" },
    { itemId: "999000112" },
  ]);
  for (const details of [
    { requiredLevel: 256 },
    { description: "a\u0000b" },
    { iconResource: "../../evil" },
    { iconPng: "abc" },
    { style: "" },
    { qualityId: -1 },
  ]) {
    await assert.rejects(
      submitOverlayItems(
        request(token, { ...rich, items: [{ ...rich.items[0], details }] }),
        env,
      ),
      { status: 400 },
    );
  }
  const batch = env.DB.batch;
  env.DB.batch = async (statements) => {
    sqlite.exec("DELETE FROM overlay_tokens");
    return batch(statements);
  };
  await assert.rejects(submitOverlayItems(request(token, rich), env), {
    status: 401,
  });
  assert.equal(
    sqlite.prepare("SELECT count(*) AS n FROM item_evidence").get().n,
    2,
  );
});

test("rich publication audit failure also rolls back details", async () => {
  const { env, sqlite } = setup();
  const { token } = await createOverlayToken(env, user);
  sqlite.exec(
    "CREATE TRIGGER fail_rich_audit BEFORE INSERT ON item_evidence_reviews BEGIN SELECT RAISE(ABORT,'audit unavailable'); END",
  );
  await assert.rejects(
    submitOverlayItems(
      request(token, {
        ...body(),
        schemaVersion: 2,
        profile: "item-details-v1",
        items: [
          {
            ...body().items[0],
            details: { description: "Fixture definition" },
          },
        ],
      }),
      env,
    ),
    /audit unavailable/,
  );
  assert.equal(
    sqlite.prepare("SELECT count(*) AS n FROM item_details").get().n,
    0,
  );
  assert.equal(
    sqlite.prepare("SELECT count(*) AS n FROM item_evidence").get().n,
    0,
  );
});

test("catalog captures create and update non-equipped definitions without copying character values globally", async () => {
  const { env, sqlite } = setup();
  const { token } = await createOverlayToken(env, user);
  const rich = {
    ...body(),
    schemaVersion: 2,
    profile: "item-details-v1",
    scope: "catalog",
    items: [
      {
        itemId: "990000888",
        name: "New Catalog Item",
        details: { description: "A newly observed item.", style: "Tech" },
      },
    ],
    equipped: [],
  };
  assert.deepEqual(await submitOverlayItems(request(token, rich), env), {
    submitted: 1,
    skipped: 0,
    iconsUploaded: 0,
    iconsMissing: rich.items.filter((i) => i.details.iconResource).length,
  });
  rich.items[0].name = "Corrected Catalog Item";
  rich.items[0].details.description = "Updated item description";
  assert.deepEqual(await submitOverlayItems(request(token, rich), env), {
    submitted: 1,
    skipped: 0,
    iconsUploaded: 0,
    iconsMissing: rich.items.filter((i) => i.details.iconResource).length,
  });
  assert.equal(
    sqlite.prepare("SELECT name FROM item_identifications").get().name,
    "Corrected Catalog Item",
  );
  const { findCompanionArticle, listCompanionItems } =
    await import("../worker/companion-catalog.mjs");
  const article = await findCompanionArticle("Item_990000888", env);
  assert.equal(article.title, "Corrected Catalog Item");
  assert.match(article.summary, /Updated item description/);
  const catalog = await listCompanionItems(
    new URL("https://dcuo-wiki.com/api/companion/items"),
    env,
  );
  assert.equal(catalog.items[0].href, "/wiki/Item_990000888/");
  const before = sqlite
    .prepare("SELECT count(*) AS n FROM item_evidence")
    .get().n;
  await assert.rejects(
    submitOverlayItems(
      request(token, { ...rich, capturedAt: rich.capturedAt - 1 }),
      env,
    ),
    { status: 409 },
  );
  assert.equal(
    sqlite.prepare("SELECT count(*) AS n FROM item_evidence").get().n,
    before,
  );
  await assert.rejects(
    submitOverlayItems(request(token, { ...rich, scope: "equipment" }), env),
    { status: 409 },
  );
  await assert.rejects(
    submitOverlayItems(
      request(token, {
        ...rich,
        items: [{ ...rich.items[0], details: { qualityId: 1 } }],
      }),
      env,
    ),
    { status: 400 },
  );
});

test("equipped captures keep identical item IDs independent by character, world and slot", async () => {
  const { env, sqlite } = setup();
  const { token } = await createOverlayToken(env, user);
  sqlite.prepare("UPDATE equipment_snapshots SET items_json=?").run(
    JSON.stringify([
      { itemId: "999000111", slot: "24", augments: [] },
      { itemId: "999000111", slot: "25", augments: [] },
    ]),
  );
  const rich = {
    ...body(),
    schemaVersion: 2,
    profile: "item-details-v1",
    items: [
      {
        ...body().items[0],
        details: { description: "Shared item definition" },
      },
    ],
    equipped: [
      {
        slot: "24",
        itemId: "999000111",
        itemLevel: 381,
        baseStats: [{ name: "Might", value: 123 }],
      },
      {
        slot: "25",
        itemId: "999000111",
        itemLevel: 407,
        baseStats: [{ name: "Might", value: 456 }],
      },
    ],
  };
  await submitOverlayItems(request(token, rich), env);
  const { equipment } = await import("../worker/equipment.mjs");
  const result = await equipment(env, { character_id: "123", world_id: "2" });
  assert.equal(result.items[0].equipped.itemLevel, 381);
  assert.equal(result.items[1].equipped.itemLevel, 407);
  assert.equal(result.items[1].equipped.baseStats[0].value, 456);
  assert.equal(result.items[0].details.itemLevel, undefined);
  const foreign = await equipment(env, { character_id: "123", world_id: "3" });
  assert.equal(foreign.items, null);
  sqlite
    .prepare("UPDATE equipment_snapshots SET items_json=?")
    .run(JSON.stringify([{ itemId: "999000112", slot: "24", augments: [] }]));
  assert.equal(
    (await equipment(env, { character_id: "123", world_id: "2" })).items[0]
      .equipped,
    undefined,
  );
  await assert.rejects(submitOverlayItems(request(token, rich), env), {
    status: 409,
  });
});

test("equipment pagination reaches every ID and supports recapturing known definitions", async () => {
  const { env, sqlite } = setup();
  const { token } = await createOverlayToken(env, user);
  const items = Array.from({ length: 80 }, (_, i) => ({
    itemId: String(990000000 + i),
    slot: String(i),
    augments: [],
  }));
  sqlite
    .prepare("UPDATE equipment_snapshots SET items_json=?")
    .run(JSON.stringify(items));
  const first = await overlayItems(request(token), env);
  assert.equal(first.items.length, 50);
  assert.equal(first.nextCursor, "990000049");
  const nextRequest = new Request(
    "https://dcuo-wiki.com/api/overlay/items?cursor=" + first.nextCursor,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  const second = await overlayItems(nextRequest, env);
  assert.equal(second.items.length, 30);
  assert.equal(second.items[0].itemId, "990000050");
  assert.equal(second.nextCursor, undefined);
  assert.equal(
    new Set([...first.items, ...second.items].map((i) => i.itemId)).size,
    80,
  );
  const bad = new Request("https://dcuo-wiki.com/api/overlay/items?cursor=01", {
    headers: { Authorization: `Bearer ${token}` },
  });
  await assert.rejects(overlayItems(bad, env), { status: 400 });
});

test("revoking rich evidence removes its public details, article and equipped values", async () => {
  const { env, sqlite } = setup();
  const { token } = await createOverlayToken(env, user);
  sqlite
    .prepare("UPDATE equipment_snapshots SET items_json=?")
    .run(JSON.stringify([{ itemId: "999000111", slot: "1", augments: [] }]));
  await submitOverlayItems(
    request(token, {
      ...body(),
      schemaVersion: 2,
      profile: "item-details-v1",
      items: [
        {
          ...body().items[0],
          details: { description: "Revocable item description." },
        },
      ],
      equipped: [{ slot: "1", itemId: "999000111", itemLevel: 450 }],
    }),
    env,
  );
  const evidence = sqlite
    .prepare("SELECT evidence_id FROM item_identifications")
    .get().evidence_id;
  const { reviewItemEvidence } = await import("../worker/item-evidence.mjs");
  await reviewItemEvidence(
    request(token, {
      id: evidence,
      status: "revoked",
      reason: "The contributed definition is incorrect.",
    }),
    env,
    user,
  );
  assert.equal(
    sqlite.prepare("SELECT count(*) AS n FROM item_details").get().n,
    0,
  );
  assert.equal(
    sqlite.prepare("SELECT count(*) AS n FROM equipment_item_details").get().n,
    0,
  );
  const { findCompanionArticle } =
    await import("../worker/companion-catalog.mjs");
  assert.equal(await findCompanionArticle("Item_999000111", env), null);
  const { itemIdentities, describeItem } =
    await import("../worker/item-identities.mjs");
  assert.equal(
    describeItem("999000111", await itemIdentities(env, ["999000111"])).href,
    undefined,
  );
});

test("the complete native effect bound fits the equipped API contract", async () => {
  const { env, sqlite } = setup();
  const { token } = await createOverlayToken(env, user);
  sqlite
    .prepare("UPDATE equipment_snapshots SET items_json=?")
    .run(JSON.stringify([{ itemId: "999000111", slot: "1", augments: [] }]));
  const effects = Array.from({ length: 128 }, (_, i) => "Effect " + i);
  const rich = {
    ...body(),
    schemaVersion: 2,
    profile: "item-details-v1",
    items: [{ ...body().items[0], details: { description: "A definition" } }],
    equipped: [{ slot: "1", itemId: "999000111", effects }],
  };
  await submitOverlayItems(request(token, rich), env);
  assert.equal(
    JSON.parse(
      sqlite.prepare("SELECT details_json FROM equipment_item_details").get()
        .details_json,
    ).effects.length,
    128,
  );
  rich.equipped[0].effects.push("Overflow");
  await assert.rejects(submitOverlayItems(request(token, rich), env), {
    status: 400,
  });
});

const catalogBody = () => ({
  ...body(),
  schemaVersion: 2,
  profile: "item-details-v1",
  scope: "catalog",
  missingOnly: true,
  items: [
    {
      itemId: "999000111",
      name: "Fixture Helmet",
      details: { description: "Protective armor." },
    },
  ],
});
const lookupRequest = (token, query) =>
  new Request(`https://dcuo-wiki.com/api/overlay/items?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
test("arbitrary ID lookup skips static and name-only identities with explicit capability", async () => {
  const { sourceItems } = await import("../worker/item-identities.mjs");
  const staticId = [...sourceItems.keys()].find(
    (value) => Number(value) <= 4294967295,
  );
  const { env } = setup();
  const { token } = await createOverlayToken(env, user);
  await submitOverlayItems(request(token, body()), env);
  const result = await overlayItems(
    lookupRequest(token, `ids=${staticId},999000111,999000113`),
    env,
  );
  assert.deepEqual(result.items, [{ itemId: "999000113" }]);
  assert.equal(result.missingOnlySupported, true);
  assert.deepEqual(result.character, body().character);
  for (const query of [
    "ids=",
    "ids=0",
    "ids=01",
    "ids=-1",
    "ids=4294967296",
    "ids=1,1",
    "ids=1&cursor=2",
    "ids=1&ids=2",
    `ids=${Array.from({ length: 51 }, (_, i) => i + 1).join(",")}`,
  ])
    await assert.rejects(overlayItems(lookupRequest(token, query), env), {
      status: 400,
    });
});
test("missing-only catalog skips known names and static identities while manual updates remain available", async () => {
  const { sourceItems } = await import("../worker/item-identities.mjs");
  const staticId = [...sourceItems.keys()].find(
    (value) => Number(value) <= 4294967295,
  );
  const { env, sqlite } = setup();
  const { token } = await createOverlayToken(env, user);
  await submitOverlayItems(request(token, body()), env);
  const b = catalogBody();
  b.items.push(
    { ...b.items[0], itemId: staticId },
    { ...b.items[0], itemId: "999000113" },
  );
  assert.deepEqual(await submitOverlayItems(request(token, b), env), {
    submitted: 1,
    skipped: 2,
    missingOnlySupported: true,
    iconsUploaded: 0,
    iconsMissing: 0,
  });
  assert.equal(
    sqlite.prepare("SELECT count(*) n FROM item_details").get().n,
    1,
  );
  b.items = [b.items[0]];
  b.missingOnly = false;
  assert.equal((await submitOverlayItems(request(token, b), env)).submitted, 1);
});
test("missing-only catalog atomically skips a concurrent identity without overwriting it", async () => {
  const { env, sqlite } = setup();
  const { token } = await createOverlayToken(env, user);
  const batch = env.DB.batch;
  env.DB.batch = async (statements) => {
    await submitOverlayItems(request(token, body()), {
      DB: { ...env.DB, batch },
    });
    return batch(statements);
  };
  assert.deepEqual(
    await submitOverlayItems(request(token, catalogBody()), env),
    {
      submitted: 0,
      skipped: 1,
      missingOnlySupported: true,
      iconsUploaded: 0,
      iconsMissing: 0,
    },
  );
  assert.equal(
    sqlite.prepare("SELECT count(*) n FROM item_details").get().n,
    0,
  );
  assert.equal(
    sqlite.prepare("SELECT count(*) n FROM item_evidence").get().n,
    1,
  );
});
test("missing-only rejects malformed flags and incompatible publication scopes", async () => {
  const { env } = setup();
  const { token } = await createOverlayToken(env, user);
  for (const b of [
    { ...body(), missingOnly: true },
    { ...catalogBody(), scope: "equipment" },
    { ...catalogBody(), missingOnly: "true" },
    { ...catalogBody(), missingOnly: null },
  ])
    await assert.rejects(submitOverlayItems(request(token, b), env), {
      status: 400,
    });
});
