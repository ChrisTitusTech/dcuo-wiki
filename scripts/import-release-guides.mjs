// Fill release coverage from exact source catalog entries, never from title similarity.
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parseEnv } from "node:util";
import { scrape } from "./firecrawl.mjs";
import { classifyURL } from "./wiki-urls.mjs";
import { convertMission } from "./convert-missions.mjs";
import { missionLayout, missionSummary } from "./mission-layout.mjs";
import { issuesFor } from "./content-policy.mjs";
const file = "data/release-guide-import.json";
const catalog = JSON.parse(await readFile("src/data/releases.json", "utf8"));
const articles = JSON.parse(await readFile("src/data/articles.json", "utf8"));
const assignments = JSON.parse(
  await readFile("src/data/guide-releases.json", "utf8"),
);
const hash = (s) => createHash("sha256").update(s).digest("hex");
await mkdir(".import-cache/release-guides", { recursive: true });
const command = process.argv[2] || "plan";
if (command === "plan") {
  try {
    const existing = JSON.parse(await readFile(file, "utf8"));
    if (existing.records?.length) {
      console.log({ preservedExistingPlan: existing.records.length });
      process.exit(0);
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const records = [];
  for (const release of catalog.filter(
    (r) =>
      r.kind === "episode" &&
      !articles.some((a) => assignments[a.slug]?.includes(r.id)),
  )) {
    for (const item of release.content || []) {
      if (
        !/\b(?:Duo|Raid|Operation|Alert|Challenge|solo mission)\b/i.test(
          item.label,
        )
      )
        continue;
      const ref = item.links[0];
      if (!ref) continue;
      const catalogUrl = classifyURL(ref.url).url;
      const url =
        release.id === "episode-25" &&
        classifyURL(catalogUrl).title === "Iceberg_Lounge"
          ? "https://dcuniverseonline.fandom.com/wiki/Iceberg_Lounge_(Challenge)"
          : catalogUrl;
      records.push({
        url,
        title: classifyURL(url).title,
        release: release.id,
        category: "Instances",
        ...(url !== catalogUrl
          ? { catalogUrl, searchTitle: "Iceberg Lounge" }
          : {}),
        evidence: item.label,
        catalogSource: release.catalogSource,
        releaseSource: release.source,
      });
    }
  }
  const ep13 = catalog.find((r) => r.id === "episode-13");
  records.push({
    url: "https://dcuniverseonline.fandom.com/wiki/Patrol_Catastrophe",
    title: "Patrol_Catastrophe",
    release: "episode-13",
    category: "Quests",
    evidence: "Listed under Recurring Missions in Amazon Fury Part II.",
    releaseSource: ep13.source,
    catalogSource: ep13.source,
  });
  for (const release of catalog.filter(
    (r) => r.kind === "chapter" && r.arc === "children-of-krypton",
  ))
    records.push({
      url: classifyURL(release.source).url,
      title: classifyURL(release.source).title,
      release: release.id,
      category: "Guides",
      evidence: release.label,
      releaseSource: release.source,
      catalogSource: release.catalogSource,
    });
  await writeFile(file, JSON.stringify({ records }, null, 2) + "\n");
  console.log({ planned: records.length });
} else if (command === "download") {
  const manifest = JSON.parse(await readFile(file, "utf8"));
  const env = parseEnv(await readFile(".env", "utf8"));
  const key =
    process.env.FIRECRAWL_API_KEY ||
    env.FIRECRAWL_API_KEY ||
    env.FIRECRAWL_KEY ||
    env.firecrawl_key;
  let cursor = 0,
    completed = 0;
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (cursor < manifest.records.length) {
        const record = manifest.records[cursor++];
        const path = ".import-cache/" + hash(record.url) + ".json";
        let c;
        try {
          c = JSON.parse(await readFile(path, "utf8"));
        } catch (e) {
          if (e.code !== "ENOENT") throw e;
        }
        if (!c?.markdown || !c?.html) {
          c = {
            ...(await scrape(record.url, { key })),
            url: record.url,
            retrieved: new Date().toISOString(),
          };
          await writeFile(path + ".tmp", JSON.stringify(c, null, 2) + "\n");
          await rename(path + ".tmp", path);
        }
        record.cacheFile = path;
        record.retrieved = c.retrieved;
        record.sha256 = hash(c.html);
        console.log({
          completed: ++completed,
          total: manifest.records.length,
          title: record.title,
        });
      }
    }),
  );
  await writeFile(file, JSON.stringify(manifest, null, 2) + "\n");
} else if (command === "convert") {
  const manifest = JSON.parse(await readFile(file, "utf8"));
  const sources = new Map(
    JSON.parse(await readFile("data/media-sources.json", "utf8")).map((s) => [
      s.sourcePage,
      s,
    ]),
  );
  for (const record of manifest.records) {
    try {
      const c = JSON.parse(await readFile(record.cacheFile, "utf8"));
      const result = convertMission(c, {
        url: record.url,
        title: record.title,
      });
      const a = result.article;
      a.category = record.category;
      // Instance overviews retain source access requirements, boss tactics, rewards and supplied maps.
      a.sections = missionLayout(a).map((section) => ({
        ...section,
        items: section.items.filter(
          (item) => !/^\.{3}$|^(?:TBA|TBD|Coming soon)$/i.test(item.trim()),
        ),
      }));
      a.summary = missionSummary(a);
      if (record.category === "Instances" && !a.location)
        a.location = {
          label: a.title,
          precision:
            "Source-listed playable instance: " +
            record.evidence +
            ". See the source access requirements and On Duty instructions; no open-world coordinates are inferred.",
          source: record.releaseSource,
          maps: [],
        };
      const text = a.sections
        .flatMap((s) => [...s.items, ...(s.table?.rows.flat() || [])])
        .join(" ");
      if (text.split(/\s+/).length < 40)
        throw Error("Insufficient substantive source detail");
      for (const image of result.images) {
        if (!sources.has(image.sourcePage))
          sources.set(image.sourcePage, {
            ...image,
            credit:
              "DC Universe Online Wiki contributors; game artwork belongs to its respective owners.",
          });
      }
      await writeFile(
        ".import-cache/release-guides/" + a.slug + ".json",
        JSON.stringify({ article: a, images: result.images }, null, 2) + "\n",
      );
      record.slug = a.slug;
      record.words = text.split(/\s+/).length;
      record.images = result.images.length;
      delete record.error;
    } catch (error) {
      record.error = error.message;
      console.error(record.title + ": " + error.message);
    }
  }
  await writeFile(file, JSON.stringify(manifest, null, 2) + "\n");
  await writeFile(
    "data/media-sources.json",
    JSON.stringify([...sources.values()], null, 2) + "\n",
  );
  console.log(
    manifest.records.map((r) => ({
      title: r.title,
      words: r.words,
      images: r.images,
      error: r.error,
    })),
  );
} else if (command === "publish") {
  const manifest = JSON.parse(await readFile(file, "utf8"));
  const videos = new Map(
    JSON.parse(
      await readFile("data/release-guide-videos.json", "utf8"),
    ).records.map((r) => [r.source, r]),
  );
  for (const record of manifest.records) {
    if (record.error) throw Error(record.error);
    const { article: a } = JSON.parse(
      await readFile(
        ".import-cache/release-guides/" + record.slug + ".json",
        "utf8",
      ),
    );
    if (
      articles.some(
        (x) => classifyURL(x.source).url === classifyURL(a.source).url,
      )
    )
      continue;
    const research = videos.get(record.url);
    if (!research) throw Error("Video research missing " + record.title);
    a.videos = research.matches;
    a.videoReview = {
      status: a.videos.length ? "verified-match" : "no-verified-match",
      checked: research.checked.slice(0, 10),
      query: research.query,
      note: "Exact title and availability checked; gameplay routes and current mechanics have not been verified.",
    };
    a.reviewed = true;
    const issues = issuesFor(a);
    if (issues.length) throw Error(record.title + ": " + issues.join(", "));
    articles.push(a);
    record.published = true;
  }
  await writeFile(
    "src/data/articles.json",
    JSON.stringify(articles, null, 2) + "\n",
  );
  await writeFile(file, JSON.stringify(manifest, null, 2) + "\n");
  console.log({
    articles: articles.length,
    imported: manifest.records.filter((r) => r.published).length,
  });
} else throw Error("Unknown command");
