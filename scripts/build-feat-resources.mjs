// Match existing mission resources to their exact source guide. An instance title is not feat coverage.
import fs from "node:fs/promises";
import { featEffort } from "../shared/feat-planning.mjs";
import { hasFactionConflict } from "./mission-video-match.mjs";
const normal = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const catalog = JSON.parse(await fs.readFile("src/data/feats.json", "utf8"));
const articles = JSON.parse(
  await fs.readFile("src/data/articles.json", "utf8"),
);
const byHref = new Map(articles.map((a) => ["/wiki/" + a.slug + "/", a]));
const videoSources = new Map(
  articles.flatMap((a) =>
    (a.videos || []).map((v) => [v.url, { ...v, guide: a.slug }]),
  ),
);
const named =
  JSON.parse(await fs.readFile("data/feat-video-research.json", "utf8"))
    .named || [];
const records = [];
for (const f of catalog.feats) {
  f.effort = featEffort(f);
  const linked = (f.guides || [])
    .map((g) => byHref.get(g.href))
    .filter(Boolean);
  const videos = named
    .filter((v) => normal(v.feat) === normal(f.title))
    .map((v) => ({
      ...v,
      scope:
        "Feat name appears in video title; mechanics and timestamps not verified",
    }));
  for (const a of linked)
    for (const v of a.videos || []) {
      if (hasFactionConflict(f.title + " (" + f.context + ")", v.title))
        continue;
      const exact =
        normal(v.title).includes(normal(f.title)) &&
        normal(f.title).length >= 10;
      videos.push({
        ...v,
        scope: exact
          ? "Feat name appears in video title"
          : "Related instance overview; feat coverage not verified",
        checked: a.videoReview?.checked || a.retrieved,
        guide: "/wiki/" + a.slug + "/",
      });
    }
  f.videos = [...new Map(videos.map((v) => [v.url, v])).values()].slice(0, 4);
  const a = articles.find((a) => a.slug === f.guide),
    section = a?.sections.find(
      (s) =>
        s.title === f.title &&
        s.items.includes("Requirement: " + f.requirement),
    );
  if (section) {
    section.items = section.items.filter(
      (t) => !t.startsWith("Attempt order: "),
    );
    section.references = section.references.filter(
      (r) => !/^Feat name appears|^Related instance overview/.test(r.label),
    );
    section.items.push(
      "Attempt order: " +
        f.effort.lane +
        ". " +
        (f.effort.flags.join("; ") ||
          "No additional preparation constraint was identified from the source text.") +
        " These are planning flags, not verified completion times.",
    );
    section.references.push(
      ...f.videos.map((v) => ({ label: v.scope + ": " + v.title, url: v.url })),
    );
  }
  for (const v of named.filter((v) => normal(v.feat) === normal(f.title))) {
    const detail = f.detailHref ? byHref.get(f.detailHref) : null;
    if (detail) {
      detail.videos = [
        ...new Map(
          [
            ...(detail.videos || []),
            { title: v.title, url: v.url, evidence: v.evidence },
          ].map((video) => [video.url, video]),
        ).values(),
      ];
      detail.videoReview = {
        status: "verified-match",
        query: "DCUO " + f.title + " feat guide",
        checked: v.checked,
        note: v.evidence,
      };
    }
  }
  records.push({
    feat: f.id,
    guide: f.guide,
    missionGuides: linked.map((a) => a.slug),
    featNamedVideos: f.videos
      .filter((v) => v.scope.startsWith("Feat name"))
      .map((v) => v.url),
    instanceOverviewVideos: f.videos
      .filter((v) => !v.scope.startsWith("Feat name"))
      .map((v) => v.url),
  });
}
await fs.writeFile(
  "src/data/feats.json",
  JSON.stringify(catalog, null, 2) + "\n",
);
await fs.writeFile(
  "src/data/articles.json",
  JSON.stringify(articles, null, 2) + "\n",
);
await fs.writeFile(
  "data/feat-resource-audit.json",
  JSON.stringify(
    {
      checked: new Date().toISOString(),
      records,
      summary: {
        feats: records.length,
        withMissionGuides: records.filter((r) => r.missionGuides.length).length,
        withFeatNamedVideo: records.filter((r) => r.featNamedVideos.length)
          .length,
        withInstanceOverview: records.filter(
          (r) => r.instanceOverviewVideos.length,
        ).length,
        videosReviewedForScope: videoSources.size,
      },
    },
    null,
    2,
  ) + "\n",
);
console.log({
  feats: records.length,
  withMissionGuides: records.filter((r) => r.missionGuides.length).length,
  withFeatNamedVideo: records.filter((r) => r.featNamedVideos.length).length,
  withInstanceOverview: records.filter((r) => r.instanceOverviewVideos.length)
    .length,
});
