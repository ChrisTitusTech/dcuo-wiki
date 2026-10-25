// Reconcile every converted source with the final rules without changing URLs.
import fs from "node:fs/promises";
import { classifyCatalog } from "./catalog-classify.mjs";
import { catalogArticles } from "./catalog-files.mjs";
const report = JSON.parse(
  await fs.readFile("data/migration/catalog.json", "utf8"),
);
const articles = await catalogArticles(),
  indexed = new Map(articles.map((a) => [a.slug, a]));
let moved = 0;
const heldSources = new Set();
for (const row of report.records) {
  if (row.status !== "converted") continue;
  const capture = JSON.parse(await fs.readFile(row.captureFile, "utf8"));
  const result = classifyCatalog(
    capture,
    decodeURIComponent(new URL(row.canonical).pathname.slice(6)),
  );
  if (result.category === row.category && result.type === row.type) continue;
  if (result.category === "Quests") {
    Object.assign(row, result, {
      status: "held",
      reason:
        "Mission requires location and YouTube research before publication",
    });
    heldSources.add(row.canonical);
    continue;
  }
  for (const slug of row.parts) {
    const a = indexed.get(slug);
    a.category = result.category;
    a.type = result.type;
    a.classification = { reason: result.reason, evidence: result.evidence };
  }
  Object.assign(row, result);
  moved++;
}
const groups = new Map();
for (const a of articles) {
  if (heldSources.has(a.source)) continue;
  const group = groups.get(a.category) || [];
  group.push(a);
  groups.set(a.category, group);
}
const canonicalRows = new Map(
  report.records
    .filter((r) => r.status === "converted")
    .map((r) => [r.canonical, r]),
);
for (const row of report.records) {
  const primary = canonicalRows.get(row.canonical);
  if (row.status === "canonical-alias" && primary) {
    for (const key of ["category", "type", "reason", "evidence"])
      row[key] = primary[key];
  }
  if (row.status === "canonical-alias" && heldSources.has(row.canonical))
    Object.assign(row, {
      status: "held",
      category: "Quests",
      type: "Missions",
      reason:
        "Canonical mission requires location and YouTube research before publication",
    });
}
for (const [category, values] of groups)
  await fs.writeFile(
    "content/catalog/" + category + ".json",
    JSON.stringify(values) + "\n",
  );
report.counts = {};
report.categories = {};
for (const row of report.records) {
  report.categories[row.category] = (report.categories[row.category] || 0) + 1;
  report.counts[row.status] = (report.counts[row.status] || 0) + 1;
}
await fs.writeFile(
  "data/migration/catalog.json",
  JSON.stringify(report) + "\n",
);
for (const category of Object.keys(report.categories))
  await fs.writeFile(
    "data/migration/filed/" + category.replaceAll(" ", "-") + ".json",
    JSON.stringify(report.records.filter((x) => x.category === category)) +
      "\n",
  );
console.log(
  JSON.stringify({ reclassified: moved, missionsHeld: heldSources.size }),
);
