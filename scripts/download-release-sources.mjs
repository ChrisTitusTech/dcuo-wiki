import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parseEnv } from "node:util";
import { scrape } from "./firecrawl.mjs";
import { classifyURL } from "./wiki-urls.mjs";
let env = {};
try {
  env = parseEnv(await readFile(".env", "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const key =
  process.env.FIRECRAWL_API_KEY ||
  process.env.FIRECRAWL_KEY ||
  env.FIRECRAWL_API_KEY ||
  env.FIRECRAWL_KEY ||
  env.firecrawl_key;
const catalogOnly = process.argv.includes("--catalog");
const catalog = JSON.parse(await readFile("src/data/releases.json", "utf8"));
let support = [];
try {
  support = JSON.parse(
    await readFile("data/release-support-sources.json", "utf8"),
  );
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const urls = [
  ...new Set(
    (catalogOnly
      ? ["Episode", "Chapter", "Events"].map(
          (title) => "https://dcuniverseonline.fandom.com/wiki/" + title,
        )
      : [...catalog.map((r) => r.source), ...support.map((item) => item.url)]
    ).map((url) => classifyURL(url).url),
  ),
];
await mkdir(".import-cache/releases", { recursive: true });
let next = 0,
  failed = 0;
const records = [];
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (next < urls.length) {
      const url = urls[next++];
      const file = catalogOnly
        ? ".import-cache/releases/" + classifyURL(url).title + ".json"
        : ".import-cache/" +
          createHash("sha256").update(url).digest("hex") +
          ".json";
      try {
        let c;
        try {
          c = JSON.parse(await readFile(file, "utf8"));
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
        if (!c?.html || !c?.markdown) {
          const data = await scrape(url, { key });
          c = {
            ...data,
            url,
            retrieved: new Date().toISOString(),
            status: "needs-review",
          };
          await writeFile(file + ".tmp", JSON.stringify(c, null, 2) + "\n");
          await rename(file + ".tmp", file);
        }
        records.push({
          url,
          cacheFile: file,
          retrieved: c.retrieved,
          sha256: createHash("sha256").update(c.html).digest("hex"),
        });
        console.log(
          JSON.stringify({
            completed: records.length,
            total: urls.length,
            url,
          }),
        );
      } catch (error) {
        failed++;
        records.push({ url, error: error.message });
        console.error(JSON.stringify({ url, error: error.message }));
      }
    }
  }),
);
await writeFile(
  catalogOnly
    ? "data/release-catalog-sources.json"
    : "data/release-sources.json",
  JSON.stringify(
    { records: records.sort((a, b) => a.url.localeCompare(b.url)) },
    null,
    2,
  ) + "\n",
);
if (failed) process.exitCode = 1;
