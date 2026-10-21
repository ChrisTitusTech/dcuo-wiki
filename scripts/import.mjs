// Staged content never becomes a published article automatically.
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import { classifyURL } from "./wiki-urls.mjs";
import { scrape } from "./firecrawl.mjs";
const args = process.argv.slice(2),
  refresh = args.includes("--refresh");
const urls = args.filter((a) => a !== "--refresh");
if (!urls.length)
  throw new Error("Usage: npm run import -- [--refresh] <DCUO article URLs>");
const key = process.env.FIRECRAWL_API_KEY;
if (!key)
  throw new Error("Set FIRECRAWL_API_KEY in the environment; never commit it.");
const entries = urls.map(classifyURL);
if (entries.some((e) => e.kind !== "article"))
  throw new Error(
    "Import only gameplay articles; use discovery for supporting pages.",
  );
await mkdir(".import-cache", { recursive: true });
let failed = 0;
for (const url of new Set(entries.map((e) => e.url))) {
  const id = createHash("sha256").update(url).digest("hex"),
    file = `.import-cache/${id}.json`;
  if (!refresh) {
    try {
      const cached = JSON.parse(await readFile(file, "utf8"));
      if (
        cached.url === url &&
        cached.status === "needs-review" &&
        typeof cached.markdown === "string" &&
        cached.markdown.trim()
      ) {
        console.log(`Cached: ${url}`);
        continue;
      }
    } catch (e) {
      if (e.code && e.code !== "ENOENT") throw e;
    }
  }
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
if (failed) process.exitCode = 1;
