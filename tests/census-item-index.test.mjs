import { test } from "node:test";
import { execFileSync } from "node:child_process";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import {
  itemIds,
  parseRevisionBatch,
  revisionPages,
  resolveItemIdentities,
} from "../scripts/census-item-source.mjs";
import { infoboxArtifactDetails } from "../scripts/census-item-artifacts.mjs";
import { catalogArticles } from "../scripts/catalog-files.mjs";
import items from "../data/census-item-index.json" with { type: "json" };
import evidence from "../data/census-item-evidence.json" with { type: "json" };
import conflicts from "../data/census-item-conflicts.json" with { type: "json" };
const row = (slug) => ({
  itemId: "123",
  slug,
  title: slug,
  source: "https://dcuniverseonline.fandom.com/wiki/" + slug,
  evidence: "itemID=123",
  kind: "wiki-template",
});
test("extracts only numeric Item template IDs and ignores comments, examples, unrelated fields and expressions", () => {
  const source = `{{Item\n|icon=[[File:Icon.png|label]]\n|description={{color|yellow|Hello}}\n|itemID = 783542\n}}\n{{Item|itemID=999}}\n<!-- {{Item|itemID=888}} -->\n<nowiki>{{Item|itemID=777}}</nowiki>\n{{Other|itemID=555}}\n{{Item|itemID=123,456}}\n{{Item|itemID={{PAGENAME}}}}`;
  assert.deepEqual(itemIds(source), ["783542", "999"]);
});
test("revision parsing rejects incomplete source data and resolves only namespace-zero pages and explicit aliases", () => {
  assert.throws(
    () => parseRevisionBatch({ rawHtml: '{"query":' }),
    /invalid wiki revision JSON/,
  );
  assert.throws(
    () => parseRevisionBatch({ rawHtml: '{"error":"unavailable"}' }),
    /Invalid wiki/,
  );
  const data = parseRevisionBatch({
    rawHtml: JSON.stringify({
      query: {
        normalized: [{ from: "A_Item", to: "A Item" }],
        redirects: [{ from: "A Item", to: "Current Item" }],
        pages: [
          {
            ns: 0,
            title: "Current Item",
            revisions: [
              { slots: { main: { content: "{{Item|itemID=123}}" } } },
            ],
          },
          {
            ns: 6,
            title: "File:Item.png",
            revisions: [{ slots: { main: { content: "bad" } } }],
          },
        ],
      },
    }),
  });
  const pages = revisionPages(data);
  assert.equal(pages.get("A Item").title, "Current Item");
  assert(!pages.has("File:Item.png"));
});
test("conflicting IDs stay unresolved unless an explicit reviewed rule selects an existing candidate", () => {
  const result = resolveItemIdentities([row("First"), row("Second")]);
  assert.equal(result.resolved.length, 0);
  assert.equal(result.conflicts.length, 1);
  assert.throws(
    () =>
      resolveItemIdentities(
        [row("First"), row("Second")],
        [
          {
            itemId: "123",
            slug: "Absent",
            reason: "A sufficiently detailed but unsupported rationale.",
          },
        ],
      ),
    /Unsupported item override/,
  );
  const resolved = resolveItemIdentities(
    [row("First"), row("Second")],
    [
      {
        itemId: "123",
        slug: "First",
        reason:
          "The current source explicitly replaces the historical version.",
      },
    ],
  );
  assert.equal(resolved.resolved[0].slug, "First");
  assert.equal(resolved.conflicts[0].resolution, "First");
});
test("artifact infobox extraction retains rank values and refuses incomplete effects", () => {
  const html =
    '<aside class="portable-infobox"><div data-source="description">Unique Equip<br>Recommended for: DPS<br>Gain 20% critical chance and 30% critical magnitude.<br>Upcoming Rank Bonuses:<br>(80) Dark Bargain (1)<br>(120) Dark Bargain (2)<br>(200) Dark Bargain (4)<br></div></aside>';
  const details = infoboxArtifactDetails(html);
  assert.deepEqual(details.ranks, [
    ["80", "Dark Bargain (1)"],
    ["120", "Dark Bargain (2)"],
    ["200", "Dark Bargain (4)"],
  ]);
  assert(details.effects.includes("20% critical chance"));
  assert(!details.effects.includes("Unique Equip"));
  assert.throws(
    () =>
      infoboxArtifactDetails(
        '<div data-source="description">Artifact with no ranks.</div>',
      ),
    /lacks structured/,
  );
});
test("every linked identity has a published article, every identity has evidence, and unresolved conflicts stay excluded", async () => {
  const articles = [
      ...JSON.parse(await fs.readFile("src/data/articles.json", "utf8")),
      ...(await catalogArticles()),
    ],
    bySlug = new Map(articles.map((a) => [a.slug, a]));
  assert(items.length > 2700);
  assert.equal(new Set(items.map((i) => i[0])).size, items.length);
  assert.equal(items.length, evidence.length);
  const sources = new Map(evidence.map((r) => [r.itemId, r]));
  for (const [id, slug, title] of items) {
    if (slug) assert.equal(bySlug.get(slug)?.title, title, slug);
    else
      assert(
        sources
          .get(id)
          .sources.every(
            (s) =>
              s.kind.startsWith("community-") ||
              s.kind === "wiki-template" ||
              s.kind === "native-memory",
          ),
      );
    const source = sources.get(id);
    assert.equal(source.slug, slug);
    assert(source.sources.length > 0);
    assert(
      source.sources.every(
        (s) =>
          s.evidence.includes(id) &&
          /^https:\/\/(?:dcuniverseonline\.fandom\.com|github\.com)\//.test(
            s.url,
          ),
      ),
    );
  }
  const ids = new Map(items.map((r) => [r[0], r]));
  for (const conflict of conflicts) {
    if (!conflict.resolution) assert(!ids.has(conflict.itemId));
    else assert.equal(ids.get(conflict.itemId)[1], conflict.resolution);
  }
  assert(
    !ids.has("962995"),
    "Held Emblem of Perfection conflicts with Emblem of Promise",
  );
  assert(
    !ids.has("1029158"),
    "Held Harbinger helmet conflicts with published Imbued Spore Legplates",
  );
  const rawClaims = JSON.parse(
    await fs.readFile("data/census-wiki-items.json", "utf8"),
  );
  const disputed = new Set(conflicts.map((row) => row.itemId));
  for (const claim of rawClaims)
    for (const itemId of claim.itemIds)
      assert(
        ids.has(itemId) || disputed.has(itemId),
        `Source claim was silently omitted: ${itemId}`,
      );
  assert.equal(ids.get("783542")[1], "Soder_Cola_Extreme");
  assert.equal(ids.get("8129032")[1], "Ally_Shazam");
});

test("restored artifacts contain substantive effects and rank tables and incomplete source articles remain held", async () => {
  const all = await catalogArticles(),
    restored = all.filter((a) => a.sourceSupplement);
  assert.equal(restored.length, 45);
  for (const article of restored) {
    assert.equal(article.category, "Equipment");
    assert.equal(article.type, "Artifacts");
    const effect = article.sections.find((s) => s.title === "Artifact effects");
    assert(effect.items.join(" ").length >= 50, article.slug);
    assert(!/\.\.\.|…|\{\{|\[\[/.test(effect.items.join(" ")), article.slug);
    const ranks = article.sections.find(
      (s) => s.title === "Rank bonuses",
    ).table;
    assert(ranks.rows.length >= 3, article.slug);
    assert(
      ranks.rows.every((row) => /^\d+$/.test(row[0]) && row[1].trim()),
      article.slug,
    );
  }
  for (const slug of [
    "Grimbor_s_Chains",
    "Computo_s_Redistributor_HUD",
    "Red_Tornado_Redistribution_Module",
  ])
    assert(!all.some((a) => a.slug === slug));
});

test("index check succeeds with filesystem writes forbidden", () => {
  const output = execFileSync(
    process.execPath,
    [
      "--permission",
      "--allow-fs-read=*",
      "scripts/build-census-item-index.mjs",
      "--check",
    ],
    { encoding: "utf8" },
  );
  assert.equal(JSON.parse(output).mapped, items.length);
});

test("native item evidence retains exact IDs, names and build provenance without private session data", async () => {
  const rows = JSON.parse(
    await fs.readFile("data/census-overlay-items.json", "utf8"),
  );
  for (const row of rows) {
    assert.deepEqual(Object.keys(row).sort(), [
      "build",
      "capturedAt",
      "itemId",
      "name",
      "profile",
    ]);
    assert.match(row.build, /^[a-f0-9]{64}$/);
    assert.equal(row.profile, "item-names-v1");
    assert(Number.isSafeInteger(row.capturedAt));
    const source = evidence.find((r) => r.itemId === row.itemId);
    assert(source);
    assert(
      source.sources.some(
        (s) =>
          s.kind === "native-memory" &&
          s.evidence.includes(row.name) &&
          s.evidence.includes(row.build),
      ),
    );
    assert(items.some(([id]) => id === row.itemId));
  }
});
