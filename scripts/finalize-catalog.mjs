import fs from "node:fs/promises";
import { catalogArticles } from "./catalog-files.mjs";
import { splitCatalogArticle } from "./catalog-convert.mjs";
import { articleParts, renderPart } from "../shared/article-content.mjs";
import { baselineDocument } from "../shared/rich-article.mjs";
const report = JSON.parse(
  await fs.readFile("data/migration/catalog.json", "utf8"),
);
const sources = new Map();
for (const a of await catalogArticles()) {
  const list = sources.get(a.source) || [];
  list.push(a);
  sources.set(a.source, list);
}
const final = [];
for (const row of report.records.filter((r) => r.status === "converted")) {
  const originals = sources.get(row.canonical);
  const root = originals.find((a) => a.slug === row.slug) || originals[0];
  const article = {
    ...root,
    slug: row.slug,
    title: decodeURIComponent(
      new URL(row.canonical).pathname.slice(6),
    ).replaceAll("_", " "),
    sections: [],
    related: [],
  };
  delete article.galleryContinuation;
  delete article.catalogDirectory;
  if (
    /_(?:Costume_List|Styles|Style_List)$/.test(
      new URL(row.canonical).pathname.slice(6),
    )
  ) {
    article.category = "Equipment";
    article.type = "Styles";
    row.category = "Equipment";
    row.type = "Styles";
  }
  const leaves = originals.filter(
    (a) =>
      !a.catalogDirectory &&
      !(
        a.related?.length &&
        a.sections.length === 2 &&
        a.sections[1].title === "Article parts"
      ),
  );
  for (const section of leaves.flatMap((a) => a.sections)) {
    const groups = [];
    let items = [],
      length = 0;
    for (const item of section.items) {
      const clean = item
        .replace(/\s+(?:or|and)\s+(?:the\s+)?\[\[\]\]/gi, "")
        .replace(/\[\[\]\]/g, "")
        .trim();
      if (!clean) continue;
      if (items.length && length + clean.length + 3 > 6500) {
        groups.push(items);
        items = [];
        length = 0;
      }
      items.push(clean);
      length += clean.length + 3;
    }
    if (items.length) groups.push(items);
    const imageGroups = [];
    let images = [],
      size = 0;
    for (const image of section.images || []) {
      if (image.url.startsWith("https://dcuo-wiki.com/api/catalog-media/"))
        image.url = new URL(image.url).origin + new URL(image.url).pathname;
      const bytes = image.label.length + image.url.length + 4;
      if (images.length && size + bytes > 6500) {
        imageGroups.push(images);
        images = [];
        size = 0;
      }
      images.push(image);
      size += bytes;
    }
    if (images.length) imageGroups.push(images);
    const parent = { ...section, items: groups.shift() || [] };
    if (imageGroups.length) parent.images = imageGroups.shift();
    article.sections.push(parent);
    for (let i = 0; i < groups.length; i++)
      article.sections.push({
        title: section.title + " (continued " + (i + 2) + ")",
        items: groups[i],
        ...(section.references ? { references: section.references } : {}),
      });
    for (let i = 0; i < imageGroups.length; i++)
      article.sections.push({
        title: section.title + " - gallery " + (i + 2),
        items: [],
        images: imageGroups[i],
      });
  }
  article.summary = article.summary
    .replace(/\s+(?:or|and)\s+(?:the\s+)?\[\[\]\]/gi, "")
    .replace(/\[\[\]\]/g, "")
    .trim();
  for (const part of articleParts(article))
    if (part.text.trim()) renderPart(part, part.text, { slug: article.slug });
  let parts, error;
  for (const budget of [60000, 30000, 15000]) {
    try {
      parts = splitCatalogArticle(article, budget);
      for (const a of parts)
        baselineDocument(
          a,
          articleParts(a),
          parts.filter((r) => a.related?.includes(r.slug)),
        );
      error = null;
      break;
    } catch (e) {
      error = e;
    }
  }
  if (error) throw Error(article.slug + ": " + error.message);
  final.push(...parts);
  row.parts = parts.map((a) => a.slug);
}
const groups = new Map(),
  slugs = new Set();
for (const a of final) {
  if (slugs.has(a.slug)) throw Error("Duplicate final slug: " + a.slug);
  slugs.add(a.slug);
  const list = groups.get(a.category) || [];
  list.push(a);
  groups.set(a.category, list);
}
for (const [category, values] of groups)
  await fs.writeFile(
    "content/catalog/" + category + ".json",
    JSON.stringify(values) + "\n",
  );
report.categories = {};
for (const row of report.records)
  report.categories[row.category] = (report.categories[row.category] || 0) + 1;
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
console.log(JSON.stringify({ finalArticles: final.length }));
