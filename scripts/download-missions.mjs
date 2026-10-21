// Downloads source captures only. Publication and enrichment require a separate review.
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parseEnv } from "node:util";
import { scrape } from "./firecrawl.mjs";
import { reusableCache } from "./import-plan.mjs";
import { missionCategory, parseMissionCategory } from "./mission-category.mjs";
const env = parseEnv(await readFile(".env", "utf8"));
const key =
  process.env.FIRECRAWL_API_KEY ||
  env.FIRECRAWL_API_KEY ||
  env.FIRECRAWL_KEY ||
  env.firecrawl_key;
if (!key) throw new Error("Missing Firecrawl key");
await mkdir(".import-cache", { recursive: true });
const hash = (text) => createHash("sha256").update(text).digest("hex");
async function save(path, value) {
  await writeFile(path + ".tmp", JSON.stringify(value, null, 2) + "\n");
  await rename(path + ".tmp", path);
}
const members = new Map(),
  pages = [],
  visited = new Set();
let url = missionCategory,
  total;
while (url) {
  if (visited.has(url)) throw new Error("Category pagination loop");
  visited.add(url);
  const file = `.import-cache/category-${hash(url)}.json`;
  let data;
  try {
    data = JSON.parse(await readFile(file, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  if (!data) {
    data = {
      ...(await scrape(url, {
        key,
        includeTags: [
          ".category-page__members",
          ".category-page__pagination",
          ".category-page__total-number",
        ],
      })),
      url,
      retrieved: new Date().toISOString(),
    };
    await save(file, data);
  }
  const parsed = parseMissionCategory(data.html);
  if (total !== undefined && total !== parsed.total)
    throw new Error("Category total changed during pagination");
  total = parsed.total;
  for (const entry of parsed.entries) members.set(entry.url, entry);
  pages.push({
    url,
    count: parsed.entries.length,
    nextUrl: parsed.nextUrl,
    retrieved: data.retrieved,
  });
  console.log(
    `Category page ${pages.length}: ${members.size}/${total} entries`,
  );
  url = parsed.nextUrl;
}
if (members.size !== total)
  throw new Error(`Incomplete category: ${members.size}/${total}`);
const records = [...members.values()].filter((e) => e.kind === "article");
const manifest = {
  source: missionCategory,
  categoryTotal: total,
  discoveryComplete: true,
  pages,
  supportEntries: [...members.values()].filter((e) => e.kind !== "article"),
  notes: [
    "Raw source captures are local in .import-cache; this manifest is tracked in Git.",
    "Includes overview and historical pages; not a count of publication-ready quest guides.",
    "Review maps, objectives, canonical duplicates and exact-match YouTube references before publication.",
  ],
  records,
};
await save("data/mission-downloads.json", manifest);
let cursor = 0,
  done = 0,
  failed = 0,
  downloaded = 0,
  reused = 0;
await Promise.all(
  Array.from({ length: 5 }, async () => {
    while (cursor < records.length) {
      const record = records[cursor++],
        file = `.import-cache/${hash(record.url)}.json`;
      try {
        let data;
        try {
          const cached = JSON.parse(await readFile(file, "utf8"));
          if (reusableCache(cached, record.url)) data = cached;
        } catch (e) {
          if (e.code !== "ENOENT" && !(e instanceof SyntaxError)) throw e;
        }
        if (data) reused++;
        else {
          data = {
            ...(await scrape(record.url, { key })),
            url: record.url,
            retrieved: new Date().toISOString(),
            status: "needs-review",
          };
          await save(file, data);
          downloaded++;
        }
        Object.assign(record, {
          status: "downloaded-needs-review",
          retrieved: data.retrieved,
          scrapeId: data.metadata?.scrapeId,
          canonicalUrl: data.metadata?.url || record.url,
          markdownSha256: hash(data.markdown),
          characters: data.markdown.length,
          cacheFile: file,
        });
      } catch (e) {
        failed++;
        Object.assign(record, { status: "failed", error: e.message });
        console.error(`Failed: ${record.url}: ${e.message}`);
      }
      done++;
      if (done % 25 === 0 || done === records.length)
        console.log(
          JSON.stringify({
            done,
            total: records.length,
            downloaded,
            reused,
            failed,
          }),
        );
    }
  }),
);
manifest.completedAt = new Date().toISOString();
manifest.summary = { articles: records.length, downloaded, reused, failed };
await save("data/mission-downloads.json", manifest);
if (failed) process.exitCode = 1;
