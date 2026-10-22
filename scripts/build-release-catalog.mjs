import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfm } from "micromark-extension-gfm";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { plain } from "./convert-reference.mjs";
const origin = "https://dcuniverseonline.fandom.com/wiki/";
const slug = (s) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const links = (n) =>
  n.type === "link"
    ? [{ label: plain(n), url: n.url }]
    : (n.children || []).flatMap(links);
const parse = (markdown) =>
  fromMarkdown(markdown, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  }).children;
const result = [];
for (const title of ["Episode", "Chapter"]) {
  const cache = JSON.parse(
    await readFile(".import-cache/releases/" + title + ".json", "utf8"),
  );
  const nodes = parse(cache.markdown);
  for (let i = 0; i < nodes.length; i++) {
    const h = nodes[i];
    if (h.type !== "heading" || h.depth !== (title === "Episode" ? 3 : 2))
      continue;
    const label = plain(h)
      .replace(/\[\s*Edit section:[\s\S]*$/, "")
      .trim();
    const refs = links(h).filter(
      (r) =>
        r.url.startsWith(origin) && !/[?&](?:veaction|action)=/.test(r.url),
    );
    if (!refs.length) continue;
    let entry;
    if (title === "Episode") {
      const match = label.match(/^Episode\s+(\d+):\s*(.+)$/);
      if (match)
        entry = {
          id: "episode-" + match[1],
          kind: "episode",
          number: Number(match[1]),
          title: match[2],
          label,
          source: refs.at(-1).url,
          aliases: refs.map((r) => r.url),
        };
      else if (/Death of Superman/.test(label))
        entry = {
          id: "death-of-superman",
          kind: "bonus",
          title: "The Death of Superman",
          label: "The Death of Superman",
          source: refs.at(-1).url,
          aliases: refs.map((r) => r.url),
        };
    } else {
      const match = label.match(/^(.+), Chapter\s+(\d+):\s*(.+)$/);
      if (!match) continue;
      const arc = slug(match[1]);
      if (!result.some((r) => r.id === arc))
        result.push({
          id: arc,
          kind: "arc",
          title: match[1],
          label: match[1],
          source: refs[0].url,
          aliases: [refs[0].url],
          catalogSource: origin + title,
          summary:
            "Story arc containing the chapters listed in the source chapter catalog.",
        });
      entry = {
        id: arc + "-chapter-" + match[2],
        kind: "chapter",
        number: Number(match[2]),
        arc,
        title: match[3],
        label: match[1] + " - Chapter " + match[2] + ": " + match[3],
        source: refs.at(-1).url,
        aliases: [refs.at(-1).url],
      };
    }
    if (!entry) continue;
    let end = i + 1;
    while (end < nodes.length && nodes[end].type !== "heading") end++;
    const content = nodes
      .slice(i + 1, end)
      .filter((n) => n.type === "list")
      .flatMap((n) =>
        n.children.map((item) => ({ label: plain(item), links: links(item) })),
      );
    const summary = content.length
      ? "Source-listed content: " +
        content.map((item) => item.label).join("; ") +
        "."
      : "";
    result.push({ ...entry, catalogSource: origin + title, summary, content });
  }
}
// The arc page is newer than the general Chapter index and lists chapter 2.
if (!result.some((r) => r.id === "children-of-krypton-chapter-2"))
  result.push({
    id: "children-of-krypton-chapter-2",
    kind: "chapter",
    number: 2,
    arc: "children-of-krypton",
    title: "Wrath of the Worldkillers",
    label: "Children of Krypton - Chapter 2: Wrath of the Worldkillers",
    source: origin + "Wrath_of_the_Worldkillers",
    aliases: [origin + "Wrath_of_the_Worldkillers"],
    catalogSource: origin + "Children_of_Krypton",
    summary:
      "Chapter 2 of Children of Krypton, listed in the source arc catalog for October 2026.",
  });
for (const [id, title, page, aliases] of [
  [
    "anti-monitor",
    "Attack of the Anti-Monitor",
    "Attack_of_the_Anti-Monitor",
    [],
  ],
  [
    "valentines",
    "Valentine's Day",
    "Valentine's_Day_Event",
    ["Love_Conquers_All"],
  ],
  ["st-patricks", "Mxyzptlk's Mischief", "Mxyzptlk's_Mischief", []],
  ["spring", "Springtime", "Springtime", ["Spring_Seasonal_Event"]],
  ["summer", "Tides of War", "Tides_of_War", []],
  ["homecoming", "Homecoming", "Homecoming", []],
  [
    "halloween",
    "The Witching Hour",
    "The_Witching_Hour",
    ["Halloween_Seasonal_Event"],
  ],
  [
    "winter",
    "Season's Greedings",
    "Season's_Greedings",
    ["Winter_Seasonal_Event"],
  ],
  ["batman-day", "Batman Day", "Batman_Day", ["BatmanDay"]],
  ["wonder-woman-day", "Wonder Woman Day", "Wonder_Woman_Day", []],
  ["save-the-universe", "Save the Universe", "Save_the_Universe", []],
  ["superman-day", "Superman Day Celebration", "Superman_Day_Celebration", []],
  [
    "starro-event",
    "Starro the Conqueror (2017 event)",
    "Starro_the_Conqueror",
    [],
  ],
  ["celebrate-pride", "Celebrate Pride", "Celebrate_Pride", []],
  ["anniversary-gifts", "Anniversary & celebration gifts", "Events", []],
  ["outsiders-ops", "Outsiders Ops", "Outsiders_Ops", []],
  ["core-game", "Core game & progression", "Story_Arcs_(Classic_Game)", []],
  ["game-systems", "Game systems & updates", "Game_Updates", []],
])
  result.push({
    id,
    kind:
      id === "core-game" ? "core" : id === "game-systems" ? "system" : "event",
    title,
    label: title,
    source: origin + page,
    aliases: [page, ...aliases].map((p) => origin + p),
    catalogSource:
      origin +
      (id === "core-game"
        ? "Story_Arcs_(Classic_Game)"
        : id === "game-systems"
          ? "Game_Updates"
          : "Events"),
    summary:
      id === "core-game"
        ? "Classic story arcs, early progression and original game missions."
        : id === "game-systems"
          ? "General game systems, tutorials and update missions."
          : "Seasonal or special event content, separate from numbered Episodes.",
  });
for (const release of result) {
  if (release.id === "episode-5")
    release.aliases.push(origin + "The_Hand_of_Fate");
  const file =
    ".import-cache/" +
    createHash("sha256").update(release.source).digest("hex") +
    ".json";
  try {
    const cached = JSON.parse(await readFile(file, "utf8"));
    for (const url of [
      cached.metadata?.sourceURL,
      cached.metadata?.url,
      cached.metadata?.ogUrl,
    ])
      if (url?.startsWith(origin)) release.aliases.push(url);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  release.aliases = [...new Set(release.aliases)];
}
if (result.filter((r) => r.kind === "episode").length !== 48)
  throw Error("Expected 48 source episodes; inspect the catalog");
if (result.filter((r) => r.kind === "chapter").length < 5)
  throw Error("Incomplete chapter catalog");
await mkdir("data", { recursive: true });
await writeFile(
  "src/data/releases.json",
  JSON.stringify(result, null, 2) + "\n",
);
await writeFile(
  ".import-cache/releases/catalog-urls.json",
  JSON.stringify([...new Set(result.map((r) => r.source))], null, 2) + "\n",
);
console.log({
  releases: result.length,
  episodes: result.filter((r) => r.kind === "episode").length,
  chapters: result.filter((r) => r.kind === "chapter").length,
});
