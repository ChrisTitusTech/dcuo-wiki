import fs from "node:fs/promises";
import { catalogArticles } from "./catalog-files.mjs";
const articles = await catalogArticles();
const releases = JSON.parse(
  await fs.readFile("src/data/releases.json", "utf8"),
);
const index = articles.map((a) => ({
  slug: a.slug,
  title: a.title,
  category: a.category,
  type: a.type || a.category,
  summary: a.summary,
  source: a.source,
  releaseIds: a.releaseIds || ["game-systems"],
  releaseText: releases
    .filter((r) => a.releaseIds?.includes(r.id))
    .map((r) => r.label + " " + r.title)
    .join(" "),
  sections: a.sections.map((s, i) => [s.title, "section-" + i]),
}));
await fs.writeFile("src/data/catalog-index.json", JSON.stringify(index) + "\n");
await fs.mkdir("public", { recursive: true });
// Browsers fetch this once; article bodies and all editor documents stay out of it.
await fs.writeFile(
  "public/catalog-index.json",
  JSON.stringify(index.map(({ sections, source, ...r }) => r)) + "\n",
);
console.log(JSON.stringify({ catalogArticles: index.length }));
