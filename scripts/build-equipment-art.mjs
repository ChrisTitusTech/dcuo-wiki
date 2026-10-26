// Article artwork only; never infer an icon or rarity from an unknown Census ID.
import fs from "node:fs/promises";
import { catalogArticles } from "./catalog-files.mjs";
const known = JSON.parse(
  await fs.readFile("data/census-item-index.json", "utf8"),
);
const slugs = new Set(known.map((row) => row[1]).filter(Boolean));
const articles = [
  ...JSON.parse(await fs.readFile("src/data/articles.json", "utf8")),
  ...(await catalogArticles()),
];
const words = (value) =>
  value
    .toLowerCase()
    .replace(/ally:|\bthe\b|\bof\b|\band\b/g, "")
    .replace(/[^a-z0-9]/g, "");
const artwork = {};
for (const article of articles.filter((a) => slugs.has(a.slug))) {
  const image = article.sections
    .flatMap((s) => s.images || [])
    .find((i) => {
      const label = words(i.label || "");
      return (
        label &&
        !/visual effect|side view/i.test(i.label || "") &&
        !/^(?:[a-z]+icon|episode\d*|dlc\d*|map|tc\b)/i.test(i.label || "") &&
        (label.includes(words(article.title)) ||
          (article.title === "Brand of Hecate" && label === "tarotcard"))
      );
    });
  if (!image) continue;
  const url = new URL(image.url, "https://dcuo-wiki.com");
  if (
    url.origin === "https://dcuo-wiki.com" &&
    /^\/api\/catalog-media\/[a-f0-9]{64}$/.test(url.pathname)
  )
    artwork[article.slug] = url.pathname;
}
// Explicit item-template icons take precedence over article artwork.
const sourceDetails = JSON.parse(
  await fs.readFile("public/equipment-details.json", "utf8"),
);
for (const [slug, details] of Object.entries(sourceDetails)) {
  if (details.icon && /^\/api\/catalog-media\/[a-f0-9]{64}$/.test(details.icon))
    artwork[slug] = details.icon;
}
await fs.writeFile("public/equipment-art.json", JSON.stringify(artwork) + "\n");
console.log(JSON.stringify({ equipmentArtwork: Object.keys(artwork).length }));
