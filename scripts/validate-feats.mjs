import fs from "node:fs/promises";
const imported = JSON.parse(await fs.readFile("data/feat-import.json", "utf8"));
const sources = JSON.parse(await fs.readFile("data/feat-sources.json", "utf8"));
const catalog = JSON.parse(await fs.readFile("src/data/feats.json", "utf8"));
const resources = JSON.parse(
  await fs.readFile("data/feat-resource-audit.json", "utf8"),
);
if (imported.partial)
  throw Error(
    "A partial feat import cannot be published. Finish download-feats and run import-feats without --partial.",
  );
const failed = sources.records.filter(
  (r) => r.error && r.status !== "omitted-empty-or-missing",
);
if (failed.length)
  throw Error(`${failed.length} unresolved feat source downloads`);
if (imported.sources !== sources.records.filter((r) => !r.error).length)
  throw Error("Feat conversion is not based on the complete source manifest");
if (
  imported.feats !== catalog.feats.length ||
  resources.records.length !== catalog.feats.length
)
  throw Error("Feat catalog or resource audit is stale");
const unique = new Set(catalog.feats.map((f) => f.id));
if (unique.size !== catalog.feats.length || !unique.size)
  throw Error("Empty or duplicate feat IDs");
for (const f of catalog.feats) {
  if (!f.effort || !f.bundle || !Array.isArray(f.videos))
    throw Error("Missing farming plan metadata: " + f.title);
}
console.log(
  `${catalog.feats.length} feat entries, ${imported.articles.length} articles and ${sources.records.length} inspected sources passed coverage checks.`,
);
