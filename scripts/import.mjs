// Staged content never becomes a published article automatically.
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import { importPlan, reusableCache } from "./import-plan.mjs";
import { scrape } from "./firecrawl.mjs";
const args = process.argv.slice(2);
const inventory = args.includes("--inventory")
  ? JSON.parse(await readFile("data/inventory.json", "utf8"))
  : undefined;
const { urls, refresh, dryRun, limit } = importPlan(args, inventory);
const key = process.env.FIRECRAWL_API_KEY;
if (!dryRun) await mkdir(".import-cache", { recursive: true });
let failed = 0,
  attempted = 0,
  cachedCount = 0;
for (const url of urls) {
  const id = createHash("sha256").update(url).digest("hex"),
    file = `.import-cache/${id}.json`;
  if (!refresh) {
    try {
      const cached = JSON.parse(await readFile(file, "utf8"));
      if (reusableCache(cached, url)) {
        cachedCount++;
        continue;
      }
    } catch (e) {
      if (e.code && e.code !== "ENOENT") throw e;
    }
  }
  if (attempted >= limit) break;
  attempted++;
  if (dryRun) {
    console.log(`Would stage: ${url}`);
    continue;
  }
  if (!key)
    throw new Error(
      "Set FIRECRAWL_API_KEY in the environment; never commit it.",
    );
  try {
    const data = await scrape(url, { key });
    await writeFile(
      file + ".tmp",
      JSON.stringify(
        {
          ...data,
          url,
          retrieved: new Date().toISOString(),
          status: "needs-review",
        },
        null,
        2,
      ),
    );
    await rename(file + ".tmp", file);
    console.log(`Staged: ${url}`);
  } catch (e) {
    console.error(`${url}: ${e.message}`);
    failed++;
  }
}
console.log(JSON.stringify({ dryRun, attempted, cached: cachedCount, failed }));
if (failed) process.exitCode = 1;
