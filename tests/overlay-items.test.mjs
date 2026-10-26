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
