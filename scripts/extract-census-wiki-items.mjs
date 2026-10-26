// Extract primary-source identities from completed revision batches, offline.
import fs from "node:fs/promises";
import {
  parseRevisionBatch,
  revisionPages,
  itemIds,
} from "./census-item-source.mjs";
const plan = JSON.parse(
  await fs.readFile(".import-cache/census-items/plan.json", "utf8"),
);
const found = new Map(),
  missing = [];
for (const batch of plan) {
  let saved;
  try {
    saved = JSON.parse(await fs.readFile(batch.file, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    missing.push(batch.url);
    continue;
  }
  for (const page of new Set(
    revisionPages(parseRevisionBatch(saved.capture)).values(),
  )) {
    const revision = page.revisions[0],
      ids = itemIds(revision.slots.main.content);
    if (!ids.length) continue;
    found.set(page.pageid, {
      title: page.title,
      itemIds: ids,
      source:
        "https://dcuniverseonline.fandom.com/wiki/" +
        encodeURIComponent(page.title.replaceAll(" ", "_")) +
        "?oldid=" +
        revision.revid,
      revisionId: revision.revid,
      revisionTimestamp: revision.timestamp,
    });
  }
}
if (missing.length && !process.argv.includes("--partial"))
  throw new Error(missing.length + " raw revision batches are still missing");
const result = [...found.values()].sort((a, b) =>
  a.title.localeCompare(b.title, "en"),
);
await fs.writeFile(
  "data/census-wiki-items.json",
  JSON.stringify(result) + "\n",
);
console.log(
  JSON.stringify({
    articles: result.length,
    itemIds: result.reduce((n, r) => n + r.itemIds.length, 0),
    missingBatches: missing.length,
  }),
);
