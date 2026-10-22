// Explicit publication of an editorially reviewed stage, preserving old records.
import fs from "node:fs/promises";
import { normalize } from "./assign-guide-releases.mjs";
import { selectCatalogPublications } from "./catalog-convert.mjs";
import { issuesFor } from "./content-policy.mjs";
import { classifyURL } from "./wiki-urls.mjs";
import {
  catalogReleaseIds,
  recoverCatalogPublication,
  writeCatalogPublication,
} from "./catalog-publication.mjs";
const journal = ".import-cache/catalog/publication-journal.json";
const write = process.argv.includes("--write");
if (write && (await recoverCatalogPublication(journal))) {
  console.log("Recovered interrupted catalog publication");
  process.exit(0);
}
const stage = JSON.parse(
  await fs.readFile(".import-cache/catalog/staged.json", "utf8"),
);
const articles = JSON.parse(
  await fs.readFile("src/data/articles.json", "utf8"),
);
const sources = new Set(articles.map((a) => classifyURL(a.source).url));
const slugs = new Set(articles.map((a) => a.slug));
const mapping = JSON.parse(
  await fs.readFile("src/data/guide-releases.json", "utf8"),
);
const audit = JSON.parse(
  await fs.readFile("data/guide-release-assignments.json", "utf8"),
);
const releases = JSON.parse(
  await fs.readFile("src/data/releases.json", "utf8"),
);
const aliases = new Map(
  releases
    .filter((r) => r.id !== "anniversary-gifts")
    .flatMap((r) => r.aliases.map((u) => [normalize(u), [r.id]])),
);
let report = { schemaVersion: 1, records: [], aliases: [] };
try {
  report = JSON.parse(await fs.readFile("data/catalog-imports.json", "utf8"));
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
for (const group of selectCatalogPublications(stage.staged, articles)) {
  const entry = group.entry;
  for (const a of group.articles) {
    if (slugs.has(a.slug)) throw Error("Duplicate article slug: " + a.slug);
    const issues = issuesFor(a);
    if (issues.length) throw Error(a.slug + ": " + issues.join("; "));
    const target = stage.records.find(
      (r) => r.slug === entry.article.slug && r.status === "staged",
    );
    const downloads = JSON.parse(
      await fs.readFile("data/catalog-downloads.json", "utf8"),
    );
    const row = downloads.records.find((r) => r.url === target?.url);
    if (!row) throw Error("Missing capture record for " + a.slug);
    const capture = JSON.parse(await fs.readFile(row.cacheFile, "utf8"));
    mapping[a.slug] = catalogReleaseIds(capture.markdown, a.category, aliases);
    const ids = mapping[a.slug].filter(
      (id) => !["game-systems", "core-game"].includes(id),
    );
    audit.records.push({
      slug: a.slug,
      ids: mapping[a.slug],
      method: ids.length
        ? "source-release-badge-or-introduction"
        : "category-foundation",
      source: a.source,
      evidence: a.summary,
    });
    articles.push(a);
    sources.add(classifyURL(a.source).url);
    slugs.add(a.slug);
  }
}
for (const row of stage.records) {
  const index = report.records.findIndex((r) => r.url === row.url);
  const value = {
    ...row,
    status: row.status === "staged" ? "published" : row.status,
  };
  if (index < 0) report.records.push(value);
  else if (!(
    value.status === "existing-canonical" &&
    report.records[index].status === "published"
  ))
    report.records[index] = value;
}
for (const row of stage.aliases)
  if (!report.aliases.some((r) => r.source === row.source))
    report.aliases.push(row);
if (write)
  await writeCatalogPublication(
    [
      ["src/data/articles.json", articles],
      ["src/data/guide-releases.json", mapping],
      ["data/guide-release-assignments.json", audit],
      ["data/catalog-imports.json", report],
    ],
    journal,
  );
console.log(
  JSON.stringify(
    {
      write,
      articles: articles.length,
      published: report.records.filter((r) => r.status === "published").length,
      held: report.records.filter((r) => r.status === "held"),
      aliases: report.aliases.length,
    },
    null,
    2,
  ),
);
