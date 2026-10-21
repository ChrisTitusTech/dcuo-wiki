import { readFile, writeFile, rename } from "node:fs/promises";
import { scrape } from "./firecrawl.mjs";
import { buildInventory, nextPage } from "./wiki-urls.mjs";
const count = Number(process.argv[2] || 1);
if (!Number.isInteger(count) || count < 1 || count > 100)
  throw new Error("Usage: npm run discover -- <1-100 batches>");
const key = process.env.FIRECRAWL_API_KEY;
if (!key) throw new Error("Set FIRECRAWL_API_KEY in the environment.");
const path = "data/discovery.json";
const discovery = JSON.parse(await readFile(path, "utf8"));
for (let i = 0; i < count; i++) {
  const inventory = buildInventory(discovery.pages, []);
  if (inventory.exhaustive) {
    console.log(
      "All-pages enumeration finished. Article quality still needs review.",
    );
    break;
  }
  const url = inventory.nextPage;
  if (discovery.pages.some((p) => p.kind === "all-pages" && p.url === url))
    throw new Error("Discovery continuation loop");
  const data = await scrape(url, { key });
  if (!Array.isArray(data.links) || data.links.length === 0)
    throw new Error("Empty discovery page; checkpoint unchanged");
  discovery.pages.push({
    url,
    kind: "all-pages",
    retrieved: new Date().toISOString(),
    scrapeId: data.metadata?.scrapeId,
    links: data.links,
    nextUrl: nextPage(data.markdown),
  });
  await writeFile(path + ".tmp", JSON.stringify(discovery, null, 2) + "\n");
  await rename(path + ".tmp", path);
  console.log(`Saved discovery batch: ${url}`);
}
await import("./inventory.mjs");
