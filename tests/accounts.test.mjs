import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { handle } from "../worker/index.mjs";
import { hash, now } from "../worker/security.mjs";
const origin = "https://dcuo-wiki.com";
const character = {
  character_id: "123",
  name: "Test Hero",
  world_id: "2",
  level: "30",
  combat_rating: "100",
  skill_points: "90",
  deleted: "false",
};
function db() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync("migrations/0001_accounts.sql", "utf8"));
  sqlite.exec(readFileSync("migrations/0002_article_revisions.sql", "utf8"));
  return {
    sqlite,
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
      return Promise.all(statements.map((s) => s.run()));
    },
  };
}
async function setup() {
  const DB = db();
  const env = {
    DB,
    DISCORD_CLIENT_ID: "client",
    DISCORD_CLIENT_SECRET: "test-only",
    CENSUS_SERVICE_ID: "testservice",
    SITE_ORIGIN: origin,
    ASSETS: { fetch: () => new Response("asset") },
  };
  const token = "a".repeat(64),
    user = "11111111-1111-4111-8111-111111111111";
  DB.sqlite
    .prepare("INSERT INTO users VALUES (?,?,?,?)")
    .run(user, "100", "tester", now());
  DB.sqlite
    .prepare("INSERT INTO sessions VALUES (?,?,?)")
    .run(await hash(token), user, now() + 600);
  const request = (path, method = "GET", body, headers = {}) =>
    new Request(origin + path, {
      method,
      headers: {
        Cookie: `__Host-dcuo-session=${token}`,
        Origin: origin,
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...headers,
      },
      ...(body
        ? { body: typeof body === "string" ? body : JSON.stringify(body) }
        : {}),
    });
  const fetcher = async () => Response.json({ character_list: [character] });
  const call = (path, method, body, headers) =>
    handle(request(path, method, body, headers), env, fetcher);
  return { env, DB, user, request, call, fetcher };
}
test("unconfigured deployment fails closed and leaves static assets available", async () => {
  const env = { ASSETS: { fetch: () => new Response("asset") } };
  assert.equal((await handle(new Request(origin + "/"), env)).status, 200);
  assert.equal(
    (
      await handle(
        new Request(origin + "/api/contributions", { method: "POST" }),
        env,
      )
    ).status,
    503,
  );
  assert.deepEqual(
    await (await handle(new Request(origin + "/api/status"), env)).json(),
    { login: false, census: false },
  );
});
test("Discord login restricts scope, stores only nonce hash, and emits secure cookie", async () => {
  const { call, DB } = await setup();
  const r = await call("/api/auth/discord");
  assert.equal(r.status, 302);
  const location = new URL(r.headers.get("location"));
  assert.equal(location.origin, "https://discord.com");
  assert.equal(location.searchParams.get("scope"), "identify");
  const state = location.searchParams.get("state");
  assert.equal(
    DB.sqlite.prepare("SELECT token_hash FROM oauth_states").get().token_hash,
    await hash(state),
  );
  assert.match(r.headers.get("set-cookie"), /HttpOnly; Secure; SameSite=Lax/);
});
test("OAuth callback binds state to browser, consumes it once, creates hashed session and discards tokens", async () => {
  const { call, env, DB } = await setup();
  const start = await call("/api/auth/discord?page=Cape%20Carmine");
  const state = new URL(start.headers.get("location")).searchParams.get(
    "state",
  );
  const url =
    origin +
    `/api/auth/callback?code=code&state=${state}&iss=https%3A%2F%2Fdiscord.com`;
  let calls = [];
  const fetcher = async (url) => {
    calls.push(String(url));
    if (String(url).endsWith("/token"))
      return Response.json({ access_token: "transient" });
    if (String(url).endsWith("/@me"))
      return Response.json({ id: "200", username: "player" });
    return new Response(null, { status: 200 });
  };
  assert.equal((await handle(new Request(url), env, fetcher)).status, 400);
  assert.equal(calls.length, 0);
  const request = () =>
    new Request(url, { headers: { Cookie: `__Host-dcuo-state=${state}` } });
  const result = await handle(request(), env, fetcher);
  assert.equal(result.status, 302);
  assert.equal(result.headers.get("location"), "/account/?page=Cape%20Carmine");
  assert.ok(calls.some((c) => c.endsWith("/revoke")));
  const token = result.headers
    .get("set-cookie")
    .match(/__Host-dcuo-session=([a-f0-9]+)/)[1];
  assert.ok(
    DB.sqlite
      .prepare("SELECT user_id FROM sessions WHERE token_hash=?")
      .get(await hash(token)),
  );
  assert.equal((await handle(request(), env, fetcher)).status, 400);
});
test("anonymous, expired sessions and cross-site requests cannot write", async () => {
  const { env, call, DB } = await setup();
  assert.equal(
    (
      await handle(
        new Request(origin + "/api/contributions", {
          method: "POST",
          headers: { Origin: origin },
        }),
        env,
      )
    ).status,
    401,
  );
  assert.equal(
    (await call("/api/profile", "POST", {}, { Origin: "https://evil.example" }))
      .status,
    403,
  );
  DB.sqlite.exec("UPDATE sessions SET expires_at=0");
  assert.equal((await call("/api/profile", "POST", {})).status, 401);
});
test("Census names are exact, server-selected, and no match cannot unlock contributions", async () => {
  const { call, request, env } = await setup();
  assert.equal(
    (await call("/api/contributions", "POST", { verified: true })).status,
    403,
  );
  assert.equal((await call("/api/characters?name=*Hero")).status, 400);
  assert.equal(
    (await (await call("/api/characters?name=Other")).json()).characters.length,
    0,
  );
  assert.equal(
    (
      await call("/api/profile", "POST", {
        characterId: "999",
        name: "Test Hero",
      })
    ).status,
    403,
  );
  const response = await handle(
    request("/api/profile", "POST", { characterId: "123", name: "Test Hero" }),
    env,
    async () => Response.json({ error: "service_unavailable" }),
  );
  assert.equal(response.status, 503);
  assert.equal((await (await call("/api/me")).json()).profile, null);
});
test("matching name saves profile and submissions remain pending; Census outages block submission", async () => {
  const { call, request, env, DB } = await setup();
  const saved = await call("/api/profile", "POST", {
    characterId: "123",
    name: "test hero",
    bio: "Hello",
    verified: true,
  });
  assert.equal(saved.status, 200);
  const p = (await saved.json()).profile;
  assert.equal(p.character.name, "Test Hero");
  const publicProfile = await (await call(`/api/profiles/${p.id}`)).json();
  assert.ok(!("discord_id" in publicProfile));
  const contribution = {
    page: "New quest",
    suggestion: "A useful correction with enough context for the reviewer.",
    sources: "In-game map and quest evidence",
  };
  assert.equal(
    (
      await handle(
        request("/api/contributions", "POST", contribution),
        env,
        async () => {
          throw new Error("offline");
        },
      )
    ).status,
    503,
  );
  const result = await call("/api/contributions", "POST", contribution);
  assert.equal(result.status, 201);
  assert.equal((await result.json()).status, "pending");
  assert.equal(
    DB.sqlite.prepare("SELECT COUNT(*) AS n FROM contributions").get().n,
    1,
  );
  assert.equal((await call("/api/moderation")).status, 403);
  env.DISCORD_MODERATOR_IDS = "100";
  assert.equal(
    (await (await call("/api/moderation")).json()).contributions.length,
    1,
  );
});
test("screenshots enforce auth, size, type and same origin; replace and delete without exposing Discord ID", async () => {
  const { call, request, env, user } = await setup();
  await call("/api/profile", "POST", { characterId: "123", name: "Test Hero" });
  const upload = (bytes) =>
    new Request(origin + "/api/profile/screenshot", {
      method: "POST",
      headers: {
        Cookie: "__Host-dcuo-session=" + "a".repeat(64),
        Origin: origin,
      },
      body: bytes,
    });
  assert.equal(
    (
      await handle(
        upload(new TextEncoder().encode('<svg onload="evil()"/>')),
        env,
      )
    ).status,
    415,
  );
  assert.equal((await handle(upload(new Uint8Array(262145)), env)).status, 413);
  const image = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  assert.equal((await handle(upload(image), env)).status, 200);
  const get = await call(`/api/profiles/${user}/screenshot`);
  assert.equal(get.headers.get("content-type"), "image/png");
  assert.match(get.headers.get("content-security-policy"), /sandbox/);
  assert.deepEqual(
    new Uint8Array(await get.arrayBuffer()),
    new Uint8Array(image),
  );
  assert.equal((await call("/api/profile/screenshot", "DELETE")).status, 200);
  assert.equal((await call(`/api/profiles/${user}/screenshot`)).status, 404);
});
test("Census throttling prevents unlimited repeated lookup", async () => {
  const { call } = await setup();
  for (let i = 0; i < 15; i++)
    assert.equal((await call("/api/characters?name=Test%20Hero")).status, 200);
  assert.equal((await call("/api/characters?name=Test%20Hero")).status, 429);
});
test("logout revokes server session", async () => {
  const { call } = await setup();
  assert.equal((await call("/api/auth/logout", "POST", {})).status, 200);
  assert.equal((await call("/api/me")).status, 401);
});

test("matched players publish revisions, reject stale writes, and retain public history", async () => {
  const { call, env, fetcher, request } = await setup();
  const path = "/api/articles/Powers";
  const before = (await (await call(path)).json()).parts[0];
  const edit = {
    part: before.id,
    baseHash: before.baseHash,
    revision: before.revision,
    content: "Updated powers guidance checked in game.",
    reason: "Correct outdated power guidance.",
    sources: "Verified against the in-game power menu.",
  };
  assert.equal(
    (await handle(new Request(origin + path, { method: "POST" }), env, fetcher))
      .status,
    403,
  );
  assert.equal((await call(path, "POST", edit)).status, 403);
  await call("/api/profile", "POST", {
    characterId: "123",
    name: character.name,
  });
  assert.equal(
    (await call(path, "POST", edit, { Origin: "https://evil.example" })).status,
    403,
  );
  assert.equal((await call(path, "POST", edit)).status, 201);
  assert.equal((await call(path, "POST", edit)).status, 409);
  const after = (await (await call(path)).json()).parts[0];
  assert.equal(after.text, edit.content);
  assert.ok(after.revision > 0);
  const history = await (
    await handle(new Request(origin + path + "/history"), env, fetcher)
  ).json();
  assert.equal(history.revisions[0].previous_content, before.text);
  assert.equal(history.revisions[0].content, edit.content);
  assert.equal(history.revisions[0].character_name, character.name);
  assert.equal(JSON.stringify(history).includes("discord_id"), false);
  assert.equal(
    (
      await call(path, "POST", {
        ...edit,
        revision: after.revision,
        content: before.text,
        reason: "Restore previous accurate summary.",
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await handle(
        request(path, "POST", { ...edit, revision: after.revision }),
        env,
        async () => Response.json({ character_list: [] }),
      )
    ).status,
    409,
  );
});

test("live publishing rechecks Census and rejects unsafe links or malformed tables", async () => {
  const { call, env, request } = await setup();
  await call("/api/profile", "POST", {
    characterId: "123",
    name: character.name,
  });
  const path = "/api/articles/Grab_and_Smash";
  const parts = (await (await call(path)).json()).parts;
  const part = parts.find((p) => p.id === "location-maps");
  const payload = {
    part: part.id,
    revision: part.revision,
    baseHash: part.baseHash,
    content: "Map | javascript:alert(1)",
    reason: "Replace the map reference.",
    sources: "Verified against in-game map.",
  };
  assert.equal((await call(path, "POST", payload)).status, 400);
  const good = { ...payload, content: "Map | https://example.com/map" };
  assert.equal(
    (
      await handle(request(path, "POST", good), env, async () =>
        Response.json({ character_list: [] }),
      )
    ).status,
    403,
  );
  assert.equal((await call(path, "POST", good)).status, 201);
  const history = await (await call(path + "/history")).json();
  assert.equal(history.revisions.length, 1);
});
