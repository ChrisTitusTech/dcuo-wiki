import {
  HttpError,
  now,
  random,
  hash,
  cookie,
  setCookie,
  json,
  bodyJson,
  boundedBody,
  textField,
  imageType,
} from "./security.mjs";
import {
  findArticle,
  serveArticle,
  serveIndex,
  articleState,
  getDocumentState,
} from "./articles.mjs";
import { renderPart } from "../shared/article-content.mjs";
import {
  validateDocument,
  renderDocument,
  DOCUMENT_BYTES,
} from "../shared/rich-article.mjs";
import { pristineDocumentResponse } from "./editor-baselines.mjs";
import media from "../data/media.json" with { type: "json" };
import { searchCharacters, matchCharacter } from "./census.mjs";
import { serveCatalogMedia } from "./catalog-media.mjs";
const SESSION = "__Host-dcuo-session",
  STATE = "__Host-dcuo-state";
const WEEK = 7 * 86400;
const ready = (env) =>
  !!(env.DB && env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET);
const moderator = (env, user) =>
  (env.DISCORD_MODERATOR_IDS || "")
    .split(",")
    .map((v) => v.trim())
    .includes(user.discord_id);
const stmt = (env, sql, ...args) => env.DB.prepare(sql).bind(...args);
async function limit(env, key, maximum, seconds) {
  const bucket = Math.floor(now() / seconds);
  const row = await stmt(
    env,
    `INSERT INTO rate_limits(key,count,expires_at) VALUES (?,1,?)
    ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count`,
    `${key}:${bucket}`,
    (bucket + 1) * seconds,
  ).first();
  if (row.count > maximum)
    throw new HttpError(429, "Too many attempts. Please wait and try again.");
}
async function session(request, env) {
  const token = cookie(request, SESSION);
  if (!/^[a-f0-9]{64}$/.test(token))
    throw new HttpError(401, "Sign in with Discord first.");
  const user = await stmt(
    env,
    `SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id
    WHERE token_hash=? AND expires_at>?`,
    await hash(token),
    now(),
  ).first();
  if (!user)
    throw new HttpError(401, "Your session has expired. Sign in again.");
  return user;
}
function redirect(location, cookies = []) {
  const headers = new Headers({
    Location: location,
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  });
  for (const c of cookies) headers.append("Set-Cookie", c);
  return new Response(null, { status: 302, headers });
}
async function oauth(request, env, path, fetcher) {
  const origin = env.SITE_ORIGIN || "https://dcuo-wiki.com";
  const redirectUri = `${origin}/api/auth/callback`;
  if (path === "/api/auth/discord") {
    await limit(
      env,
      `login:${await hash(request.headers.get("CF-Connecting-IP") || "local")}`,
      20,
      600,
    );
    const state = random();
    await stmt(
      env,
      "INSERT INTO oauth_states(token_hash,expires_at,page_title) VALUES (?,?,?)",
      await hash(state),
      now() + 600,
      (new URL(request.url).searchParams.get("page") || "").slice(0, 120),
    ).run();
    const target = new URL("https://discord.com/oauth2/authorize");
    target.search = new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "identify",
      state,
    }).toString();
    return redirect(target.toString(), [setCookie(STATE, state, 600)]);
  }
  const url = new URL(request.url),
    state = url.searchParams.get("state");
  if (
    !state ||
    !/^[a-f0-9]{64}$/.test(state) ||
    cookie(request, STATE) !== state
  )
    throw new HttpError(
      400,
      "Sign-in expired or invalid. Start again from your player profile.",
    );
  // DELETE RETURNING consumes the nonce atomically, including denied sign-ins.
  const nonce = await stmt(
    env,
    "DELETE FROM oauth_states WHERE token_hash=? AND expires_at>? RETURNING token_hash,page_title",
    await hash(state),
    now(),
  ).first();
  if (!nonce)
    throw new HttpError(400, "Sign-in expired or already used. Start again.");
  if (url.searchParams.has("error"))
    return redirect("/account/?login=cancelled", [setCookie(STATE, "", 0)]);
  if (
    url.searchParams.has("iss") &&
    url.searchParams.get("iss") !== "https://discord.com"
  )
    throw new HttpError(400, "Unexpected sign-in provider.");
  const code = url.searchParams.get("code");
  if (!code || code.length > 4096)
    throw new HttpError(400, "Missing sign-in code.");
  let token, identity;
  try {
    const res = await fetcher("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.DISCORD_CLIENT_ID,
        client_secret: env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
      signal: AbortSignal.timeout(10000),
    });
    token = await res.json();
    if (!res.ok || typeof token.access_token !== "string") throw new Error();
    const who = await fetcher("https://discord.com/api/users/@me", {
      headers: { Authorization: `Bearer ${token.access_token}` },
      signal: AbortSignal.timeout(10000),
    });
    identity = await who.json();
    if (
      !who.ok ||
      !/^\d{1,30}$/.test(identity.id) ||
      typeof identity.username !== "string"
    )
      throw new Error();
  } catch {
    throw new HttpError(502, "Discord sign-in failed. Please start again.");
  } finally {
    if (typeof token?.access_token === "string") {
      // No Discord tokens are retained after identity lookup.
      try {
        await fetcher("https://discord.com/api/oauth2/token/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: env.DISCORD_CLIENT_ID,
            client_secret: env.DISCORD_CLIENT_SECRET,
            token: token.access_token,
          }),
          signal: AbortSignal.timeout(5000),
        });
      } catch {
        /* Token is still discarded locally. */
      }
    }
  }
  const user = await stmt(
    env,
    `INSERT INTO users(id,discord_id,display_name,created_at) VALUES (?,?,?,?)
    ON CONFLICT(discord_id) DO UPDATE SET display_name=excluded.display_name RETURNING id`,
    crypto.randomUUID(),
    identity.id,
    identity.username.slice(0, 80),
    now(),
  ).first();
  const tokenValue = random();
  await env.DB.batch([
    stmt(env, "DELETE FROM sessions WHERE expires_at<=?", now()),
    stmt(env, "DELETE FROM oauth_states WHERE expires_at<=?", now()),
    stmt(env, "DELETE FROM rate_limits WHERE expires_at<=?", now()),
    stmt(
      env,
      "INSERT INTO sessions VALUES (?,?,?)",
      await hash(tokenValue),
      user.id,
      now() + WEEK,
    ),
  ]);
  return redirect(
    nonce.page_title
      ? `/account/?page=${encodeURIComponent(nonce.page_title)}`
      : "/account/",
    [setCookie(SESSION, tokenValue, WEEK), setCookie(STATE, "", 0)],
  );
}
async function profile(env, id) {
  const p = await stmt(
    env,
    "SELECT user_id,character_id,character_name,world_id,census_json,matched_at,bio,updated_at,screenshot_type FROM profiles WHERE user_id=?",
    id,
  ).first();
  if (!p) return null;
  return {
    id: p.user_id,
    character: JSON.parse(p.census_json),
    matchedAt: p.matched_at,
    bio: p.bio,
    updatedAt: p.updated_at,
    screenshot: p.screenshot_type
      ? `/api/profiles/${p.user_id}/screenshot`
      : null,
  };
}
export async function handle(request, env, fetcher = fetch) {
  const url = new URL(request.url),
    path = url.pathname;
  try {
    if (path === "/api/catalog-corrections" && request.method === "GET") {
      if (!env.DB) return json({ corrections: [] });
      const rows = await env.DB.prepare(
        `WITH latest AS (
        SELECT MAX(id) AS id FROM article_revisions WHERE part IN ('document','summary') GROUP BY slug,part
      ) SELECT slug,part,base_hash,
        CASE WHEN part='document' THEN json_extract(content,'$.title') ELSE NULL END AS title,
        CASE WHEN part='document' THEN json_extract(content,'$.summary') ELSE content END AS summary
        FROM article_revisions WHERE id IN (SELECT id FROM latest) ORDER BY id DESC`,
      ).all();
      return json({ corrections: rows.results });
    }
    if (
      path.startsWith("/api/catalog-media/") &&
      ["GET", "HEAD"].includes(request.method)
    )
      return await serveCatalogMedia(request, env, fetcher);
    if (
      (path === "/" ||
        /^\/guides\/?$/.test(path) ||
        /^\/story\/?$/.test(path) ||
        /^\/releases\/[^/]+\/?$/.test(path)) &&
      ["GET", "HEAD"].includes(request.method)
    )
      return await serveIndex(request, env);
    if (path.startsWith("/wiki/") && ["GET", "HEAD"].includes(request.method))
      return await serveArticle(request, env);
    if (!path.startsWith("/api/")) return env.ASSETS.fetch(request);
    const articleRoute = path.match(
      /^\/api\/articles\/([^/]+)(?:\/(history|document|preview|media)(?:\/(\d+))?)?$/,
    );
    if (articleRoute && request.method === "GET") {
      if (articleRoute[2] === "document" && !articleRoute[3]) {
        if (!env.DB) throw new HttpError(503, "Live editing is unavailable.");
        const slug = decodeURIComponent(articleRoute[1]);
        if (!/^[A-Za-z0-9_-]+$/.test(slug))
          throw new HttpError(404, "Article not found.");
        let response;
        try {
          response = await pristineDocumentResponse(env, { slug });
        } catch (error) {
          // Check existence only on the failure path, preserving the cheap
          // prepared response for real articles and a permanent 404 for others.
          if (error.status === 503) await findArticle(slug, env);
          throw error;
        }
        if (response) return response;
      }
      const article = await findArticle(
        decodeURIComponent(articleRoute[1]),
        env,
      );
      if (!env.DB) throw new HttpError(503, "Live editing is unavailable.");
      if (articleRoute[3] && articleRoute[2] !== "history")
        throw new HttpError(404, "Endpoint not found.");
      if (articleRoute[2] === "document") {
        const response = await pristineDocumentResponse(env, article);
        return (
          response ||
          json(await getDocumentState(env, article, { prebuilt: false }))
        );
      }
      if (articleRoute[2] === "media") {
        const query = (url.searchParams.get("q") || "")
          .toLowerCase()
          .slice(0, 120);
        const state = query ? null : await getDocumentState(env, article);
        const current = new Map();
        const walk = (n) => {
          if (n.type === "image")
            current.set(n.attrs.src, n.attrs.alt || "Article image");
          (n.content || []).forEach(walk);
        };
        if (state) walk(state.document.content);
        const importedImages = (
          state
            ? [...current].map(([src, label]) => ({ src, label }))
            : article.sections.flatMap((s) =>
                (s.images || []).map((i) => ({ src: i.url, label: i.label })),
              )
        )
          .filter((i) =>
            /^https:\/\/dcuo-wiki\.com\/api\/catalog-media\/[a-f0-9]{64}$/.test(
              i.src,
            ),
          )
          .filter(
            (i) =>
              !query ||
              query
                .split(/\s+/)
                .every((term) =>
                  (i.label + " " + article.title).toLowerCase().includes(term),
                ),
          )
          .map((i) => ({
            src: i.src,
            source: i.src + "/source",
            label: i.label,
            credit:
              "DC Universe Online Wiki contributors; game artwork belongs to its respective owners.",
          }));
        return json({
          images: media
            .filter((m) =>
              query
                ? query
                    .split(/\s+/)
                    .filter(Boolean)
                    .every((term) =>
                      (m.sourcePage + " " + m.discoveredOn)
                        .toLowerCase()
                        .replace(/[^a-z0-9]/g, "")
                        .includes(term.replace(/[^a-z0-9]/g, "")),
                    )
                : current.has(m.preview),
            )
            .slice(0, 24)
            .map((m) => ({
              src: m.preview,
              source: m.sourcePage,
              label: decodeURIComponent(
                m.sourcePage.split("File:")[1] || "Image",
              ),
              credit: m.credit,
            }))
            .concat(importedImages)
            .slice(0, 24),
        });
      }
      if (articleRoute[2] === "history" && articleRoute[3]) {
        const revision = await stmt(
          env,
          "SELECT id,part,content,previous_content,reason,sources,character_name,created_at FROM article_revisions WHERE slug=? AND id=?",
          article.slug,
          Number(articleRoute[3]),
        ).first();
        if (!revision) throw new HttpError(404, "Revision not found.");
        const versions =
          revision.part === "document"
            ? [revision.previous_content, revision.content].map((value) => {
                const document = validateDocument(JSON.parse(value));
                return {
                  document,
                  ...renderDocument(document, { slug: article.slug }),
                };
              })
            : undefined;
        return json({ revision, ...(versions ? { versions } : {}) });
      }
      if (articleRoute[2] === "history")
        return json({
          revisions: (
            await stmt(
              env,
              "SELECT id,part,reason,sources,character_name,created_at FROM article_revisions WHERE slug=? ORDER BY id DESC LIMIT 50",
              article.slug,
            ).all()
          ).results,
        });
      if (articleRoute[2]) throw new HttpError(404, "Endpoint not found.");
      const state = await articleState(env, article);
      return json({
        title: state.document?.title || article.title,
        parts: state.parts,
      });
    }
    if (path === "/api/status" && request.method === "GET")
      return json({
        login: ready(env),
        census: !!env.CENSUS_SERVICE_ID && env.CENSUS_SERVICE_ID !== "example",
      });
    if (!ready(env))
      throw new HttpError(
        503,
        "Player accounts are awaiting activation. Wiki guides remain available.",
      );
    const origin = env.SITE_ORIGIN || "https://dcuo-wiki.com";
    if (
      !["GET", "HEAD"].includes(request.method) &&
      request.headers.get("Origin") !== origin
    )
      throw new HttpError(403, "Please submit from this website.");
    if (
      articleRoute?.[2] === "preview" &&
      !articleRoute[3] &&
      request.method === "POST"
    ) {
      const previewArticle = await findArticle(
        decodeURIComponent(articleRoute[1]),
        env,
      );
      const b = await bodyJson(request, DOCUMENT_BYTES * 2 + 16384);
      try {
        const document = validateDocument(b.document);
        return json({
          document,
          ...renderDocument(document, { slug: previewArticle.slug }),
        });
      } catch (error) {
        throw new HttpError(400, error.message);
      }
    }
    if (
      request.method === "GET" &&
      ["/api/auth/discord", "/api/auth/callback"].includes(path)
    )
      return await oauth(request, env, path, fetcher);
    const publicMatch = path.match(
      /^\/api\/profiles\/([a-f0-9-]{36})(\/screenshot)?$/,
    );
    if (publicMatch && request.method === "GET") {
      if (publicMatch[2]) {
        const row = await stmt(
          env,
          "SELECT screenshot,screenshot_type FROM profiles WHERE user_id=?",
          publicMatch[1],
        ).first();
        if (!row?.screenshot) throw new HttpError(404, "Screenshot not found.");
        return new Response(new Uint8Array(row.screenshot), {
          headers: {
            "Content-Type": row.screenshot_type,
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "Content-Security-Policy": "default-src 'none'; sandbox",
            "Content-Disposition": 'inline; filename="character-screenshot"',
          },
        });
      }
      const p = await profile(env, publicMatch[1]);
      if (!p) throw new HttpError(404, "Player profile not found.");
      return json(p);
    }
    const user = await session(request, env);
    if (path === "/api/me" && request.method === "GET")
      return json({
        name: user.display_name,
        profile: await profile(env, user.id),
        moderator: moderator(env, user),
      });
    if (path === "/api/auth/logout" && request.method === "POST") {
      await stmt(
        env,
        "DELETE FROM sessions WHERE token_hash=?",
        await hash(cookie(request, SESSION)),
      ).run();
      const result = json({ ok: true });
      result.headers.set("Set-Cookie", setCookie(SESSION, "", 0));
      return result;
    }
    if (path === "/api/characters" && request.method === "GET") {
      await limit(env, `census:${user.id}`, 15, 60);
      return json({
        characters: await searchCharacters(
          env,
          url.searchParams.get("name"),
          fetcher,
        ),
      });
    }
    if (path === "/api/profile" && request.method === "POST") {
      await limit(env, `profile:${user.id}`, 10, 600);
      const b = await bodyJson(request),
        bio = textField(b.bio ?? "", "About your character", 0, 500);
      const c = await matchCharacter(env, b.characterId, b.name, fetcher);
      const saved = await stmt(
        env,
        `INSERT INTO profiles(user_id,character_id,character_name,world_id,census_json,matched_at,bio,updated_at)
        SELECT ?,?,?,?,?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM profiles WHERE character_id=? AND user_id<>?)
        ON CONFLICT(user_id) DO UPDATE SET character_id=excluded.character_id,character_name=excluded.character_name,world_id=excluded.world_id,census_json=excluded.census_json,matched_at=excluded.matched_at,bio=excluded.bio,updated_at=excluded.updated_at,
        screenshot=CASE WHEN profiles.character_id=excluded.character_id THEN profiles.screenshot ELSE NULL END,
        screenshot_type=CASE WHEN profiles.character_id=excluded.character_id THEN profiles.screenshot_type ELSE NULL END`,
        user.id,
        c.character_id,
        c.name,
        c.world_id,
        JSON.stringify(c),
        now(),
        bio,
        now(),
        c.character_id,
        user.id,
      ).run();
      if (saved.meta.changes !== 1)
        throw new HttpError(
          409,
          "This character is already linked to another Discord account. Choose a different character.",
        );
      return json({ profile: await profile(env, user.id) });
    }
    if (
      path === "/api/profile/screenshot" &&
      ["POST", "DELETE"].includes(request.method)
    ) {
      await limit(env, `image:${user.id}`, 10, 600);
      const p = await profile(env, user.id);
      if (!p) throw new HttpError(403, "Match your character first.");
      if (request.method === "DELETE")
        await stmt(
          env,
          "UPDATE profiles SET screenshot=NULL,screenshot_type=NULL,updated_at=? WHERE user_id=?",
          now(),
          user.id,
        ).run();
      else {
        const bytes = await boundedBody(request, 256 * 1024),
          type = imageType(bytes);
        await stmt(
          env,
          "UPDATE profiles SET screenshot=?,screenshot_type=?,updated_at=? WHERE user_id=?",
          bytes.buffer,
          type,
          now(),
          user.id,
        ).run();
      }
      return json({ profile: await profile(env, user.id) });
    }
    if (
      articleRoute?.[2] === "document" &&
      !articleRoute[3] &&
      request.method === "POST"
    ) {
      await limit(env, `publish:${user.id}`, 20, 3600);
      const article = await findArticle(
        decodeURIComponent(articleRoute[1]),
        env,
      );
      const p = await profile(env, user.id);
      if (!p)
        throw new HttpError(
          403,
          "Match your character in Census before publishing.",
        );
      const b = await bodyJson(request, DOCUMENT_BYTES * 2 + 16384);
      let document;
      try {
        document = validateDocument(b.document);
      } catch (error) {
        throw new HttpError(400, error.message);
      }
      const current = await getDocumentState(env, article);
      if (b.revision !== current.revision || b.baseHash !== current.baseHash)
        throw new HttpError(
          409,
          "This article changed since you opened it. Your draft is saved; compare it with the latest published article before trying again.",
        );
      const content = JSON.stringify(document),
        previous = JSON.stringify(current.document);
      if (content === previous)
        throw new HttpError(400, "Change the article before publishing.");
      const reason = textField(b.reason, "Edit summary", 10, 500);
      const sources = textField(b.sources, "Supporting evidence", 10, 2000);
      await matchCharacter(
        env,
        p.character.character_id,
        p.character.name,
        fetcher,
      );
      const saved = await stmt(
        env,
        `INSERT INTO article_revisions(slug,part,base_hash,parent_revision,content,previous_content,reason,sources,user_id,character_name,created_at)
        SELECT ?,'document',?,?,?,?,?,?,user_id,character_name,? FROM profiles WHERE user_id=? AND character_id=? AND character_name=?
        AND COALESCE((SELECT MAX(id) FROM article_revisions WHERE slug=?),0)=?`,
        article.slug,
        current.baseHash,
        current.revision,
        content,
        previous,
        reason,
        sources,
        now(),
        user.id,
        p.character.character_id,
        p.character.name,
        article.slug,
        current.revision,
      ).run();
      if (saved.meta.changes !== 1)
        throw new HttpError(
          409,
          "The article or your character changed. Your draft is saved. Reload the current article before publishing.",
        );
      return json({ published: true }, 201);
    }
    if (articleRoute && !articleRoute[2] && request.method === "POST") {
      await limit(env, `publish:${user.id}`, 20, 3600);
      const article = await findArticle(
        decodeURIComponent(articleRoute[1]),
        env,
      );
      const p = await profile(env, user.id);
      if (!p)
        throw new HttpError(
          403,
          "Match your character in Census before publishing.",
        );
      const b = await bodyJson(request);
      const state = await articleState(env, article);
      if (state.document)
        throw new HttpError(
          409,
          "This page now uses full-article editing. Reload and use Edit this page.",
        );
      const part = state.parts.find((p) => p.id === b.part);
      if (!part)
        throw new HttpError(400, "Choose an existing article section.");
      if (b.revision !== part.revision || b.baseHash !== part.baseHash)
        throw new HttpError(
          409,
          "This section changed. Reload the current text before publishing your correction.",
        );
      const content = textField(
        b.content,
        "Proposed text",
        part.kind === "videos" ? 0 : 1,
        7000,
      );
      const reason = textField(b.reason, "Edit explanation", 10, 500);
      const sources = textField(b.sources, "Supporting evidence", 10, 2000);
      try {
        renderPart(part, content);
      } catch (e) {
        throw new HttpError(400, e.message);
      }
      if (content === part.text.trim())
        throw new HttpError(400, "Change the text before publishing.");
      await matchCharacter(
        env,
        p.character.character_id,
        p.character.name,
        fetcher,
      );
      const saved = await stmt(
        env,
        `INSERT INTO article_revisions(slug,part,base_hash,parent_revision,content,previous_content,reason,sources,user_id,character_name,created_at)
        SELECT ?,?,?,?,?,?,?,?,user_id,character_name,? FROM profiles WHERE user_id=? AND character_id=? AND character_name=?
        AND COALESCE((SELECT MAX(id) FROM article_revisions WHERE slug=? AND part=? AND base_hash=?),0)=?
        AND NOT EXISTS (SELECT 1 FROM article_revisions WHERE slug=? AND part='document')`,
        article.slug,
        part.id,
        part.baseHash,
        part.revision,
        content,
        part.text,
        reason,
        sources,
        now(),
        user.id,
        p.character.character_id,
        p.character.name,
        article.slug,
        part.id,
        part.baseHash,
        part.revision,
        article.slug,
      ).run();
      if (saved.meta.changes !== 1)
        throw new HttpError(
          409,
          "The section or your character changed. Reload before publishing.",
        );
      return json({ published: true }, 201);
    }
    if (path === "/api/contributions" && request.method === "POST") {
      await limit(env, `contribute:${user.id}`, 5, 3600);
      const p = await profile(env, user.id);
      if (!p)
        throw new HttpError(
          403,
          "Match your character in Census before contributing.",
        );
      const b = await bodyJson(request),
        slug = textField(b.page, "Page title", 1, 120);
      if (!/^[\p{L}\p{N} _'().:-]+$/u.test(slug))
        throw new HttpError(400, "Use a page title, not a URL.");
      const suggestion = textField(
          b.suggestion,
          "Suggested content",
          30,
          10000,
        ),
        sources = textField(
          b.sources,
          "Supporting sources or in-game evidence",
          10,
          2000,
        );
      await matchCharacter(
        env,
        p.character.character_id,
        p.character.name,
        fetcher,
      );
      const id = crypto.randomUUID();
      // Bind the insert to the same matched profile even if a concurrent request changes it.
      const saved = await stmt(
        env,
        `INSERT INTO contributions(id,user_id,character_id,character_name,page_slug,suggestion,sources,created_at)
        SELECT ?,user_id,character_id,character_name,?,?,?,? FROM profiles WHERE user_id=? AND character_id=? AND character_name=?`,
        id,
        slug,
        suggestion,
        sources,
        now(),
        user.id,
        p.character.character_id,
        p.character.name,
      ).run();
      if (saved.meta.changes !== 1)
        throw new HttpError(
          409,
          "Your character changed. Please submit again.",
        );
      return json({ id, status: "pending" }, 201);
    }
    if (path === "/api/contributions" && request.method === "GET")
      return json({
        contributions: (
          await stmt(
            env,
            "SELECT id,page_slug,suggestion,sources,status,created_at FROM contributions WHERE user_id=? ORDER BY created_at DESC LIMIT 50",
            user.id,
          ).all()
        ).results,
      });
    if (path === "/api/moderation" && request.method === "GET") {
      if (!moderator(env, user))
        throw new HttpError(403, "Moderator access required.");
      return json({
        contributions: (
          await stmt(
            env,
            "SELECT id,character_name,page_slug,suggestion,sources,status,created_at FROM contributions WHERE status='pending' ORDER BY created_at LIMIT 100",
          ).all()
        ).results,
      });
    }
    if (path === "/api/moderation" && request.method === "POST") {
      if (!moderator(env, user))
        throw new HttpError(403, "Moderator access required.");
      const b = await bodyJson(request);
      if (
        !["reviewed", "rejected"].includes(b.status) ||
        typeof b.id !== "string"
      )
        throw new HttpError(400, "Choose a review decision.");
      await stmt(
        env,
        "UPDATE contributions SET status=?,reviewed_by=?,reviewed_at=? WHERE id=? AND status='pending'",
        b.status,
        user.id,
        now(),
        b.id,
      ).run();
      return json({ ok: true });
    }
    throw new HttpError(404, "Endpoint not found.");
  } catch (error) {
    if (error instanceof HttpError)
      return json({ error: error.message }, error.status);
    // Do not expose OAuth secrets, Census service IDs, SQL or profile data in errors/logs.
    return json(
      {
        error:
          "The account service is temporarily unavailable. Please try again later.",
      },
      503,
    );
  }
}
export default {
  fetch(request, env) {
    return handle(request, env);
  },
};
