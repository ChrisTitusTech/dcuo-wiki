// Source-only editor documents. Never include database content or credentials.
import fs from "node:fs/promises";
import articles from "../src/data/articles.json" with { type: "json" };
import { catalogEditorBaseline } from "./editor-baseline.mjs";
import { catalogArticles } from "./catalog-files.mjs";
import { catalogPackPath, packLine } from "../shared/catalog-packs.mjs";
const directory = "dist/_editor";
await fs.rm(directory, { recursive: true, force: true });
await fs.mkdir(directory, { recursive: true });
await fs.rm("dist/_catalog", { recursive: true, force: true });
await fs.mkdir("dist/_catalog", { recursive: true });
const catalog = [...articles, ...(await catalogArticles())];
const bySlug = new Map(catalog.map((a) => [a.slug, a]));
const packs = new Map();
let bytes = 0;
for (const article of catalog) {
  if (!/^[A-Za-z0-9_-]+$/.test(article.slug))
    throw Error("Unsafe editor asset slug");
  const related = new Set(article.related || []);
  // Preserve original catalog ordering for existing revision/draft hashes.
  const relatedArticles = articles.filter((a) => related.has(a.slug));
  for (const slug of related)
    if (!articles.some((a) => a.slug === slug) && bySlug.has(slug))
      relatedArticles.push(bySlug.get(slug));
  const payload = catalogEditorBaseline(article, relatedArticles);
  const filename = "dist" + catalogPackPath(article.slug);
  const lines = packs.get(filename) || [];
  lines.push(packLine(article.slug, "article", article));
  lines.push(packLine(article.slug, "editor", payload));
  if (article.imported && article.category === "Housing") {
    const file = "dist/wiki/" + article.slug + "/index.html";
    lines.push(packLine(article.slug, "html", await fs.readFile(file, "utf8")));
    await fs.unlink(file);
  }
  packs.set(filename, lines);
}
for (const [filename, lines] of packs) {
  const payload = lines.join("");
  bytes += Buffer.byteLength(payload);
  await fs.writeFile(filename, payload);
}
const media = JSON.parse(
  await fs.readFile("data/migration/catalog-media.json", "utf8"),
);
for (const source of media)
  await fs.appendFile(
    "dist" + catalogPackPath(source.id),
    packLine(source.id, "media", source),
  );
console.log(
  JSON.stringify({
    editorBaselines: catalog.length,
    sourcePacks: packs.size,
    bytes,
  }),
);
