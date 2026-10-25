// Reconvert only approved sources that actually contain currency artwork.
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { catalogArticles } from "./catalog-files.mjs";
import { catalogBody } from "./catalog-classify.mjs";
import { convertCatalog } from "./catalog-convert.mjs";
import { currencyImageName } from "./catalog-currency.mjs";
import { mediaAsset } from "../shared/media.mjs";
const report = JSON.parse(
  await fs.readFile("data/migration/catalog.json", "utf8"),
);
const originals = await catalogArticles(),
  bySlug = new Map(originals.map((a) => [a.slug, a]));
const media = new Map(
  JSON.parse(
    await fs.readFile("data/migration/media-sources.json", "utf8"),
  ).map((s) => [new URL(s.sourcePage).href, s]),
);
const replacements = new Map();
let checked = 0;
for (const row of report.records.filter((r) => r.status === "converted")) {
  const capture = JSON.parse(await fs.readFile(row.captureFile, "utf8"));
  const body = catalogBody(capture.markdown);
  const icons = [...body.matchAll(/!\[([^\]]*)\]\((https:\/\/[^\s)]+)/g)];
  if (
    !icons.some((m) =>
      currencyImageName({ type: "image", alt: m[1], url: m[2] }),
    )
  )
    continue;
  const previous = bySlug.get(row.slug);
  const result = convertCatalog(
    { ...capture, markdown: body },
    { ...row, priority: 4 },
    { classification: { category: previous.category } },
  );
  const article = {
    ...previous,
    sections: result.article.sections,
    summary: result.article.summary,
    related: [],
    currencyLabelsRestored: true,
  };
  // This is the complete re-converted source, not its former directory/part.
  delete article.catalogDirectory;
  delete article.galleryContinuation;
  for (const section of article.sections)
    for (const image of section.images || []) {
      if (mediaAsset(image.url)) continue;
      const source = media.get(new URL(image.url).href);
      if (!source) throw Error("Unfiled image: " + image.url);
      image.url =
        "https://dcuo-wiki.com/api/catalog-media/" +
        createHash("sha256").update(source.originalUrl).digest("hex");
    }
  replacements.set(article.source, article);
  row.currencyLabelsRestored = true;
  checked++;
}
const final = originals
  .filter((a) => !replacements.has(a.source))
  .concat([...replacements.values()]);
const groups = new Map();
for (const a of final) {
  const group = groups.get(a.category) || [];
  group.push(a);
  groups.set(a.category, group);
}
for (const [category, articles] of groups)
  await fs.writeFile(
    "content/catalog/" + category + ".json",
    JSON.stringify(articles) + "\n",
  );
await fs.writeFile(
  "data/migration/catalog.json",
  JSON.stringify(report) + "\n",
);
console.log(JSON.stringify({ currencySourcesRestored: checked }));
