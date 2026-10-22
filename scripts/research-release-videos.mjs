// Exact instance-title searches and YouTube metadata checks; never invent a video link.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parseEnv } from "node:util";
import { normalizeTitle } from "./convert-missions.mjs";
const env = parseEnv(await readFile(".env", "utf8"));
const key =
  process.env.FIRECRAWL_API_KEY ||
  env.FIRECRAWL_API_KEY ||
  env.FIRECRAWL_KEY ||
  env.firecrawl_key;
const records = JSON.parse(
  await readFile("data/release-guide-import.json", "utf8"),
).records;
await mkdir(".import-cache/release-guides/videos", { recursive: true });
const result = [];
for (let i = 0; i < records.length; i += 4) {
  const group = records.slice(i, i + 4);
  const query =
    "DCUO site:youtube.com/watch (" +
    group
      .map(
        (r) =>
          '"' +
          (r.searchTitle || r.title.replaceAll("_", " ")).replaceAll('"', "") +
          '"',
      )
      .join(" OR ") +
    ")";
  const file =
    ".import-cache/release-guides/videos/" +
    createHash("sha256").update(query).digest("hex") +
    ".json";
  let search;
  try {
    search = JSON.parse(await readFile(file, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  if (!search) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch("https://api.firecrawl.dev/v2/search", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, limit: 20, sources: ["web"] }),
        signal: AbortSignal.timeout(60000),
      });
      if (res.status === 429 || res.status >= 500) {
        await new Promise((r) => setTimeout(r, 60000));
        continue;
      }
      if (!res.ok) throw Error("Firecrawl search " + res.status);
      const data = await res.json();
      if (!data.success) throw Error("Search failed");
      search = {
        query,
        checked: new Date().toISOString(),
        results: data.data?.web || data.data || [],
      };
      break;
    }
    if (!search) throw Error("Search rate limit retries exhausted");
    await writeFile(file, JSON.stringify(search, null, 2) + "\n");
  }
  for (const record of group) {
    const title = record.searchTitle || record.title.replaceAll("_", " "),
      base = " " + normalizeTitle(title) + " ",
      matches = [];
    for (const hit of search.results) {
      let u;
      try {
        u = new URL(hit.url);
      } catch {
        continue;
      }
      const id = u.searchParams.get("v");
      if (
        !/^(www\.)?youtube\.com$/.test(u.hostname) ||
        u.pathname !== "/watch" ||
        !/^[-\w]{11}$/.test(id || "") ||
        !(" " + normalizeTitle(hit.title) + " ").includes(base)
      )
        continue;
      const url = "https://www.youtube.com/watch?v=" + id;
      try {
        const response = await fetch(
          "https://www.youtube.com/oembed?url=" +
            encodeURIComponent(url) +
            "&format=json",
          { signal: AbortSignal.timeout(10000) },
        );
        if (!response.ok) continue;
        const metadata = await response.json();
        if (
          !(" " + normalizeTitle(metadata.title) + " ").includes(base) ||
          !/DCUO|DC Universe Online/i.test(
            metadata.title + " " + metadata.author_name,
          )
        )
          continue;
        matches.push({
          title: metadata.title.replaceAll(" | ", " / "),
          url,
          evidence:
            "YouTube metadata explicitly names " +
            title +
            ". Title and availability checked on " +
            search.checked.slice(0, 10) +
            ". Full gameplay, route and mechanics have not been verified.",
        });
      } catch {}
      if (matches.length === 2) break;
    }
    result.push({
      source: record.url,
      query,
      checked: search.checked,
      matches,
    });
  }
  console.log({
    researched: result.length,
    total: records.length,
    matches: result.filter((r) => r.matches.length).length,
  });
  await writeFile(
    "data/release-guide-videos.json",
    JSON.stringify({ records: result }, null, 2) + "\n",
  );
}
