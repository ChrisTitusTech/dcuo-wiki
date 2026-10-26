// Research candidates only: no automatic identity publication.
import fs from "node:fs/promises";
import { parseEnv } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { catalogFetch } from "./catalog-network.mjs";
const profile = process.argv[2];
if (!/^[a-f0-9-]{36}$/.test(profile || ""))
  throw Error("Pass a public profile ID.");
const r = await fetch(
  "https://dcuo-wiki.com/api/profiles/" + profile + "/equipment",
  { signal: AbortSignal.timeout(30000) },
);
if (!r.ok) throw Error("Profile equipment unavailable: " + r.status);
const snapshot = await r.json(),
  known = new Set(
    JSON.parse(await fs.readFile("data/census-item-index.json", "utf8")).map(
      (row) => row[0],
    ),
  );
const ids = [
  ...new Set(
    (snapshot.items || []).flatMap((item) => [
      item.itemId,
      ...item.augments.map((a) => a.itemId),
    ]),
  ),
]
  .filter((id) => /^[1-9]\d{0,29}$/.test(id) && !known.has(id))
  .sort();
const settings = parseEnv(
  await fs.readFile(".env", "utf8").catch((error) => {
    if (error.code === "ENOENT") return "";
    throw error;
  }),
);
const key =
  process.env.FIRECRAWL_API_KEY ||
  settings.FIRECRAWL_API_KEY ||
  settings.FIRECRAWL_KEY ||
  settings.firecrawl_key;
if (!key) throw Error("Firecrawl is not configured.");
const directory = ".import-cache/census-items/unknown-search";
await fs.mkdir(directory, { recursive: true });
for (const id of ids) {
  const file = directory + "/" + id + ".json";
  try {
    JSON.parse(await fs.readFile(file, "utf8"));
    continue;
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const query = 'DCUO "' + id + '"';
  const response = await catalogFetch("https://api.firecrawl.dev/v2/search", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, limit: 5, sources: ["web"] }),
  });
  if (!response.ok) throw Error("Search failed: " + response.status);
  const result = await response.json();
  if (!result.success) throw Error("Search unsuccessful.");
  await fs.writeFile(
    file,
    JSON.stringify(
      {
        itemId: id,
        query,
        checkedAt: new Date().toISOString(),
        results: result.data?.web || [],
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({ itemId: id, candidates: result.data?.web?.length || 0 }),
  );
  await delay(7000);
}
console.log(JSON.stringify({ complete: true, ids: ids.length, directory }));
