// Build an explicit publication/disposition report from conversions and verified research.
import { readFile, writeFile } from "node:fs/promises";
import { missionLayout } from "./mission-layout.mjs";
import { issuesFor } from "./content-policy.mjs";
import { classifyURL } from "./wiki-urls.mjs";
import { articleParts, renderPart } from "../shared/article-content.mjs";
const write = process.argv.includes("--write");
const original = JSON.parse(await readFile("src/data/articles.json", "utf8"));
const conversions = JSON.parse(
  await readFile("data/mission-conversion.json", "utf8"),
);
const videoData = JSON.parse(
  await readFile("data/mission-videos.json", "utf8"),
);
const research = new Map(videoData.records.map((r) => [r.source, r]));
const canonical = (u) => classifyURL(u).url;
const published = new Map(original.map((a) => [canonical(a.source), a]));
const targets = new Map(conversions.records.map((r) => [r.source, r]));
const result = [...original],
  dispositions = [];
for (const r of conversions.records) {
  const decision = { source: r.source, slug: r.slug };
  if (r.error) {
    dispositions.push({ ...decision, status: "excluded", reason: r.error });
    continue;
  }
  if (r.canonical !== r.source && targets.has(r.canonical)) {
    dispositions.push({
      ...decision,
      status: "alias",
      target: targets.get(r.canonical).slug,
    });
    continue;
  }
  const conversion = JSON.parse(
    await readFile(
      ".import-cache/converted-missions/" + r.slug + ".json",
      "utf8",
    ),
  );
  const a = conversion.article;
  const existing = published.get(canonical(r.source));
  if (existing) {
    const added = [];
    for (const section of missionLayout(a).filter((s) => s.table)) {
      if (
        existing.sections.some(
          (s) =>
            s.table &&
            JSON.stringify([s.table.columns, s.table.rows]) ===
              JSON.stringify([section.table.columns, section.table.rows]),
        )
      )
        continue;
      existing.sections.push(section);
      added.push(section.title);
    }
    const seenImages = new Set(
      [
        ...(existing.location?.maps || []),
        ...existing.sections.flatMap((s) => s.images || []),
      ].map((i) => i.url),
    );
    const extraImages = a.sections
      .flatMap((s) => s.images || [])
      .filter((i) => !seenImages.has(i.url) && seenImages.add(i.url));
    if (extraImages.length) {
      existing.sections.push({
        title: "Additional source images",
        items: [],
        images: extraImages,
      });
      added.push("Additional source images");
    }
    if (added.length) existing.retrieved = a.retrieved;
    dispositions.push({
      ...decision,
      status: "existing",
      target: existing.slug,
      addedSections: added,
    });
    continue;
  }
  if (r.reasons.some((reason) => reason !== "Insufficient source detail")) {
    dispositions.push({
      ...decision,
      status: "excluded",
      reason: r.reasons.join("; "),
    });
    continue;
  }
  const video = research.get(r.source);
  if (!video) {
    dispositions.push({ ...decision, status: "pending-research" });
    continue;
  }
  a.videos = video.matches.map((v) => ({
    ...v,
    title: v.title.replaceAll(" | ", " / "),
    evidence: v.evidence.replaceAll(" | ", " / "),
  }));
  a.videoReview = {
    status: a.videos.length ? "verified-match" : "no-verified-match",
    query: video.query,
    checked: video.checked.slice(0, 10),
    note: a.videos.length
      ? "Mission-title matches verified against YouTube metadata; full gameplay, faction/version and timestamps remain unverified."
      : "The recorded exact-title search found no verified video title match. This is a search result, not proof that no video exists.",
  };
  if (a.category === "Quests" && !a.location) {
    if (!a.videos.length) {
      dispositions.push({
        ...decision,
        status: "excluded",
        reason:
          "No source-backed objective location or verified mission video; avoid publishing an unlocated duplicate.",
      });
      continue;
    }
    a.locationLimitation =
      "The source describes this mission but does not establish a reliable objective location or map point. The title-matched video is referenced below; its route and coordinates have not been verified.";
  }
  if (a.slug === "Artifact_-_The_Strategist_Card") {
    a.sections = a.sections.filter((s) => s.title !== "Intro");
    a.sections.splice(1, 0, {
      title: "Source discrepancy",
      items: [
        "The source introduction says to complete Damage Control, while its Objectives section names Metal Pt. II: Batscape. The source does not resolve this conflict; confirm the tracked Journal objective in game.",
      ],
      references: [
        { label: "Source introduction and objectives", url: a.source },
      ],
    });
  }
  if (a.slug === "A_Weekly_Dose_of_Villainy") {
    a.summary = a.summary.replace(" for heroes", "");
    for (const s of a.sections)
      if (s.title === "Source overview")
        s.items = s.items.map((x) => x.replace(" for heroes", ""));
    a.sections.push({
      title: "Source note",
      items: [
        "The source overview calls this a mission for heroes, while its title and required daily mission refer to Villainy. The source faction wording is inconsistent.",
      ],
      references: [{ label: "Faction wording in the source", url: a.source }],
    });
  }
  if (a.slug === "The_Petri_Dish") {
    a.summary =
      "Contain Doomsday in the Smallville alert after completing Alert T1: Smallville.";
    for (const section of a.sections)
      if (section.title === "Source overview")
        section.items = section.items.map((item) =>
          item.replace(/^Alert T1: Area 51/, a.title),
        );
    a.sections.push({
      title: "Source note",
      items: [
        "The source overview incorrectly names Area 51; its objectives and walkthrough describe Smallville.",
      ],
      references: [
        { label: "Source objectives and walkthrough", url: a.source },
      ],
    });
  }
  a.sections = missionLayout(a);
  a.reviewed = true;
  const issues = issuesFor(a);
  for (const part of articleParts(a)) {
    if (part.text) {
      try {
        renderPart(part, part.text);
      } catch (error) {
        issues.push(part.id + ": " + error.message);
      }
    }
  }
  if (issues.length) {
    dispositions.push({
      ...decision,
      status: "excluded",
      reason: issues.join("; "),
    });
    continue;
  }
  if (result.some((other) => other.slug === a.slug))
    throw Error("Slug collision: " + a.slug);
  result.push(a);
  published.set(canonical(r.source), a);
  dispositions.push({
    ...decision,
    status: "publishable",
    location: !!a.location,
    mapReferences: a.location?.maps.length || 0,
    videoReferences: a.videos.length,
  });
}
// New guide links resolve to available local pages; original baselines remain untouched.
const newSlugs = new Set(
  dispositions.filter((r) => r.status === "publishable").map((r) => r.slug),
);
for (const a of result.filter((a) => newSlugs.has(a.slug))) {
  const related = new Set();
  for (const s of a.sections)
    for (const link of s.references || []) {
      const target = published.get(canonical(link.url));
      if (target && target.slug !== a.slug && !new URL(link.url).hash) {
        related.add(target.slug);
        link.url = "https://dcuo-wiki.com/wiki/" + target.slug + "/";
      }
    }
  if (related.size) a.related = [...related].slice(0, 6);
}
const summary = {
  sourceArticles: dispositions.length,
  existing: dispositions.filter((r) => r.status === "existing").length,
  newGuides: dispositions.filter((r) => r.status === "publishable").length,
  aliases: dispositions.filter((r) => r.status === "alias").length,
  excluded: dispositions.filter((r) => r.status === "excluded").length,
  pendingResearch: dispositions.filter((r) => r.status === "pending-research")
    .length,
  totalGuides: result.length,
};
await writeFile(
  "data/mission-publication.json",
  JSON.stringify(
    { createdAt: new Date().toISOString(), summary, records: dispositions },
    null,
    2,
  ) + "\n",
);
await writeFile(
  ".import-cache/mission-articles-proposed.json",
  JSON.stringify(result, null, 2) + "\n",
);
if (write) {
  if (summary.pendingResearch)
    throw Error("Complete inventory-wide video research before publication");
  await writeFile(
    "src/data/articles.json",
    JSON.stringify(result, null, 2) + "\n",
  );
}
console.log(summary);
