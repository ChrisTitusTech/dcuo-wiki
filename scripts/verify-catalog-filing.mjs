import fs from "node:fs/promises";
import { catalogArticles } from "./catalog-files.mjs";
const bulk = JSON.parse(
  await fs.readFile("data/migration/catalog.json", "utf8"),
);
const prior = JSON.parse(
  await fs.readFile("data/migration/prior-captures.json", "utf8"),
);
const records = [...bulk.records, ...prior.records].filter(
  (r) => r.captureFile && r.filedCapture,
);
let cursor = 0;
const failures = [];
await Promise.all(
  Array.from({ length: 12 }, async () => {
    while (cursor < records.length) {
      const r = records[cursor++];
      try {
        const [a, b] = await Promise.all([
          fs.stat(r.captureFile),
          fs.stat(r.filedCapture),
        ]);
        if (a.ino !== b.ino || a.dev !== b.dev)
          throw Error("Original and filed capture differ");
      } catch (e) {
        failures.push({
          capture: r.captureFile,
          filed: r.filedCapture,
          error: e.message,
        });
      }
    }
  }),
);
const articles = await catalogArticles(),
  existing = JSON.parse(await fs.readFile("src/data/articles.json", "utf8"));
const summary = {
  sourceFiles: records.length,
  filedSourceFiles: records.length - failures.length,
  failures,
  bulk: bulk.counts,
  prior: prior.counts,
  preparedArticles: articles.length,
  totalArticles: existing.length + articles.length,
  categories: Object.fromEntries(
    [...new Set(articles.map((a) => a.category))]
      .sort()
      .map((c) => [c, articles.filter((a) => a.category === c).length]),
  ),
  approvedMedia: JSON.parse(
    await fs.readFile("data/migration/catalog-media.json", "utf8"),
  ).length,
};
await fs.writeFile(
  "data/migration/summary.json",
  JSON.stringify(summary, null, 2) + "\n",
);
console.log(JSON.stringify(summary, null, 2));
if (failures.length) process.exitCode = 1;
