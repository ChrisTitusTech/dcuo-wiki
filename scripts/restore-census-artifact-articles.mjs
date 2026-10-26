// Recover missing artifact effects from revision-pinned source templates.
// Existing article bodies stay intact. New articles use the existing converter.
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  parseRevisionBatch,
  revisionPages,
  titleKey,
  sourceTitle,
} from "./census-item-source.mjs";
import { infoboxArtifactDetails } from "./census-item-artifacts.mjs";
import { convertCatalog, splitCatalogArticle } from "./catalog-convert.mjs";
const read = async (path) => JSON.parse(await fs.readFile(path, "utf8"));
const report = await read("data/migration/catalog.json"),
  community = await read("data/census-community-items.json");
const plan = await read(".import-cache/census-items/plan.json"),
  revisions = new Map();
for (const batch of plan) {
  try {
    const saved = await read(batch.file);
    for (const [key, page] of revisionPages(parseRevisionBatch(saved.capture)))
      revisions.set(titleKey(key), page);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
}
const names = [
  ...new Set(
    community.filter((r) => r.kind === "Artifacts").map((r) => r.sourceTitle),
  ),
];
const groups = new Map();
for (const file of (await fs.readdir("content/catalog")).filter((f) =>
  f.endsWith(".json"),
))
  groups.set(file.slice(0, -5), await read("content/catalog/" + file));
const errors = [],
  restored = [];
for (const name of names) {
  const page = revisions.get(titleKey(name));
  if (!page) {
    errors.push({ name, error: "Raw revision unavailable" });
    continue;
  }
  const rows = report.records.filter(
    (r) => titleKey(sourceTitle(r.canonical || r.url)) === titleKey(page.title),
  );
  const row =
    rows.find((r) => titleKey(sourceTitle(r.url)) === titleKey(page.title)) ||
    rows[0];
  if (!row) {
    errors.push({ name, error: "No archived article source" });
    continue;
  }
  if (row.status === "converted") continue;
  try {
    const box = await read(
      ".import-cache/census-items/infobox-" +
        createHash("sha256").update(row.canonical).digest("hex") +
        ".json",
    );
    const details = infoboxArtifactDetails(box.capture.html);
    const old = await read(row.captureFile);
    const capture = {
      ...old,
      markdown: old.markdown + details.markdown,
      retrieved: new Date().toISOString(),
    };
    // The original HTML and hash are kept; the supplemental revision remains
    // independently pinned instead of rewriting the archived source capture.
    const converted = convertCatalog(capture, {
      priority: 0,
      category: "Equipment",
    });
    const article = {
      ...converted.article,
      type: "Artifacts",
      releaseIds: ["game-systems"],
      classification: {
        reason:
          "Source Item template explicitly identifies an artifact and supplies effects and rank bonuses.",
      },
      sourceSupplement: {
        retrieved: box.retrieved,
        url: box.url,
        sha256: createHash("sha256").update(box.capture.html).digest("hex"),
      },
    };
    // Register every retained image in the existing approved R2 mirror manifest.
    const media = await read("data/migration/catalog-media.json");
    const mediaBySource = new Map(media.map((m) => [m.sourcePage, m]));
    for (const image of converted.images) {
      const id = createHash("sha256").update(image.originalUrl).digest("hex");
      if (!media.some((m) => m.id === id)) media.push({ ...image, id });
      mediaBySource.set(image.sourcePage, { ...image, id });
    }
    for (const section of article.sections)
      for (const image of section.images || []) {
        const source = mediaBySource.get(image.url);
        if (!source) throw new Error("Unregistered article image");
        image.url = "https://dcuo-wiki.com/api/catalog-media/" + source.id;
      }
    for (const [category, articles] of groups)
      groups.set(
        category,
        articles.filter((a) => !rows.some((r) => r.parts?.includes(a.slug))),
      );
    const parts = splitCatalogArticle(article);
    groups.get("Equipment").push(...parts);
    Object.assign(row, {
      category: "Equipment",
      type: "Artifacts",
      reason: article.classification.reason,
      status: "converted",
      slug: article.slug,
      parts: parts.map((a) => a.slug),
      supplementalSource: article.sourceSupplement,
    });
    for (const alias of rows.filter((r) => r !== row))
      Object.assign(alias, {
        category: "Equipment",
        type: "Artifacts",
        status: "canonical-alias",
        slug: article.slug,
        reason: "Source redirect to the restored artifact article",
      });
    if (process.argv.includes("--write"))
      await fs.writeFile(
        "data/migration/catalog-media.json",
        JSON.stringify(media) + "\n",
      );
    restored.push({
      slug: article.slug,
      ranks: details.ranks.length,
      revision: page.revisions[0].revid,
    });
  } catch (e) {
    errors.push({ name, error: e.message });
  }
}
if (process.argv.includes("--write")) {
  for (const [category, articles] of groups)
    await fs.writeFile(
      "content/catalog/" + category + ".json",
      JSON.stringify(articles) + "\n",
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
  for (const category of Object.keys(report.categories))
    await fs.writeFile(
      "data/migration/filed/" + category.replaceAll(" ", "-") + ".json",
      JSON.stringify(report.records.filter((r) => r.category === category)) +
        "\n",
    );
}
await fs.writeFile(
  ".import-cache/census-items/artifact-restoration.json",
  JSON.stringify({ restored, errors }, null, 2) + "\n",
);
console.log(JSON.stringify({ restored: restored.length, errors }));
