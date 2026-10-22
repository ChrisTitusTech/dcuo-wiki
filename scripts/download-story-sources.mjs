import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { parseEnv } from "node:util";
import { scrape } from "./firecrawl.mjs";
const env = await fs
  .readFile(".env", "utf8")
  .then(parseEnv)
  .catch((e) => {
    if (e.code === "ENOENT") return {};
    throw e;
  });
const key =
  process.env.FIRECRAWL_API_KEY ||
  process.env.FIRECRAWL_KEY ||
  env.FIRECRAWL_API_KEY ||
  env.FIRECRAWL_KEY ||
  env.firecrawl_key;
const articles = JSON.parse(
  await fs.readFile("src/data/articles.json", "utf8"),
);
const releases = JSON.parse(
  await fs.readFile("src/data/releases.json", "utf8"),
);
const mentor = articles.find((a) => a.slug === "Mentor-based_Missions");
const classic = articles.find((a) => a.slug === "Story_Arcs_Classic_Game");
const urls = [
  ...new Set([
    "https://dcuniverseonline.fandom.com/wiki/Storyline",
    mentor.source,
    classic.source,
    ...mentor.sections.flatMap((s) =>
      (s.references || [])
        .filter((r) =>
          /^(?:Meta|Tech|Magic) (?:Hero|Villain) Storyline$/.test(r.label),
        )
        .map((r) => r.url),
    ),
    ...classic.sections
      .filter((s) => s.items.some((i) => i.startsWith("Main article:")))
      .map((s) => s.references.find((r) => r.label === s.title)?.url)
      .filter(Boolean),
    ...releases
      .filter((r) => ["episode", "chapter", "bonus"].includes(r.kind))
      .map((r) => r.source),
  ]),
];
const prior = JSON.parse(
  await fs.readFile("data/release-sources.json", "utf8"),
).records;
const normal = (u) =>
  decodeURIComponent(new URL(u).origin + new URL(u).pathname).replaceAll(
    " ",
    "_",
  );
const records = [];
await fs.mkdir(".import-cache/story", { recursive: true });
for (const url of urls) {
  const known = prior.find((r) => normal(r.url) === normal(url));
  const file =
    known?.cacheFile ||
    ".import-cache/" + createHash("sha256").update(url).digest("hex") + ".json";
  let c;
  try {
    c = JSON.parse(await fs.readFile(file, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  if (!c?.html || !c?.markdown) {
    c = {
      ...(await scrape(url, { key })),
      url,
      retrieved: new Date().toISOString(),
    };
    await fs.writeFile(file, JSON.stringify(c, null, 2) + "\n");
    await new Promise((resolve) => setTimeout(resolve, 6500));
  }
  records.push({
    url,
    cacheFile: file,
    retrieved: c.retrieved,
    sha256: createHash("sha256").update(c.html).digest("hex"),
  });
  console.log({ completed: records.length, total: urls.length, url });
}
await fs.writeFile(
  "data/story-sources.json",
  JSON.stringify({ records }, null, 2) + "\n",
);
