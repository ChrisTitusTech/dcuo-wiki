// Account for every downloaded source; keep publication separate from sorting.
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { classifyCatalog, catalogBody } from "./catalog-classify.mjs";
import {
  canonicalCapture,
  convertCatalog,
  splitCatalogArticle,
} from "./catalog-convert.mjs";
import { reusableCatalogCapture } from "./catalog-cache.mjs";
import { classifyURL } from "./wiki-urls.mjs";

const write = process.argv.includes("--write");
const manifest = JSON.parse(
  await fs.readFile(".import-cache/catalog/download-progress.json", "utf8"),
);
const existing = JSON.parse(
  await fs.readFile("src/data/articles.json", "utf8"),
);
const published = new Map();
for (const article of existing)
  if (!published.has(classifyURL(article.source).url))
    published.set(classifyURL(article.source).url, article.slug);
const usedSlugs = new Set(existing.map((a) => a.slug));
const canonicalSlugs = new Map(published);
const records = [],
  groups = new Map(),
  images = new Map();
let processed = 0;
for (const row of manifest.records) {
  const record = { url: row.url, title: row.title, captureHash: row.sha256 };
  records.push(record);
  if (row.status !== "downloaded") {
    Object.assign(record, {
      status: row.status,
      reason: row.error,
      category: "Source errors",
      type: row.status === "missing" ? "Not found" : "Capture failed",
    });
    continue;
  }
  try {
    const capture = JSON.parse(await fs.readFile(row.cacheFile, "utf8"));
    if (!reusableCatalogCapture(capture, row.url, row.sha256))
      throw Error("Cached capture validation failed");
    const canonical = canonicalCapture(capture);
    const classification = classifyCatalog(capture, canonical.title);
    Object.assign(record, classification, { canonical: canonical.url });
    if (canonicalSlugs.has(canonical.url)) {
      Object.assign(record, {
        status: published.has(canonical.url)
          ? "already-published"
          : "canonical-alias",
        slug: canonicalSlugs.get(canonical.url),
      });
      if (published.has(canonical.url)) {
        const original = existing.find((a) => a.slug === record.slug);
        record.category = original.category;
        record.type = original.type || original.category;
        record.reason = "Existing published source classification";
      }
      continue;
    }
    const body = catalogBody(capture.markdown);
    const result = convertCatalog({ ...capture, markdown: body }, row, {
      classification,
    });
    result.article.type = classification.type;
    result.article.imported = true;
    result.article.classification = {
      reason: classification.reason,
      evidence: classification.evidence,
    };
    // Deterministic collision suffix, preserving every existing URL.
    if (usedSlugs.has(result.article.slug))
      result.article.slug +=
        "_" +
        createHash("sha256").update(canonical.url).digest("hex").slice(0, 10);
    const parts = splitCatalogArticle(result.article);
    for (const article of parts) {
      if (usedSlugs.has(article.slug))
        throw Error("Split slug collision: " + article.slug);
      usedSlugs.add(article.slug);
      const group = groups.get(article.category) || [];
      group.push(article);
      groups.set(article.category, group);
    }
    canonicalSlugs.set(canonical.url, parts[0].slug);
    Object.assign(record, {
      status: "converted",
      slug: parts[0].slug,
      parts: parts.map((a) => a.slug),
      navigationTemplatesRemoved: body !== capture.markdown,
    });
    for (const image of result.images) images.set(image.sourcePage, image);
  } catch (error) {
    Object.assign(record, {
      status: "held",
      category: record.category || "Reference",
      type: record.type || "Needs classification",
      reason: error.message,
    });
  }
  if (++processed % 1000 === 0)
    console.log(
      JSON.stringify({
        processed,
        converted: [...groups.values()].reduce((n, g) => n + g.length, 0),
      }),
    );
}
const counts = {},
  categories = {};
for (const r of records) {
  counts[r.status] = (counts[r.status] || 0) + 1;
  categories[r.category] = (categories[r.category] || 0) + 1;
}
const report = { schemaVersion: 1, counts, categories, records };
if (write) {
  const directory = "content/catalog";
  await fs.mkdir(directory, { recursive: true });
  // Only own the generated catalog files, never existing hand-edited content.
  for (const entry of await fs.readdir(directory))
    if (/^[A-Za-z]+\.json$/.test(entry))
      await fs.unlink(directory + "/" + entry);
  for (const [category, articles] of groups)
    await fs.writeFile(
      directory + "/" + category + ".json",
      JSON.stringify(articles) + "\n",
    );
  await fs.mkdir("data/migration", { recursive: true });
  await fs.writeFile(
    "data/migration/catalog.json",
    JSON.stringify(report) + "\n",
  );
  await fs.writeFile(
    "data/migration/media-sources.json",
    JSON.stringify([...images.values()]) + "\n",
  );
}
console.log(
  JSON.stringify(
    {
      write,
      counts,
      categories,
      convertedPages: [...groups.values()].reduce((n, g) => n + g.length, 0),
      uniqueImages: images.size,
    },
    null,
    2,
  ),
);
