import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyURL,
  nextPage,
  buildInventory,
  origin,
} from "../scripts/wiki-urls.mjs";
import { scrape } from "../scripts/firecrawl.mjs";
test("canonicalization preserves parentheses, namespaces used as titles, and Unicode", () => {
  assert.equal(
    classifyURL(origin + "/wiki/Fire_(Power)#Test").url,
    classifyURL(origin + "/wiki/Fire_%28Power%29?oldid=12").url,
  );
  assert.equal(
    classifyURL(origin + "/wiki/Collections:_Alien_Technology").kind,
    "article",
  );
  assert.equal(
    classifyURL(origin + "/wiki/Gangster%E2%80%99s_Jacket").title,
    "Gangster’s_Jacket",
  );
  assert.equal(
    classifyURL(origin + "/wiki/House%20of%20Venom").url,
    classifyURL(origin + "/wiki/House_of_Venom").url,
  );
});
test("rejects external and user pages while retaining supporting maps", () => {
  assert.equal(classifyURL("https://example.com/wiki/Powers").kind, "excluded");
  assert.equal(
    classifyURL("https://user:pass@dcuniverseonline.fandom.com/wiki/Powers")
      .kind,
    "excluded",
  );
  assert.equal(classifyURL(origin + "/wiki/User:Someone").kind, "excluded");
  assert.equal(classifyURL(origin + "/wiki/File:Map.jpg").kind, "support");
  assert.equal(classifyURL(origin + "/wiki/%zz").kind, "excluded");
});
test("follows next link instead of previous and refuses foreign continuations", () => {
  assert.equal(
    nextPage(
      `[Previous page](x) | [Next page (B)](${origin}/wiki/Special:AllPages?from=B "Special:AllPages")`,
    ),
    origin + "/wiki/Special:AllPages?from=B",
  );
  assert.throws(() =>
    nextPage(
      "[Next page (B)](https://example.com/wiki/Special:AllPages?from=B)",
    ),
  );
  assert.equal(nextPage("No next link"), null);
});
test("inventory reports partial, deduplicates URL variants, and marks terminal chain", () => {
  const first = {
    url: origin + "/wiki/Special:AllPages",
    kind: "all-pages",
    links: [origin + "/wiki/Fire_(Power)", origin + "/wiki/Fire_%28Power%29#A"],
    nextUrl: origin + "/wiki/Special:AllPages?from=B",
  };
  let result = buildInventory([first], []);
  assert.equal(result.exhaustive, false);
  assert.equal(result.summary.articleCandidates, 1);
  assert.equal(result.summary.duplicateObservations, 1);
  result = buildInventory(
    [
      first,
      {
        url: first.nextUrl,
        kind: "all-pages",
        links: [origin + "/wiki/B"],
        nextUrl: null,
      },
    ],
    [],
  );
  assert.equal(result.exhaustive, true);
});
test("Firecrawl retries transient failures and retains HTML and links", async () => {
  let calls = 0;
  const data = {
    markdown: "Content",
    html: "<p>Content</p>",
    links: ["https://example.com"],
  };
  const result = await scrape(origin + "/wiki/Powers", {
    key: "test",
    sleep: async () => {},
    fetcher: async () => {
      calls++;
      return calls === 1
        ? { status: 429, ok: false }
        : {
            ok: true,
            status: 200,
            json: async () => ({ success: true, data }),
          };
    },
  });
  assert.equal(calls, 2);
  assert.deepEqual(result, data);
});
test("Firecrawl does not retry authentication errors or accept empty content", async () => {
  let calls = 0;
  await assert.rejects(
    scrape(origin + "/wiki/Powers", {
      key: "test",
      fetcher: async () => {
        calls++;
        return { status: 401, ok: false };
      },
    }),
    /401/,
  );
  assert.equal(calls, 1);
  await assert.rejects(
    scrape(origin + "/wiki/Powers", {
      key: "test",
      fetcher: async () => ({
        ok: true,
        status: 200,
        json: async () => ({ success: true, data: { markdown: "" } }),
      }),
    }),
    /No article content/,
  );
});
test("discussion namespaces remain excluded after underscore normalization", () => {
  for (const namespace of [
    "User_talk",
    "Template_talk",
    "Category_talk",
    "File_talk",
    "Help_talk",
    "Message_Wall",
    "Message_Wall_Greeting",
    "MediaWiki_talk",
    "DC_Universe_Online_Wiki_talk",
  ]) {
    assert.equal(
      classifyURL(`${origin}/wiki/${namespace}:Someone`).kind,
      "excluded",
      namespace,
    );
    assert.equal(
      classifyURL(`${origin}/wiki/${namespace.replaceAll("_", "%20")}:Someone`)
        .kind,
      "excluded",
      namespace,
    );
  }
});
