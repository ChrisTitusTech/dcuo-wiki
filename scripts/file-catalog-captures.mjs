// File the verified original HTML/Markdown captures locally without duplicating bytes.
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { reusableCatalogCapture } from "./catalog-cache.mjs";
const report = JSON.parse(
  await fs.readFile("data/migration/catalog.json", "utf8"),
);
let next = 0,
  filed = 0;
await Promise.all(
  Array.from({ length: 12 }, async () => {
    while (next < report.records.length) {
      const row = report.records[next++];
      if (!row.captureHash) continue;
      const capture = JSON.parse(await fs.readFile(row.captureFile, "utf8"));
      if (!reusableCatalogCapture(capture, row.url, row.captureHash))
        throw Error("Source validation failed: " + row.url);
      const category = row.category.replace(/[^A-Za-z0-9_-]/g, "-");
      const title =
        row.title.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 96) || "source";
      const digest = createHash("sha256").update(row.url).digest("hex");
      const directory = ".import-cache/filed/" + category + "/" + row.status;
      await fs.mkdir(directory, { recursive: true });
      const previous = row.filedCapture;
      row.filedCapture = directory + "/" + title + "--" + digest + ".json";
      try {
        await fs.link(row.captureFile, row.filedCapture);
      } catch (e) {
        if (e.code !== "EEXIST") throw e;
        const [a, b] = await Promise.all([
          fs.stat(row.captureFile),
          fs.stat(row.filedCapture),
        ]);
        if (a.ino !== b.ino || a.dev !== b.dev)
          throw Error(
            "Filed source differs; retain both for review: " + row.filedCapture,
          );
      }
      if (previous && previous !== row.filedCapture) {
        if (!previous.startsWith(".import-cache/filed/"))
          throw Error("Unexpected prior archive path");
        const [a, b] = await Promise.all([
          fs.stat(row.captureFile),
          fs.stat(previous),
        ]);
        if (a.ino !== b.ino || a.dev !== b.dev)
          throw Error("Prior archive differs; retain for inspection");
        await fs.unlink(previous);
      }
      filed++;
    }
  }),
);
await fs.writeFile(
  "data/migration/catalog.json",
  JSON.stringify(report) + "\n",
);
for (const category of Object.keys(report.categories)) {
  const rows = report.records.filter((r) => r.category === category);
  await fs.writeFile(
    "data/migration/filed/" + category.replaceAll(" ", "-") + ".json",
    JSON.stringify(rows) + "\n",
  );
  const directory =
    ".import-cache/filed/" + category.replace(/[^A-Za-z0-9_-]/g, "-");
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(
    directory + "/index.json",
    JSON.stringify(rows, null, 2) + "\n",
  );
}
console.log(
  JSON.stringify({
    filedOriginalCaptures: filed,
    sourceErrors: report.records.length - filed,
    archive: path.resolve(".import-cache/filed"),
  }),
);
