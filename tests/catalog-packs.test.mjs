import test from "node:test";
import assert from "node:assert/strict";
import {
  catalogPackPath,
  packLine,
  packedValue,
} from "../shared/catalog-packs.mjs";
import { serveCatalogMedia } from "../worker/catalog-media.mjs";
import { serveArticle } from "../worker/articles.mjs";
import {
  articleParts,
  renderPart,
  tableTextRow,
  parseTableRow,
} from "../shared/article-content.mjs";
test("literal pipes round trip through table editing without adding columns", () => {
  const row = ["Box (| Materials)", "Backslash \\", "1500, 56/75", ""];
  assert.deepEqual(parseTableRow(tableTextRow(row)), row);
  assert.deepEqual(parseTableRow("Green|Blue | 1500 Cash"), [
    "Green|Blue",
    "1500 Cash",
  ]);
  const part = {
    kind: "table",
    columns: ["Type", "Notes", "Cost", "Extra"],
    caption: "Table",
    title: "Table",
  };
  assert.match(renderPart(part, tableTextRow(row)), /Box \(\| Materials\)/);
});
const id = "a".repeat(64);
test("packed article HTML stays readable, canonical, protected and returns real 404s", async () => {
  const pack = packLine("Example_House", "html", "<h1>Example House</h1>");
  const env = {
    ASSETS: {
      fetch: async (request) =>
        new URL(request.url).pathname.startsWith("/_catalog/")
          ? new Response(pack, { headers: { "Content-Type": "text/plain" } })
          : new Response("Not found", { status: 404 }),
    },
    DB: { prepare: () => ({ bind: () => ({ first: async () => null }) }) },
  };
  const response = await serveArticle(
    new Request("https://dcuo-wiki.com/wiki/Example_House/"),
    env,
  );
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "<h1>Example House</h1>");
  assert.equal(response.headers.get("X-Frame-Options"), "DENY");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const redirect = await serveArticle(
    new Request("https://dcuo-wiki.com/wiki/Example_House?q=1"),
    env,
  );
  assert.equal(redirect.status, 301);
  assert.equal(redirect.headers.get("Location"), "/wiki/Example_House/?q=1");
  for (const path of ["/wiki/Unknown/", "/wiki/Example_House/nested/"])
    assert.equal(
      (await serveArticle(new Request("https://dcuo-wiki.com" + path), env))
        .status,
      404,
    );
  const head = await serveArticle(
    new Request("https://dcuo-wiki.com/wiki/Example_House/", {
      method: "HEAD",
    }),
    env,
  );
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
});
test("packed records select exact slugs and escape embedded newlines", () => {
  const pack =
    packLine("Foo", "article", { text: "line\nFoo\tarticle\tspoof" }) +
    packLine("Foo_Bar", "editor", { title: "Other" });
  assert.deepEqual(JSON.parse(packedValue(pack, "Foo", "article")), {
    text: "line\nFoo\tarticle\tspoof",
  });
  assert.equal(packedValue(pack, "Bar", "editor"), null);
  assert.equal(packedValue(pack, "Foo", "editor"), null);
  assert.throws(() => catalogPackPath("../secret"));
  assert.throws(
    () => packedValue("Foo\tarticle\t{}", "Foo", "article"),
    /Truncated/,
  );
});
test("approved media is copied once to R2 with real MIME type and source attribution", async () => {
  const source = {
    originalUrl: "https://static.wikia.nocookie.net/dcuo/images/a/ab/Test.png",
    sourcePage: "https://dcuniverseonline.fandom.com/wiki/File:Test.png",
    credit: "Source contributors",
  };
  let stored = false,
    calls = 0;
  const env = {
    ASSETS: {
      fetch: async () =>
        new Response(packLine(id, "media", source), {
          headers: { "Content-Type": "text/plain" },
        }),
    },
    MEDIA: {
      head: async () => (stored ? {} : null),
      put: async (key, bytes, options) => {
        assert.equal(key, "catalog/" + id);
        assert.equal(options.httpMetadata.contentType, "image/png");
        assert.equal(options.customMetadata.sourcePage, source.sourcePage);
        assert.equal(options.onlyIf.etagDoesNotMatch, "*");
        assert.equal(bytes.length, 8);
        stored = true;
        return {};
      },
    },
  };
  const request = new Request("https://dcuo-wiki.com/api/catalog-media/" + id);
  const fetcher = async () => {
    calls++;
    return new Response(new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]));
  };
  const first = await serveCatalogMedia(request, env, fetcher);
  assert.equal(first.status, 302);
  assert.equal(
    first.headers.get("Location"),
    "https://images.dcuo-wiki.com/catalog/" + id,
  );
  await serveCatalogMedia(request, env, fetcher);
  assert.equal(calls, 1);
});
test("unknown images and unsafe sources cannot become an arbitrary proxy", async () => {
  for (const source of [null, { originalUrl: "https://example.com/private" }]) {
    const env = {
      MEDIA: {
        head: async () => null,
        put: async () => assert.fail("unexpected storage"),
      },
      ASSETS: {
        fetch: async () =>
          new Response(source ? packLine(id, "media", source) : "", {
            headers: { "Content-Type": "text/plain" },
          }),
      },
    };
    await assert.rejects(() =>
      serveCatalogMedia(
        new Request("https://dcuo-wiki.com/api/catalog-media/" + id),
        env,
        async () => assert.fail("unexpected fetch"),
      ),
    );
  }
});
test("upstream image redirects are rejected without following or storing another host", async () => {
  const source = {
    originalUrl:
      "https://static.wikia.nocookie.net/dcuo/images/a/aa/Example.png",
  };
  let writes = 0;
  const env = {
    MEDIA: {
      head: async () => null,
      put: async () => {
        writes++;
      },
    },
    ASSETS: {
      fetch: async () =>
        new Response(packLine(id, "media", source), {
          headers: { "Content-Type": "text/plain" },
        }),
    },
  };
  await assert.rejects(
    () =>
      serveCatalogMedia(
        new Request("https://dcuo-wiki.com/api/catalog-media/" + id),
        env,
        async (url, options) => {
          assert.equal(options.redirect, "manual");
          return new Response(null, {
            status: 302,
            headers: { Location: "https://example.com/private" },
          });
        },
      ),
    (error) => error.status === 502,
  );
  assert.equal(writes, 0);
});
