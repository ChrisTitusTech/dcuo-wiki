import { readFile, writeFile } from "node:fs/promises";
import { buildInventory } from "./wiki-urls.mjs";
const discovery = JSON.parse(await readFile("data/discovery.json", "utf8"));
const articles = JSON.parse(await readFile("src/data/articles.json", "utf8"));
const inventory = buildInventory(discovery.pages, articles);
const output = JSON.stringify(inventory, null, 2) + "\n";
if (process.argv.includes("--check")) {
  if ((await readFile("data/inventory.json", "utf8")) !== output)
    throw new Error("Inventory is stale; run npm run inventory");
} else await writeFile("data/inventory.json", output);
console.log(
  JSON.stringify(
    {
      exhaustive: inventory.exhaustive,
      nextPage: inventory.nextPage,
      ...inventory.summary,
    },
    null,
    2,
  ),
);
