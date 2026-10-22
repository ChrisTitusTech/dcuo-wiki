// Source-only editor documents. Never include database content or credentials.
import fs from "node:fs/promises";
import articles from "../src/data/articles.json" with { type: "json" };
import { catalogEditorBaseline } from "./editor-baseline.mjs";
const directory = "dist/_editor";
await fs.rm(directory, { recursive: true, force: true });
await fs.mkdir(directory, { recursive: true });
let bytes = 0;
for (const article of articles) {
  if (!/^[A-Za-z0-9_-]+$/.test(article.slug))
    throw Error("Unsafe editor asset slug");
  const payload = JSON.stringify(catalogEditorBaseline(article, articles));
  bytes += Buffer.byteLength(payload);
  await fs.writeFile(directory + "/" + article.slug + ".json", payload);
}
console.log(JSON.stringify({ editorBaselines: articles.length, bytes }));
