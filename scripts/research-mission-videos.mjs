// Search exact mission titles in bounded groups; retain evidence for editorial review.
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { parseEnv } from "node:util";
import { createHash } from "node:crypto";
let env = {};
try {
  env = parseEnv(await readFile(".env", "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const key =
  process.env.FIRECRAWL_API_KEY ||
  process.env.FIRECRAWL_KEY ||
  process.env.firecrawl_key ||
  env.FIRECRAWL_API_KEY ||
  env.FIRECRAWL_KEY ||
  env.firecrawl_key;
const manifest = JSON.parse(
  await readFile("data/mission-downloads.json", "utf8"),
);
const records = manifest.records;
await mkdir(".import-cache/video-search", { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let completed = 0;
for (let i = 0; i < records.length; i += 4) {
  const group = records.slice(i, i + 4);
  const titles = group.map((r) =>
    r.title.replaceAll("_", " ").replaceAll('"', ""),
  );
  const query =
    "DCUO site:youtube.com/watch (" +
    titles.map((t) => '"' + t + '"').join(" OR ") +
    ")";
  const id = createHash("sha256").update(query).digest("hex");
  const file = ".import-cache/video-search/" + id + ".json";
  let cached;
  try {
    cached = JSON.parse(await readFile(file, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  if (!cached) {
    if (!key) throw Error("Missing Firecrawl key for uncached query");
    let body;
    for (let attempt = 0; attempt < 6; attempt++) {
      const response = await fetch("https://api.firecrawl.dev/v2/search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, limit: 20, sources: ["web"] }),
        signal: AbortSignal.timeout(60000),
      });
      if (response.status === 429 || response.status >= 500) {
        await wait(60000);
        continue;
      }
      if (!response.ok) throw Error(`Search HTTP ${response.status}`);
      body = await response.json();
      break;
    }
    if (!body?.success) throw Error("Search did not return success");
    cached = {
      query,
      checked: new Date().toISOString(),
      records: group.map((r) => r.url),
      results: body.data?.web || body.data || [],
    };
    await writeFile(file + ".tmp", JSON.stringify(cached, null, 2) + "\n");
    await rename(file + ".tmp", file);
  }
  completed += group.length;
  console.log(
    JSON.stringify({
      researched: completed,
      total: records.length,
      results: Array.isArray(cached.results) ? cached.results.length : 0,
    }),
  );
}
