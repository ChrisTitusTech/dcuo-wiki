import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  findCompanionArticle,
  listCompanionItems,
  serveCompanionArticle,
} from "../worker/companion-catalog.mjs";
import { articleParts } from "../shared/article-content.mjs";
import { baselineDocument, renderDocument } from "../shared/rich-article.mjs";
function setup() {
  const db = new DatabaseSync(":memory:");
  db.exec(
    "CREATE TABLE item_identifications(item_id TEXT PRIMARY KEY,name TEXT,slug TEXT);CREATE TABLE item_details(item_id TEXT PRIMARY KEY,details_json TEXT,captured_at INTEGER,updated_at INTEGER)",
  );
  const env = {
    DB: {
      prepare(sql) {
        return {
          bind(...args) {
            return {
              async first() {
                return db.prepare(sql).get(...args) || null;
              },
              async all() {
                return { results: db.prepare(sql).all(...args) };
              },
            };
          },
        };
      },
    },
  };
  return {
    env,
    add(id, name, details, slug = null) {
      db.prepare("INSERT INTO item_identifications VALUES(?,?,?)").run(
        id,
        name,
        slug,
      );
      db.prepare("INSERT INTO item_details VALUES(?,?,?,?)").run(
        id,
        JSON.stringify(details),
        1700000000,
        1700000001,
      );
    },
  };
}
test("only substantive definitions create canonical articles; mapped sources retain original pages", async () => {
  const { env, add } = setup();
  add("99901", "<Unsafe name>", {
    description: "An <img onerror=bad> item",
    style: "<script>bad</script>",
    requiredLevel: 30,
    itemLevel: 999,
    stats: [{ name: "Might", value: 123 }],
  });
  add("99902", "Name only", { qualityId: 4, requiredLevel: 0 });
  add("99903", "Mapped", { description: "Existing" }, "Existing_Article");
  add("783542", "Wrong name", { description: "Existing source" });
  assert.equal(await findCompanionArticle("Item_099901", env), null);
  assert.equal(await findCompanionArticle("Item_99902", env), null);
  assert.equal(await findCompanionArticle("Item_99903", env), null);
  assert.equal(await findCompanionArticle("Item_783542", env), null);
  const article = await findCompanionArticle("Item_99901", env);
  assert.equal(article.title, "<Unsafe name>");
  assert.equal(article.related.length, 0);
  const rendered = renderDocument(
    baselineDocument(article, articleParts(article)),
    { slug: article.slug },
  );
  assert(!rendered.html.includes("<img onerror"));
  assert(!rendered.html.includes("<script>"));
  assert(!JSON.stringify(article).includes("123"));
  assert(!JSON.stringify(article).includes("999,"));
  const list = await listCompanionItems(
    new URL("https://example.test/api/companion/items"),
    env,
  );
  assert.equal(
    list.items.find((x) => x.itemId === "99903").href,
    "/wiki/Existing_Article/",
  );
  assert.equal(
    list.items.find((x) => x.itemId === "783542").href,
    "/wiki/Soder_Cola_Extreme/",
  );
  assert(!list.items.some((x) => x.itemId === "99902"));
});
test("catalog pagination is bounded and validates canonical numeric cursors", async () => {
  const { env, add } = setup();
  for (let i = 10000; i < 10052; i++)
    add(String(i), "Item " + i, { description: "Definition" });
  const one = await listCompanionItems(
    new URL("https://example.test/api/companion/items"),
    env,
  );
  assert.equal(one.items.length, 50);
  assert.equal(one.nextCursor, "10049");
  const two = await listCompanionItems(
    new URL(
      "https://example.test/api/companion/items?cursor=" + one.nextCursor,
    ),
    env,
  );
  assert.equal(two.items.length, 2);
  assert.equal(two.nextCursor, null);
  await assert.rejects(
    () => listCompanionItems(new URL("https://example.test/?cursor=01"), env),
    { status: 400 },
  );
});
test("article template rewrites safe baseline, editor identity, metadata, and disables caching", async () => {
  const previous = globalThis.HTMLRewriter;
  const handlers = new Map();
  globalThis.HTMLRewriter = class {
    on(selector, handler) {
      handlers.set(selector, handler);
      return this;
    }
    transform(response) {
      return response;
    }
  };
  try {
    const { env, add } = setup();
    add("99904", "Catalog fixture", { description: "Definition" });
    const article = await findCompanionArticle("Item_99904", env);
    let fetched;
    env.ASSETS = {
      async fetch(request) {
        fetched = new URL(request.url).pathname;
        return new Response("<html>template</html>", {
          headers: { ETag: "stale" },
        });
      },
    };
    const response = await serveCompanionArticle(
      new Request("https://example.test/wiki/Item_99904/"),
      env,
      article,
    );
    assert.equal(fetched, "/companion-item-template/");
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(response.headers.get("ETag"), null);
    const attrs = {};
    handlers.get("#article-editor").element({
      setAttribute(k, v) {
        attrs[k] = v;
      },
    });
    assert.equal(attrs["data-slug"], "Item_99904");
    assert.equal(attrs["data-page"], "Catalog fixture");
    let html;
    handlers.get("#article-body").element({
      setInnerContent(value) {
        html = value;
      },
    });
    assert(html.includes("Definition"));
    assert(handlers.has("#article-toc"));
    const redirect = await serveCompanionArticle(
      new Request("https://example.test/wiki/Item_99904"),
      env,
      article,
    );
    assert.equal(redirect.status, 301);
  } finally {
    globalThis.HTMLRewriter = previous;
  }
});

test("exact mapped sources get escaped supplemental definitions without character stats", async () => {
  const { companionArticleDetails, renderCompanionArticleDetails } =
    await import("../worker/companion-catalog.mjs");
  const { env, add } = setup();
  add("783542", "Wrong seed name", {
    description: "Captured <script>bad</script>",
    requiredLevel: 30,
    stats: [{ name: "Private stat", value: 987 }],
    itemLevel: 500,
  });
  add(
    "99910",
    "Mapped custom",
    { description: "Mapped definition", style: "Own style" },
    "Existing_Article",
  );
  add("99911", "Unrelated", { description: "Unrelated" }, "Other_Article");
  const rows = await companionArticleDetails("Soder_Cola_Extreme", env);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, "Soder Cola Extreme");
  const html = renderCompanionArticleDetails(rows);
  assert(html.includes("Companion item definition"));
  assert(html.includes("&lt;script&gt;"));
  assert(!html.includes("<script>"));
  assert(!html.includes("987"));
  assert(!html.includes("500"));
  assert.equal(
    (await companionArticleDetails("Existing_Article", env)).length,
    1,
  );
  assert.equal((await companionArticleDetails("Item_99910", env)).length, 0);
});
test("only fixed absolute item icon paths enter the editor media library", async () => {
  const { mediaAsset } = await import("../shared/media.mjs");
  const url = "https://dcuo-wiki.com/api/item-icons/" + "a".repeat(64);
  assert.equal(mediaAsset(url).preview, url);
  assert.equal(mediaAsset(url).original, url);
  assert.equal(
    mediaAsset(url).sourcePage,
    "https://dcuo-wiki.com/companion-items/",
  );
  for (const bad of [
    url + "?x=1",
    url + "#x",
    url.replace("https:", "http:"),
    url.replace("dcuo-wiki.com", "evil.test"),
    url.replace("https://", "https://user@"),
  ])
    assert.equal(mediaAsset(bad), null);
  assert.throws(() => mediaAsset("/api/item-icons/" + "a".repeat(64)));
});
test("dynamic articles bypass static baseline packs and keep icon baselines editable", async () => {
  const { pristineDocumentResponse } =
    await import("../worker/editor-baselines.mjs");
  const { env, add } = setup();
  add("99912", "Icon fixture", { icon: "/api/item-icons/" + "b".repeat(64) });
  const article = await findCompanionArticle("Item_99912", env);
  assert.equal(article.companion, true);
  assert.equal(
    await pristineDocumentResponse(
      {
        ASSETS: {
          fetch() {
            throw Error("must not fetch");
          },
        },
        DB: {
          prepare() {
            throw Error("must not query");
          },
        },
      },
      article,
    ),
    null,
  );
  const rendered = renderDocument(
    baselineDocument(article, articleParts(article)),
    { slug: article.slug },
  );
  assert(rendered.html.includes("<img"));
  assert(rendered.html.includes("/api/item-icons/" + "b".repeat(64)));
});
