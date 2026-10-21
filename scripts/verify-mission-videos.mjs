import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { normalizeTitle } from "./convert-missions.mjs";
const directory = ".import-cache/video-search";
await mkdir(".import-cache/video-metadata", { recursive: true });
const missions = new Map(),
  candidates = new Map();
for (const file of await readdir(directory)) {
  const search = JSON.parse(await readFile(directory + "/" + file, "utf8"));
  for (const source of search.records) {
    const raw = decodeURIComponent(
      new URL(source).pathname.slice(6),
    ).replaceAll("_", " ");
    const base = normalizeTitle(
      raw.replace(
        /\s*\((?:Heroes?|Villains?|hero mission|villain mission|Mission)\)$/i,
        "",
      ),
    );
    const record = {
      source,
      title: raw,
      query: search.query,
      checked: search.checked,
      matches: [],
    };
    missions.set(source, record);
    if (base.length < 7) continue;
    for (const hit of search.results || []) {
      let u;
      try {
        u = new URL(hit.url);
      } catch {
        continue;
      }
      const id = u.searchParams.get("v");
      if (
        !/^(?:www\.)?youtube\.com$/.test(u.hostname) ||
        u.pathname !== "/watch" ||
        !/^[\w-]{11}$/.test(id || "")
      )
        continue;
      if (!(" " + normalizeTitle(hit.title) + " ").includes(" " + base + " "))
        continue;
      if (!candidates.has(id))
        candidates.set(id, {
          id,
          url: "https://www.youtube.com/watch?v=" + id,
          records: [],
        });
      candidates.get(id).records.push({ record, base, searchTitle: hit.title });
    }
  }
}
let cursor = 0;
const values = [...candidates.values()];
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (cursor < values.length) {
      const c = values[cursor++],
        file = ".import-cache/video-metadata/" + c.id + ".json";
      let metadata;
      try {
        metadata = JSON.parse(await readFile(file, "utf8"));
      } catch (e) {
        if (e.code !== "ENOENT") throw e;
      }
      if (!metadata) {
        try {
          const r = await fetch(
            "https://www.youtube.com/oembed?url=" +
              encodeURIComponent(c.url) +
              "&format=json",
            { signal: AbortSignal.timeout(10000) },
          );
          if (r.ok)
            metadata = {
              ...(await r.json()),
              checked: new Date().toISOString(),
            };
        } catch {}
        if (metadata)
          await writeFile(file, JSON.stringify(metadata, null, 2) + "\n");
      }
      if (!metadata) continue;
      for (const { record, base } of c.records) {
        if (
          !(" " + normalizeTitle(metadata.title) + " ").includes(
            " " + base + " ",
          )
        )
          continue;
        record.matches.push({
          title: metadata.title,
          url: c.url,
          evidence: `YouTube's title explicitly names ${record.title}. Title and availability checked through YouTube metadata on ${metadata.checked.slice(0, 10)}. Faction, route, current mechanics and timestamps have not been verified by viewing the full video.`,
        });
      }
    }
  }),
);
const records = [...missions.values()].map((r) => ({
  ...r,
  matches: r.matches.slice(0, 2),
}));
await writeFile(
  "data/mission-videos.json",
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      summary: {
        researched: records.length,
        withVerifiedTitle: records.filter((r) => r.matches.length).length,
      },
      records,
    },
    null,
    2,
  ) + "\n",
);
console.log({
  researched: records.length,
  withVerifiedTitle: records.filter((r) => r.matches.length).length,
  candidateVideos: candidates.size,
});
