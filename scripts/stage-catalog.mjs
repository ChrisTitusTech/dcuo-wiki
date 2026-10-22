// Reviewable output only. This command never publishes or overwrites articles.
import fs from "node:fs/promises";
import { canonicalCapture, convertCatalog } from "./catalog-convert.mjs";
import { classifyURL } from "./wiki-urls.mjs";
const manifest = JSON.parse(
  await fs.readFile("data/catalog-downloads.json", "utf8"),
);
const articles = JSON.parse(
  await fs.readFile("src/data/articles.json", "utf8"),
);
const published = new Map(
  articles.map((a) => [classifyURL(a.source).url, a.slug]),
);
const slugs = new Set(articles.map((a) => a.slug));
const staged = [],
  records = [],
  aliases = [];
for (const target of manifest.records) {
  if (target.status !== "downloaded") continue;
  if (target.priority !== 0) continue;
  try {
    const capture = JSON.parse(await fs.readFile(target.cacheFile, "utf8"));
    const canonical = canonicalCapture(capture);
    if (published.has(canonical.url)) {
      const slug = published.get(canonical.url);
      records.push({ url: target.url, status: "existing-canonical", slug });
      if (target.url !== canonical.url)
        aliases.push({ source: target.url, slug, canonical: canonical.url });
      continue;
    }
    const result = convertCatalog(capture, target);
    if (slugs.has(result.article.slug))
      throw Error("Slug collision requires review");
    staged.push(result);
    slugs.add(result.article.slug);
    published.set(canonical.url, result.article.slug);
    records.push({
      url: target.url,
      status: "staged",
      slug: result.article.slug,
      canonical: canonical.url,
    });
    if (target.url !== canonical.url)
      aliases.push({
        source: target.url,
        slug: result.article.slug,
        canonical: canonical.url,
      });
  } catch (e) {
    records.push({ url: target.url, status: "held", reason: e.message });
  }
}
await fs.mkdir(".import-cache/catalog", { recursive: true });
await fs.writeFile(
  ".import-cache/catalog/staged.json",
  JSON.stringify({ staged, records, aliases }, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      staged: staged.length,
      images: new Set(staged.flatMap((r) => r.images).map((i) => i.sourcePage))
        .size,
      records,
    },
    null,
    2,
  ),
);
