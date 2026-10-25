// Reassess held extraction using specific source types, without weakening quest gates.
import fs from "node:fs/promises";
import { catalogArticles } from "./catalog-files.mjs";
import { canonicalCapture, convertCatalog } from "./catalog-convert.mjs";
import { classifyCatalog, catalogBody } from "./catalog-classify.mjs";
import { classifyURL } from "./wiki-urls.mjs";
const report = JSON.parse(
  await fs.readFile("data/migration/catalog.json", "utf8"),
);
const existing = JSON.parse(
  await fs.readFile("src/data/articles.json", "utf8"),
);
const articles = await catalogArticles(),
  sources = new Map(),
  slugs = new Set([...existing, ...articles].map((a) => a.slug));
for (const a of [...existing, ...articles])
  if (!sources.has(classifyURL(a.source).url))
    sources.set(classifyURL(a.source).url, a);
const images = new Map(
  JSON.parse(
    await fs.readFile("data/migration/media-sources.json", "utf8"),
  ).map((i) => [i.sourcePage, i]),
);
let recovered = 0,
  recategorized = 0;
for (const row of report.records.filter((r) => r.status === "held")) {
  try {
    const capture = JSON.parse(await fs.readFile(row.captureFile, "utf8"));
    const canonical = canonicalCapture(capture),
      classification = classifyCatalog(capture, canonical.title);
    if (row.category !== classification.category) recategorized++;
    Object.assign(row, classification, { canonical: canonical.url });
    if (sources.has(canonical.url)) {
      const a = sources.get(canonical.url);
      Object.assign(row, {
        status: "canonical-alias",
        slug: a.slug,
        category: a.category,
        type: a.type || a.category,
        reason: "Canonical source already has a substantive article",
      });
      continue;
    }
    const result = convertCatalog(
      { ...capture, markdown: catalogBody(capture.markdown) },
      { ...row, priority: 4 },
      { classification },
    );
    const article = {
      ...result.article,
      type: classification.type,
      imported: true,
      classification: {
        reason: classification.reason,
        evidence: classification.evidence,
      },
      releaseIds: [],
    };
    if (slugs.has(article.slug)) throw Error("Slug collision requires review");
    slugs.add(article.slug);
    articles.push(article);
    sources.set(article.source, article);
    Object.assign(row, {
      status: "converted",
      slug: article.slug,
      parts: [article.slug],
    });
    for (const image of result.images)
      if (!images.has(image.sourcePage)) images.set(image.sourcePage, image);
    recovered++;
  } catch (error) {
    row.reason = error.message;
  }
}
const groups = new Map();
for (const a of articles) {
  const group = groups.get(a.category) || [];
  group.push(a);
  groups.set(a.category, group);
}
for (const [category, values] of groups)
  await fs.writeFile(
    "content/catalog/" + category + ".json",
    JSON.stringify(values) + "\n",
  );
report.counts = {};
report.categories = {};
for (const r of report.records) {
  report.counts[r.status] = (report.counts[r.status] || 0) + 1;
  report.categories[r.category] = (report.categories[r.category] || 0) + 1;
}
await fs.writeFile(
  "data/migration/catalog.json",
  JSON.stringify(report) + "\n",
);
await fs.writeFile(
  "data/migration/media-sources.json",
  JSON.stringify([...images.values()]) + "\n",
);
console.log(
  JSON.stringify({ recovered, recategorized, counts: report.counts }),
);
