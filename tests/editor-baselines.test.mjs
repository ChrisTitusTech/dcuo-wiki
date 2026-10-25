import test from "node:test";
import assert from "node:assert/strict";
import articles from "../src/data/articles.json" with { type: "json" };
import { editorBaseline } from "../scripts/editor-baseline.mjs";
import { pristineDocumentResponse } from "../worker/editor-baselines.mjs";
import { hash } from "../worker/security.mjs";
import { catalogPackPath, packLine } from "../shared/catalog-packs.mjs";
const fixture = (revision, fetch) => ({
  DB: {
    prepare(sql) {
      assert.match(sql, /article_revisions WHERE slug=\?/);
      return {
        bind(slug) {
          assert.equal(slug, "Base_Items_1");
          return { first: async () => revision };
        },
      };
    },
  },
  ASSETS: { fetch },
});
test("large source editor payloads have the same document hash as the publish protocol", async () => {
  const article = articles.find((a) => a.slug === "Base_Items_1");
  const payload = editorBaseline(
    article,
    articles.filter((a) => article.related?.includes(a.slug)),
  );
  assert.equal(payload.baseHash, await hash(JSON.stringify(payload.document)));
  assert.equal(payload.revision, 0);
  assert.match(payload.html, /<table/);
  assert.ok(payload.toc.includes("#section-"));
  const serialized = JSON.stringify(payload);
  const env = fixture(null, async (request) => {
    assert.equal(
      new URL(request.url).pathname,
      catalogPackPath("Base_Items_1"),
    );
    return new Response(packLine(article.slug, "editor", payload), {
      headers: {
        "Content-Type": "text/plain",
        ETag: "source-etag",
        "Last-Modified": "yesterday",
        "Cache-Control": "public,max-age=3600",
      },
    });
  });
  const response = await pristineDocumentResponse(env, article);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("ETag"), null);
  assert.equal(response.headers.get("Last-Modified"), null);
  assert.equal(await response.text(), serialized);
});
test("any stored correction bypasses the source asset so live revisions remain authoritative", async () => {
  const env = fixture({ id: 123 }, async () => {
    throw Error("Source asset must not replace community edits");
  });
  assert.equal(
    await pristineDocumentResponse(env, { slug: "Base_Items_1" }),
    null,
  );
});
test("missing editor assets fail clearly instead of rebuilding large documents within request CPU", async () => {
  for (const asset of [
    new Response("missing", { status: 404 }),
    new Response("<html>fallback</html>", {
      headers: { "Content-Type": "text/html" },
    }),
  ]) {
    await assert.rejects(
      () =>
        pristineDocumentResponse(
          fixture(null, async () => asset),
          { slug: "Base_Items_1" },
        ),
      (e) => e.status === 503,
    );
  }
});
import { catalogEditorBaseline } from "../scripts/editor-baseline.mjs";
import { baselineDocument } from "../shared/rich-article.mjs";
import { articleParts } from "../shared/article-content.mjs";
test("the actual build helper preserves the live baseline related-guide ordering and hash", async () => {
  const article = articles.find((a) => a.slug === "Investigations");
  const expected = baselineDocument(
    article,
    articleParts(article),
    articles.filter((a) => article.related?.includes(a.slug)),
  );
  const payload = catalogEditorBaseline(article, articles);
  assert.deepEqual(payload.document, expected);
  assert.equal(payload.baseHash, await hash(JSON.stringify(expected)));
});
