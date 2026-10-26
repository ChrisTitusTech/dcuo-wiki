// Build a small Worker lookup from reviewed, offline source evidence.
import fs from "node:fs/promises";
import { catalogArticles } from "./catalog-files.mjs";
import {
  sourceTitle,
  titleKey,
  resolveItemIdentities,
} from "./census-item-source.mjs";
const read = async (p) => JSON.parse(await fs.readFile(p, "utf8"));
const articles = [
  ...(await read("src/data/articles.json")),
  ...(await catalogArticles()),
];
const bySlug = new Map(articles.map((a) => [a.slug, a]));
const bySource = new Map(
  articles.map((a) => [titleKey(sourceTitle(a.source)).toLowerCase(), a]),
);
const candidates = [];
for (const row of await read("data/census-items.json"))
  candidates.push({ ...row, kind: "wiki-prose" });
for (const row of await read("data/census-wiki-items.json")) {
  const article = bySource.get(titleKey(row.title).toLowerCase());
  for (const itemId of row.itemIds)
    candidates.push({
      itemId,
      slug: article?.slug || null,
      title: article?.title || row.title,
      source: row.source,
      evidence: `Item.itemID=${itemId}; revision ${row.revisionId}`,
      kind: "wiki-template",
    });
}
const missing = [];
for (const row of await read("data/census-community-items.json")) {
  const article = bySource.get(titleKey(row.sourceTitle).toLowerCase());
  if (!article) {
    missing.push({
      itemId: row.itemId,
      name: row.name,
      sourceTitle: row.sourceTitle,
    });
    candidates.push({
      itemId: row.itemId,
      slug: null,
      title: row.name,
      source: row.source,
      evidence: `${row.name}: ${row.itemId}`,
      kind: "community-" + row.kind.toLowerCase(),
    });
    continue;
  }
  candidates.push({
    itemId: row.itemId,
    slug: article.slug,
    title: article.title,
    source: row.source,
    evidence: `${row.name}: ${row.itemId}`,
    kind: "community-" + row.kind.toLowerCase(),
  });
}

for (const row of candidates) {
  const article = bySlug.get(row.slug);
  if (
    !/^[1-9]\d{0,29}$/.test(row.itemId) ||
    (row.slug !== null && (!article || article.title !== row.title))
  )
    throw new Error("Invalid item destination: " + row.itemId);
}
const { resolved: evidence, conflicts } = resolveItemIdentities(
  candidates,
  await read("data/census-item-overrides.json"),
);
evidence.sort((a, b) => a.itemId.localeCompare(b.itemId, "en"));
const compact = evidence.map((r) => [r.itemId, r.slug, r.title]);
const outputs = {
  "data/census-item-index.json": compact,
  "data/census-item-evidence.json": evidence,
  "data/census-item-conflicts.json": conflicts,
};
for (const [file, data] of Object.entries(outputs)) {
  const serialized = JSON.stringify(data) + "\n";
  if (process.argv.includes("--check")) {
    if ((await fs.readFile(file, "utf8")) !== serialized)
      throw new Error("Rebuild stale Census item index: " + file);
  } else await fs.writeFile(file, serialized);
}
console.log(
  JSON.stringify({
    mapped: compact.length,
    articles: new Set(compact.filter((r) => r[1]).map((r) => r[1])).size,
    conflicts: conflicts.length,
    missingCommunityArticles: missing.length,
  }),
);
if (missing.length && !process.argv.includes("--check")) {
  await fs.mkdir(".import-cache/census-items", { recursive: true });
  await fs.writeFile(
    ".import-cache/census-items/missing-community-articles.json",
    JSON.stringify(missing, null, 2) + "\n",
  );
}
