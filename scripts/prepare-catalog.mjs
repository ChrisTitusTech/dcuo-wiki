// Finalize release evidence, reusable R2 references and category filing.
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfm } from "micromark-extension-gfm";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { directRelease, normalize } from "./assign-guide-releases.mjs";
import { mediaAsset } from "../shared/media.mjs";
const read = async (p) => JSON.parse(await fs.readFile(p, "utf8"));
const manifest = await read(".import-cache/catalog/download-progress.json");
const records = await read("data/migration/catalog.json");
const downloads = new Map(manifest.records.map((r) => [r.url, r]));
for (const r of records.records)
  r.captureFile = downloads.get(r.url)?.cacheFile;
const bySource = new Map(
  records.records
    .filter((r) => r.status === "converted")
    .map((r) => [r.canonical, r]),
);
const sources = await read("data/migration/media-sources.json");
const media = new Map(sources.map((r) => [new URL(r.sourcePage).href, r]));
const byId = new Map(
  sources.map((r) => [
    createHash("sha256").update(r.originalUrl).digest("hex"),
    r,
  ]),
);
const mediaRecords = new Map();
const releases = await read("src/data/releases.json");
const aliases = new Map(
  releases
    .filter((r) => r.id !== "anniversary-gifts")
    .flatMap((r) => r.aliases.map((a) => [normalize(a), [r.id]])),
);
for (const filename of (await fs.readdir("content/catalog")).filter((f) =>
  f.endsWith(".json"),
)) {
  const articles = await read("content/catalog/" + filename);
  for (const article of articles) {
    const row = bySource.get(article.source);
    const capture = await read(row.captureFile);
    const intro = capture.markdown.split(/^#{1,6} /m)[0];
    const nodes = fromMarkdown(intro, {
      extensions: [gfm()],
      mdastExtensions: [gfmFromMarkdown()],
    }).children;
    const ids = directRelease(nodes, aliases);
    article.releaseIds = ids.length
      ? ids
      : [
          article.category === "Locations" || article.category === "Characters"
            ? "core-game"
            : "game-systems",
        ];
    article.releaseIds = [
      ...new Set([
        ...article.releaseIds,
        ...article.releaseIds
          .map((id) => releases.find((r) => r.id === id)?.arc)
          .filter(Boolean),
      ]),
    ];
    for (const section of article.sections)
      for (const image of section.images || []) {
        const existing = mediaAsset(image.url);
        if (existing) {
          const id = /^\/api\/catalog-media\/([a-f0-9]{64})$/.exec(
            new URL(image.url).pathname,
          )?.[1];
          if (id) {
            if (!byId.has(id)) throw Error("Unfiled mirrored image");
            mediaRecords.set(id, { ...byId.get(id), id });
          }
          continue;
        }
        const source = media.get(new URL(image.url).href);
        if (!source) throw Error("Unfiled image source: " + image.url);
        const id = createHash("sha256")
          .update(source.originalUrl)
          .digest("hex");
        mediaRecords.set(id, { ...source, id });
        image.url =
          "https://dcuo-wiki.com/api/catalog-media/" +
          id +
          "?source=" +
          encodeURIComponent(new URL(source.sourcePage).href);
      }
  }
  await fs.writeFile(
    "content/catalog/" + filename,
    JSON.stringify(articles) + "\n",
  );
  console.log(
    JSON.stringify({ prepared: filename, articles: articles.length }),
  );
}
await fs.writeFile(
  "data/migration/catalog-media.json",
  JSON.stringify([...mediaRecords.values()]) + "\n",
);
const directory = "data/migration/filed";
await fs.mkdir(directory, { recursive: true });
for (const category of Object.keys(records.categories)) {
  const rows = records.records.filter((r) => r.category === category);
  await fs.writeFile(
    directory + "/" + category.replaceAll(" ", "-") + ".json",
    JSON.stringify(rows) + "\n",
  );
}
await fs.writeFile(
  "data/migration/catalog.json",
  JSON.stringify(records) + "\n",
);
console.log(
  JSON.stringify({
    filed: records.records.length,
    approvedMedia: mediaRecords.size,
  }),
);
