import { readFile, writeFile } from "node:fs/promises";
import { buildInventory, classifyURL } from "./wiki-urls.mjs";
import { catalogArticles } from "./catalog-files.mjs";
const discovery = JSON.parse(await readFile("data/discovery.json", "utf8"));
const articles = JSON.parse(await readFile("src/data/articles.json", "utf8"));
const allArticles = [...articles, ...(await catalogArticles())];
const inventory = buildInventory(discovery.pages, allArticles);
try {
  const migration = JSON.parse(
    await readFile("data/migration/catalog.json", "utf8"),
  );
  const entries = new Map(inventory.entries.map((e) => [e.url, e]));
  for (const row of migration.records) {
    const entry = entries.get(row.url);
    if (!entry) continue;
    if (entry.status !== "published") {
      entry.status = [
        "converted",
        "canonical-alias",
        "already-published",
      ].includes(row.status)
        ? row.url === row.canonical
          ? "published"
          : "redirect"
        : row.status;
      if (row.slug) entry.slug = row.slug;
    }
    entry.category = row.category;
    entry.type = row.type;
    if (row.canonical) entry.canonical = row.canonical;
    if (["held", "failed", "missing"].includes(row.status))
      entry.reason = row.reason;
  }
  const publishedSources = new Map();
  for (const article of allArticles)
    if (!publishedSources.has(classifyURL(article.source).url))
      publishedSources.set(classifyURL(article.source).url, article);
  for (const entry of inventory.entries) {
    if (entry.kind !== "article" && entry.status === "unreviewed")
      entry.status = "supporting";
    const article = publishedSources.get(entry.url);
    if (entry.status === "published" && article) {
      entry.category = article.category;
      entry.type = article.type || article.category;
    }
  }
  inventory.summary.published = inventory.entries.filter(
    (e) => e.status === "published",
  ).length;
  inventory.summary.redirects = inventory.entries.filter(
    (e) => e.status === "redirect",
  ).length;
  inventory.summary.held = inventory.entries.filter(
    (e) => e.status === "held",
  ).length;
  inventory.summary.sourceErrors = inventory.entries.filter((e) =>
    ["failed", "missing"].includes(e.status),
  ).length;
  inventory.summary.unreviewed = inventory.entries.filter(
    (e) => e.kind === "article" && e.status === "unreviewed",
  ).length;
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const output = JSON.stringify(inventory, null, 2) + "\n";
if (process.argv.includes("--check")) {
  if ((await readFile("data/inventory.json", "utf8")) !== output)
    throw new Error("Inventory is stale; run npm run inventory");
} else await writeFile("data/inventory.json", output);
console.log(
  JSON.stringify(
    {
      exhaustive: inventory.exhaustive,
      nextPage: inventory.nextPage,
      ...inventory.summary,
    },
    null,
    2,
  ),
);
