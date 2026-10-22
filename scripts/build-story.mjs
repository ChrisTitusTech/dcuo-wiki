// Source-backed story articles reuse the complete wiki editor and existing guide links.
import fs from "node:fs/promises";
import { convertReference } from "./convert-reference.mjs";
import { storyHeadingContext, storyMarkdown } from "./story-content.mjs";
import { issuesFor } from "./content-policy.mjs";
import { normalize } from "./assign-guide-releases.mjs";
const manifest = JSON.parse(
  await fs.readFile("data/story-sources.json", "utf8"),
);
const releases = JSON.parse(
  await fs.readFile("src/data/releases.json", "utf8"),
);
const originals = JSON.parse(
  await fs.readFile("src/data/articles.json", "utf8"),
);
let prior = { entries: [] };
try {
  prior = JSON.parse(await fs.readFile("src/data/story.json", "utf8"));
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const old = new Set(prior.generatedSlugs || prior.entries.map((e) => e.slug));
const generatedSlugs = [];
const articles = originals.filter((a) => !old.has(a.slug));
const assignments = JSON.parse(
  await fs.readFile("src/data/guide-releases.json", "utf8"),
);
for (const slug of old) delete assignments[slug];
const existing = new Map(articles.map((a) => [normalize(a.source), a]));
const media = JSON.parse(await fs.readFile("data/media.json", "utf8"));
const credited = new Set(media.map((m) => normalize(m.sourcePage)));
const captures = new Map();
for (const rec of manifest.records) {
  const c = JSON.parse(await fs.readFile(rec.cacheFile, "utf8"));
  captures.set(normalize(rec.url), {
    c,
    rec,
    converted: convertReference(storyMarkdown(c.markdown), rec.url, {
      headingTitle: storyHeadingContext(),
    }),
  });
}
const mentor = articles.find((a) => a.slug === "Mentor-based_Missions");
const classic = articles.find((a) => a.slug === "Story_Arcs_Classic_Game");
const entries = [];
const meaningless =
  /^(?:unknown|none|n\/?a|not (?:stated|specified)|\?+|tba|tbd|coming soon|this list is a work in progress)[.\s]*$/i;
const maintenance =
  /article (?:is a stub|needs improvement)|manual of style|editing help|you can help|needs more.*summaries/i;
const metadata =
  /^(?:Characters|Locations|Feats|Rewards?|Gear|Equipment|Items|Trivia|See also|External links|Collections|Briefings|Investigations|Media|Gallery|Achievements|Access Requirements|Requirements|Missions Rewards)(?:\s*-.*)?$/i;
const cleanItems = (items) =>
  items.filter(
    (t) =>
      !meaningless.test(t) &&
      !maintenance.test(t) &&
      !/^["“].*["”]\s*[—–-]\s*\S/.test(t) &&
      !/^Main [Aa]rticle:/.test(t) &&
      !/^For (?:the |more on |storylines)/.test(t) &&
      !/^\[?Edit\b/i.test(t) &&
      !/\b(?:TODO|TBD|coming soon)\b/i.test(t),
  );
function sourceSection(s) {
  const items = [
    ...new Set(
      cleanItems(s.items.map((t) => t.replace(/^(?:>\s*)+/, "").trim())).filter(
        (t) =>
          t && !/^(?:[\d]+\.\s*)?(?:n\/?a|none|unknown|[>\'\s]+)$/i.test(t),
      ),
    ),
  ];
  const references = (s.references || [])
    .filter(
      (r) =>
        /^https:\/\/(?:dcuniverseonline\.fandom\.com|dcuo-wiki\.com)\/wiki\//.test(
          r.url,
        ) && !/[?&](?:action|veaction)=/.test(r.url),
    )
    .map((r) => {
      const local = existing.get(normalize(r.url));
      return local
        ? { ...r, url: "https://dcuo-wiki.com/wiki/" + local.slug + "/" }
        : r;
    });
  const images = (s.images || []).filter((i) => credited.has(normalize(i.url)));
  return {
    title: s.title,
    items,
    ...(s.table ? { table: s.table } : {}),
    ...(references.length
      ? { references: [...new Map(references.map((r) => [r.url, r])).values()] }
      : {}),
    ...(images.length ? { images } : {}),
  };
}
function add({
  id,
  title,
  label = title,
  era,
  source,
  release = "core-game",
  lead = [],
  select,
  mentorName = "",
  faction = "Both",
  order,
}) {
  const capture = captures.get(normalize(source));
  if (!capture) throw Error("Missing story source " + source);
  let sections = select(capture.converted.sections)
    .map(sourceSection)
    .filter((s) => s.items.length || s.table);
  if (lead.length) sections.unshift({ title: "Story", items: lead });
  sections = sections.filter((s) => !metadata.test(s.title));
  const preferred = sections.filter((s) =>
    /^(?:Story|Background|Game Story|Villains|Heroes)$/.test(s.title),
  );
  const narrative = [
    ...preferred,
    ...sections.filter((s) => !preferred.includes(s)),
  ]
    .flatMap((s) => s.items)
    .filter(
      (t) =>
        t.length > 80 &&
        !/\b(?:is (?:an? )?(?:episode pack|tier\s*\d)|was released on|Access to this content|The casual mode)/i.test(
          t,
        ),
    );
  if (!narrative.length) throw Error("No story narrative: " + id);
  const reused = articles.find(
    (a) =>
      a.category === "Guides" &&
      normalize(a.source) === normalize(source) &&
      a.sections.some((s) => /^Story$/i.test(s.title)),
  );
  const slug = reused?.slug || "Story_" + id.replaceAll("-", "_");
  if (!reused && articles.some((a) => a.slug === slug))
    throw Error("Story slug collision " + slug);
  const guides = articles
    .filter(
      (a) =>
        release !== "core-game" &&
        ["Quests", "Instances", "Guides"].includes(a.category) &&
        a.slug !== slug &&
        (assignments[a.slug] || []).includes(release),
    )
    .map((a) => a.slug);
  const refs = [
    ...new Map(
      sections.flatMap((s) => s.references || []).map((r) => [r.url, r]),
    ).values(),
  ];
  if (release === "core-game") {
    for (const r of refs) {
      const match = r.url.match(/^https:\/\/dcuo-wiki.com\/wiki\/([^/]+)\/$/);
      if (
        match &&
        articles.some(
          (a) =>
            a.slug === match[1] && ["Quests", "Instances"].includes(a.category),
        ) &&
        !guides.includes(match[1])
      )
        guides.push(match[1]);
    }
  }
  const a = {
    slug,
    title: label,
    category: "Story",
    summary: narrative[0].slice(0, 380),
    sections,
    source,
    history: source + "?action=history",
    retrieved: capture.c.retrieved.slice(0, 10),
    reviewed: true,
    license: classic.license,
    related: [...new Set(guides)].slice(0, 12),
  };
  const issues = issuesFor(a);
  if (issues.length) throw Error(id + ": " + issues.join("; "));
  if (!reused) {
    articles.push(a);
    assignments[slug] = [release];
    generatedSlugs.push(slug);
  }
  entries.push({
    id,
    slug,
    title,
    label,
    era,
    release,
    mentor: mentorName,
    faction,
    summary: a.summary,
    order,
    guides,
    source,
    retrieved: a.retrieved,
  });
}
add({
  id: "original-game",
  title: "The original game",
  label: "The original game: Brainiac's invasion",
  era: "original",
  source: "https://dcuniverseonline.fandom.com/wiki/Storyline",
  order: 0,
  select: (ss) =>
    ss.filter((s) =>
      [
        "Future Batman and Lex Luthor Timeline",
        "Game Story",
        "Survival of the Fittest Arc",
        "Avatar of Tech and Meta Arc",
      ].includes(s.title),
    ),
});
for (const [i, s] of mentor.sections
  .filter((s) => /^(?:Meta|Tech|Magic) \(/.test(s.title))
  .entries()) {
  const reference = s.references.find((r) =>
    /^(?:Meta|Tech|Magic) (?:Hero|Villain) Storyline$/.test(r.label),
  );
  if (!reference) throw Error("Missing mentor source");
  const source = reference.url;
  const title = reference.label;
  const faction = title.includes("Villain") ? "Villain" : "Hero";
  add({
    id: title.toLowerCase().replaceAll(" ", "-"),
    title,
    label: s.title.replace(/\(\s*/, "(") + " - " + faction + " path",
    era: "mentor",
    source,
    mentorName: s.title.match(/\(\s*(.*?)\)/)[1],
    faction,
    order: i,
    lead: cleanItems(s.items).slice(1),
    select: (ss) =>
      ss.filter(
        (s) => !metadata.test(s.title) && s.title !== "Source overview",
      ),
  });
}
for (const [i, s] of classic.sections
  .filter((s) => s.items.some((t) => /^Main article:/.test(t)))
  .entries()) {
  const source = s.references.find((r) => r.label === s.title)?.url;
  if (!source) throw Error("Missing classic arc source");
  add({
    id:
      "classic-" +
      s.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, ""),
    title: s.title,
    era: "classic",
    source,
    lead: cleanItems(s.items),
    order: i,
    select: (ss) => ss.filter((s) => !metadata.test(s.title)),
  });
}
const expanded = [
  ...releases
    .filter((r) => r.kind === "episode")
    .sort((a, b) => a.number - b.number),
];
const death = releases.find((r) => r.id === "death-of-superman");
expanded.splice(
  expanded.findIndex((r) => r.number === 32),
  0,
  death,
);
expanded.push(...releases.filter((r) => r.kind === "chapter"));
for (const [i, r] of expanded.entries())
  add({
    id: r.id,
    title: r.title,
    label: r.label,
    era: r.kind === "chapter" ? "chapter" : "episode",
    release: r.id,
    source: r.source,
    order: i,
    select: (ss) => {
      const end = ss.findIndex((s) => metadata.test(s.title));
      const front = ss.slice(0, end < 0 ? ss.length : end);
      return [
        ...front,
        ...ss
          .slice(end < 0 ? ss.length : end)
          .filter((s) => /^(?:Story|Chapter) Missions(?: -|$)/i.test(s.title)),
      ];
    },
  });
// Release order guides the reading list. Parallel mentor/classic branches stay independent.
const linear = [
  entries.find((e) => e.id === "original-game"),
  ...entries.filter((e) => ["episode", "chapter"].includes(e.era)),
];
for (const [i, e] of linear.entries()) {
  if (!generatedSlugs.includes(e.slug)) continue;
  const refs = [
    ...(i
      ? [
          {
            label: "Previous story: " + linear[i - 1].label,
            url: "https://dcuo-wiki.com/wiki/" + linear[i - 1].slug + "/",
          },
        ]
      : []),
    ...(i + 1 < linear.length
      ? [
          {
            label: "Next story: " + linear[i + 1].label,
            url: "https://dcuo-wiki.com/wiki/" + linear[i + 1].slug + "/",
          },
        ]
      : []),
    {
      label: "Story timeline and original mentor branches",
      url: "https://dcuo-wiki.com/story/",
    },
  ];
  articles
    .find((a) => a.slug === e.slug)
    .sections.push({
      title: "Story reading order",
      items: [
        "This reading order follows content releases. Original mentor paths and classic arcs run in parallel; it is not a universal journal mission order.",
      ],
      references: refs,
    });
}
await fs.writeFile(
  "src/data/articles.json",
  JSON.stringify(articles, null, 2) + "\n",
);
await fs.writeFile(
  "src/data/guide-releases.json",
  JSON.stringify(assignments, null, 2) + "\n",
);
await fs.writeFile(
  "src/data/story.json",
  JSON.stringify({ entries, generatedSlugs }, null, 2) + "\n",
);
const audit = JSON.parse(
  await fs.readFile("data/guide-release-assignments.json", "utf8"),
);
audit.records = audit.records.filter((r) => !old.has(r.slug));
for (const e of entries.filter((e) => generatedSlugs.includes(e.slug)))
  audit.records.push({
    slug: e.slug,
    ids: [e.release],
    method: "story-source",
    source: e.source,
    evidence:
      "Narrative and mission references from the exact classic, mentor or release source.",
  });
await fs.writeFile(
  "data/guide-release-assignments.json",
  JSON.stringify(audit, null, 2) + "\n",
);
console.log({
  stories: entries.length,
  byEra: Object.fromEntries(
    ["original", "mentor", "classic", "episode", "chapter"].map((era) => [
      era,
      entries.filter((e) => e.era === era).length,
    ]),
  ),
  articles: articles.length,
});
