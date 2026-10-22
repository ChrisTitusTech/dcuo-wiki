import { cleanImportedArticle } from "../shared/import-text.mjs";
// Convert sourced feat rows into editable, bounded wiki articles and a compact search catalog.
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  parseFeats,
  parseProseFeats,
  estimateDifficulty,
  completionSteps,
  featReleaseIDs,
  guideMatchesFeat,
} from "./feat-content.mjs";
import { issuesFor } from "./content-policy.mjs";
import { convertReference } from "./convert-reference.mjs";
import { featEffort, planningBundle } from "../shared/feat-planning.mjs";
import { classifyURL } from "./wiki-urls.mjs";
const hash = (s) => createHash("sha256").update(s).digest("hex");
const normal = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
export async function importFeats({ partial = false } = {}) {
  const sourceReport = JSON.parse(
    await readFile(
      partial
        ? ".import-cache/feats/download-progress.json"
        : "data/feat-sources.json",
      "utf8",
    ),
  );
  if (
    !partial &&
    sourceReport.records.some(
      (r) => r.error && r.status !== "omitted-empty-or-missing",
    )
  )
    throw Error(
      "Resolve failed feat downloads before publishing the complete catalog.",
    );
  const sources = (
    Array.isArray(sourceReport) ? sourceReport : sourceReport.records
  )
    .filter((r) => !r.error)
    .sort(
      (a, b) =>
        Number(/\/(?:Bases|Iconic_Styles|Theme_Styles)_Feats$/.test(a.url)) -
          Number(/\/(?:Bases|Iconic_Styles|Theme_Styles)_Feats$/.test(b.url)) ||
        a.url.localeCompare(b.url),
    );
  const originals = JSON.parse(
    await readFile("src/data/articles.json", "utf8"),
  );
  let prior = { articles: [] };
  try {
    prior = JSON.parse(await readFile("data/feat-import.json", "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const priorSlugs = new Set(prior.articles.map((a) => a.slug));
  const articles = originals.filter((a) => !priorSlugs.has(a.slug));
  const assignments = JSON.parse(
    await readFile("src/data/guide-releases.json", "utf8"),
  );
  for (const slug of priorSlugs) delete assignments[slug];
  const root = articles.find((a) => a.slug === "Feats");
  root.category = "Feats";
  const guides = new Map(
    articles
      .filter((a) => a.slug !== "Feats")
      .map((a) => [classifyURL(a.source).url, a]),
  );
  const releases = JSON.parse(await readFile("src/data/releases.json", "utf8"));
  const seen = new Map(),
    catalog = [],
    groups = [],
    report = [],
    captures = new Map(),
    details = [],
    newMedia = [],
    detailIdentities = new Set(),
    aliases = new Map(),
    namedDetails = new Set();
  for (const record of sources) {
    const c = JSON.parse(await readFile(record.cacheFile, "utf8"));
    const candidate = classifyURL(c.metadata?.url || record.url);
    const source = candidate.kind === "article" ? candidate.url : record.url;
    if (captures.has(source)) {
      report.push({
        source: record.url,
        canonical: source,
        status: "alias",
        sha256: hash(c.html),
        rows: 0,
        unique: 0,
        rejected: [],
        tables: [],
      });
      continue;
    }
    captures.set(source, c);
    const parsed = parseFeats(c.html, source);
    // Individual meta-feat walkthrough tables describe their prerequisites;
    // retain those tables in the complete article instead of duplicating the category.
    const embeddedSupportRows = /(?:^|[_(])Feat(?:\)|_|$)/i.test(
      decodeURIComponent(new URL(source).pathname.slice(6)),
    )
      ? parsed.records.length
      : 0;
    if (embeddedSupportRows) parsed.records = [];
    const prose =
      !parsed.records.length &&
      /\/(?:Bases|Iconic_Styles|Theme_Styles)_Feats$/.test(source)
        ? parseProseFeats(c.markdown, source)
        : null;
    if (prose) {
      parsed.records = prose.records;
      newMedia.push(
        ...prose.images.map((i) => ({
          ...i,
          retrieved: c.retrieved.slice(0, 10),
        })),
      );
    }
    const title = decodeURIComponent(
      new URL(source).pathname.slice(6),
    ).replaceAll("_", " ");
    for (const feat of parsed.records)
      for (const u of feat.detailSources || [])
        namedDetails.add(classifyURL(u).url);
    const unique = [];
    let supplemented = 0;
    for (const f of parsed.records) {
      if (prose) {
        const matches = catalog.filter((existing) =>
          guideMatchesFeat(existing, {
            title: f.title,
            requirement: f.requirement,
            source,
            aliases,
            allowDirect: false,
          }),
        );
        if (matches.length) {
          for (const existing of matches) {
            const section = articles
              .find((a) => a.slug === existing.guide)
              .sections.find(
                (s) =>
                  s.title === existing.title &&
                  s.items.includes("Requirement: " + existing.requirement),
              );
            section.items.push(
              ...f.extra.filter((t) => t.startsWith("Source guidance:")),
              ...(/\(old\)/.test(f.context)
                ? [
                    "Source guidance: Historical item checklist; confirm the current required pieces in the in-game Feats menu.",
                  ]
                : []),
            );
            section.references.push({
              label: "Source item checklist",
              url: source,
            });
            section.images = [
              ...new Map(
                [...(section.images || []), ...f.sourceImages].map((i) => [
                  i.url,
                  i,
                ]),
              ).values(),
            ];
            if (!section.images.length) delete section.images;
          }
          supplemented++;
          continue;
        }
      }
      if (/^[? .-]+$/.test(f.title)) {
        f.sourceTitle = f.title;
        f.title =
          f.requirement.slice(0, 100) +
          (f.requirement.length > 100 ? "..." : "") +
          " (name not stated)";
      }
      if (seen.has(f.id)) {
        seen.get(f.id).alsoOn.push(f.source);
        continue;
      }
      f.alsoOn = [];
      seen.set(f.id, f);
      unique.push(f);
    }
    report.push({
      source: record.url,
      canonical: source,
      sha256: hash(c.html),
      rows: parsed.records.length,
      unique: unique.length,
      supplemented,
      embeddedSupportRows,
      rejected: parsed.rejected,
      tables: parsed.tables,
    });
    if (!unique.length) continue;
    const slugBase = title
      .replace(/[^A-Za-z0-9_-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "");
    if (articles.some((a) => a.slug === slugBase))
      throw Error("Feat slug collision: " + slugBase);
    // Source links and exact release titles determine association, not fuzzy title fragments.
    const intro = c.markdown.split(/^##?\s+(?!Contents)/m)[0];
    const introLinks = [...intro.matchAll(/\]\((https:\/\/[^\s)]+)/g)].map(
      (m) => m[1],
    );
    const releaseIDs = featReleaseIDs(title, introLinks, releases);
    const group = {
      title,
      count: unique.length,
      source,
      guides: [],
      releases: releaseIDs,
    };
    for (let start = 0; start < unique.length; start += 25) {
      const batch = unique.slice(start, start + 25),
        page = Math.floor(start / 25) + 1,
        slug = slugBase + (unique.length > 25 ? "_" + page : "");
      const sections = batch.map((f, i) => {
        f.difficulty = estimateDifficulty(f);
        f.guide = slug;
        f.href = `/wiki/${slug}/#section-${i}`;
        f.group = title;
        const rowIDs = releaseIDs.length
          ? releaseIDs
          : featReleaseIDs(
              "",
              f.links.map((l) => l.url),
              releases,
            );
        f.releases = rowIDs.length ? rowIDs : ["game-systems"];
        f.guides = [
          ...new Map(
            f.links
              .map((l) => guides.get(classifyURL(l.url).url))
              .filter(Boolean)
              .map((g) => [
                g.slug,
                {
                  title: g.title,
                  href: "/wiki/" + g.slug + "/",
                  category: g.category,
                },
              ]),
          ).values(),
        ];
        catalog.push(f);
        return {
          title: f.title,
          ...(f.sourceImages?.length ? { images: f.sourceImages } : {}),
          items: [
            `Requirement: ${f.requirement}`,
            `Feat reward: ${f.reward}`,
            ...f.extra,
            ...(f.sourceTitle
              ? [
                  "Source feat name not stated; identified here by its documented requirement.",
                ]
              : []),
            `Difficulty estimate: ${f.difficulty.level}/5 (${f.difficulty.label}) - ${f.difficulty.reason}`,
            ...completionSteps(f)
              .slice(1)
              .map((s) => "Completion plan: " + s),
          ],
          references: [
            { label: "Feat requirement and reward", url: f.source },
            ...f.guides.map((g) => ({
              label: "Our guide: " + g.title,
              url: "https://dcuo-wiki.com" + g.href,
            })),
            ...f.links,
          ],
        };
      });
      const a = {
        slug,
        title: title + (unique.length > 25 ? ` - Part ${page}` : ""),
        category: "Feats",
        summary: `Requirements, rewards and completion plans for ${batch.length} ${title.replace(/ Feats?$/i, "")} feats. Five-step difficulty estimates reflect mechanics and effort, independently of feat-point stars.`,
        sections,
        source,
        history: source + "?action=history",
        retrieved: c.retrieved.slice(0, 10),
        reviewed: true,
        license: root.license,
        related: [
          "Feats",
          ...new Set(
            batch.flatMap((f) => f.guides.map((g) => g.href.split("/")[2])),
          ),
        ].slice(0, 12),
      };
      const issues = issuesFor(a);
      if (issues.length) throw Error(slug + ": " + issues.join("; "));
      articles.push(a);
      assignments[slug] = [...new Set(batch.flatMap((f) => f.releases))];
      group.guides.push({ slug, title: a.title });
    }
    groups.push(group);
  }
  const detailGroup = {
    title: "Individual feat walkthroughs",
    count: 0,
    source: root.source,
    guides: [],
    releases: [],
  };
  for (const [source, c] of captures) {
    const sourceTitle = decodeURIComponent(
      new URL(source).pathname.slice(6),
    ).replaceAll("_", " ");
    if (
      !/(?:^|[ (])Feat(?:\)| |$)/i.test(sourceTitle) &&
      !namedDetails.has(classifyURL(source).url)
    )
      continue;
    let title = sourceTitle.replace(/ ?\(Feat\)| Feat$/i, "");
    const slug = sourceTitle
      .replace(/[^A-Za-z0-9_-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "");
    const converted = convertReference(c.markdown, source);
    if (
      !/(?:^|[ (])Feat(?:\)| |$)/i.test(sourceTitle) &&
      !/(?:is (?:a|an).*?feat|this feat|complete (?:the|this) feat)/i.test(
        c.markdown.slice(0, 4000),
      )
    ) {
      details.push({
        source,
        status: "support-only",
        reason: "Linked content reference, not an individual feat guide",
      });
      continue;
    }
    title =
      converted.sections.find((s) => /^Feat Title$/i.test(s.title))?.items[0] ||
      c.markdown.match(/\*\*([^*]+)\*\* is a feat/i)?.[1] ||
      title;
    const objectives = converted.sections.filter((s) =>
      /^(?:Objectives?|Feat Description|Requirements?)(?: |$)/i.test(s.title),
    );
    const summaryInstructions = converted.sections
      .filter((s) => /^Summary$/i.test(s.title))
      .flatMap((s) => s.items)
      .filter((t) =>
        /\b(?:collect|complete|defeat|drink|consume|visit|win|find|reach|use|finish)\b/i.test(
          t,
        ),
      );
    const requirement = [
      ...summaryInstructions,
      ...objectives.flatMap((s) => s.items),
    ]
      .filter((t) => normal(t) !== normal(title) && !/^\d+\/\d+$/.test(t))
      .join("; ");
    const matched = catalog.filter(
      (f) =>
        f.context !== "Individual walkthrough" &&
        guideMatchesFeat(f, { title, requirement, source, aliases }),
    );
    if (
      !requirement ||
      /\?{2,}|\b(?:TBD|coming soon)\b/i.test(requirement) ||
      /^(?:n\/?a|tbd|unknown|\?+|-+)$/i.test(requirement)
    ) {
      const useful = converted.sections
        .filter((s) =>
          /^(?:Source overview|Walkthrough|Location|Notes|Tips)$/i.test(
            s.title,
          ),
        )
        .map((s) => ({
          ...s,
          items: s.items.filter(
            (t) =>
              t.length > 40 &&
              !/article.*(?:stub|improv)|you can help|manual of style|editing help|^feat completed$/i.test(
                t,
              ),
          ),
        }))
        .filter((s) => s.items.length);
      if (matched.length && useful.length) {
        for (const f of matched) {
          const a = articles.find((a) => a.slug === f.guide);
          const section = a.sections.find(
            (s) =>
              s.title === f.title &&
              s.items.includes("Requirement: " + f.requirement),
          );
          section.items.push(
            ...useful.flatMap((s) =>
              s.items.map((t) => "Source guidance: " + t),
            ),
          );
          section.references.push({
            label: "Additional feat guidance",
            url: source,
          });
          section.images = [
            ...new Map(
              useful.flatMap((s) => s.images || []).map((i) => [i.url, i]),
            ).values(),
          ];
          if (!section.images.length) delete section.images;
        }
        const used = new Set(
          useful.flatMap((s) => (s.images || []).map((i) => i.url)),
        );
        newMedia.push(
          ...converted.images
            .filter((i) => used.has(i.sourcePage))
            .map((i) => ({ ...i, retrieved: c.retrieved.slice(0, 10) })),
        );
        details.push({
          source,
          status: "supplemented",
          matched: matched.length,
          notes: useful.reduce((n, s) => n + s.items.length, 0),
        });
        continue;
      }
      details.push({
        source,
        status: "omitted",
        reason: "No substantive objective",
      });
      continue;
    }
    const detailIdentity = normal(title) + "\n" + normal(requirement);
    if (detailIdentities.has(detailIdentity)) {
      details.push({
        source,
        status: "duplicate",
        reason: "Identical named objective already imported",
      });
      continue;
    }
    detailIdentities.add(detailIdentity);
    const reward =
      converted.sections
        .filter((s) => /^Rewards?(?: |$)/i.test(s.title))
        .flatMap((s) => s.items)
        .join("; ") ||
      matched[0]?.reward ||
      "Not stated";
    const context = converted.sections[0]?.items.join(" ") || "";
    const estimate = estimateDifficulty({ requirement, context });
    const sections = converted.sections.filter(
      (s) => !/^See also$/i.test(s.title),
    );
    sections.push({
      title: "Difficulty and attempt planning",
      items: [
        `Difficulty estimate: ${estimate.level}/5 (${estimate.label}) - ${estimate.reason}`,
        ...completionSteps({ requirement }).slice(1),
      ],
    });
    const existing = guides.get(classifyURL(source).url);
    if (existing) {
      details.push({ source, status: "existing", slug: existing.slug });
      continue;
    }
    if (articles.some((a) => a.slug === slug))
      throw Error("Detailed feat slug collision: " + slug);
    const ids = [...new Set(matched.flatMap((f) => f.releases))];
    const localGuides = [
      ...new Map(
        sections
          .flatMap((s) =>
            (s.references || []).map((l) => guides.get(classifyURL(l.url).url)),
          )
          .filter(Boolean)
          .map((g) => [g.slug, g]),
      ).values(),
    ];
    const a = {
      slug,
      title,
      category: "Feats",
      summary:
        converted.sections[0]?.items
          .find((t) => t.length > 40)
          ?.slice(0, 400) ||
        `Complete ${title}: objectives, reward, source walkthrough and estimated difficulty.`,
      sections,
      source,
      history: source + "?action=history",
      retrieved: c.retrieved.slice(0, 10),
      reviewed: true,
      license: root.license,
      related: ["Feats", ...localGuides.map((g) => g.slug)].slice(0, 12),
    };
    const issues = issuesFor(a);
    if (issues.length) {
      details.push({ source, status: "omitted", reason: issues.join("; ") });
      continue;
    }
    articles.push(a);
    assignments[slug] = ids.length ? ids : ["game-systems"];
    for (const image of converted.images)
      newMedia.push({ ...image, retrieved: a.retrieved });
    detailGroup.guides.push({ slug, title });
    detailGroup.count++;
    details.push({
      source,
      status: "imported",
      slug,
      matched: matched.length,
      walkthrough: sections
        .filter((s) => /walkthrough|strategy|notes|tips/i.test(s.title))
        .reduce((n, s) => n + s.items.length, 0),
    });
    for (const f of matched) {
      f.detailHref = "/wiki/" + slug + "/";
      const groupArticle = articles.find((a) => a.slug === f.guide);
      const section = groupArticle.sections.find(
        (s) =>
          s.title === f.title &&
          s.items.includes("Requirement: " + f.requirement),
      );
      section.references.push({
        label: "Detailed feat walkthrough",
        url: "https://dcuo-wiki.com/wiki/" + slug + "/",
      });
    }
    if (!matched.length) {
      const pointsMatch = reward.match(/\b(10|25|50|100)\s*(?:feat )?points?/i);
      const f = {
        id: hash(source).slice(0, 16),
        title,
        requirement,
        reward,
        points: pointsMatch ? Number(pointsMatch[1]) : null,
        context: "Individual walkthrough",
        source,
        extra: [],
        links: sections.flatMap((s) => s.references || []),
        alsoOn: [],
        difficulty: estimate,
        guide: slug,
        href: "/wiki/" + slug + "/",
        detailHref: "/wiki/" + slug + "/",
        group: detailGroup.title,
        releases: assignments[slug],
        guides: localGuides.map((g) => ({
          title: g.title,
          href: "/wiki/" + g.slug + "/",
          category: g.category,
        })),
      };
      catalog.push(f);
    }
  }
  detailGroup.count = catalog.filter(
    (f) => f.group === detailGroup.title,
  ).length;
  if (detailGroup.count)
    groups.push({
      ...detailGroup,
      guides: detailGroup.guides.filter((g) =>
        catalog.some(
          (f) => f.group === detailGroup.title && f.guide === g.slug,
        ),
      ),
    });
  const media = JSON.parse(await readFile("data/media-sources.json", "utf8"));
  const mediaBySource = new Map(media.map((m) => [m.sourcePage, m]));
  for (const image of newMedia)
    if (!mediaBySource.has(image.sourcePage))
      mediaBySource.set(image.sourcePage, image);
  await writeFile(
    "data/media-sources.json",
    JSON.stringify([...mediaBySource.values()], null, 2) + "\n",
  );
  // Keep existing editable section ordering and text stable; add only a new explanation.
  if (
    !root.sections.some(
      (s) => s.title === "Difficulty estimates and completion plans",
    )
  )
    root.sections.unshift({
      title: "Difficulty estimates and completion plans",
      items: [
        "Browse the searchable Feats catalog for individual requirements, reward points and completion plans. Difficulty uses five bars: Simple, Routine, Demanding, Hard and Extreme. These are editorial estimates based on mechanics, coordination and time investment; they are independent of the game's feat-point stars.",
        "Completion plans retain the exact source requirement and add conservative planning advice. Gear, group skill, availability and luck can change the effort. Read linked mission and item pages for detailed mechanics, and verify current requirements in the in-game Feats menu.",
      ],
    });
  // Do not shift pre-existing live section IDs when introducing this explanation.
  const newIndex = root.sections.findIndex(
    (s) => s.title === "Difficulty estimates and completion plans",
  );
  root.sections.push(...root.sections.splice(newIndex, 1));
  for (const f of catalog)
    f.releases = [
      ...new Set(
        f.releases.flatMap((id) => {
          const r = releases.find((r) => r.id === id);
          return r?.arc ? [id, r.arc] : [id];
        }),
      ),
    ];
  for (const f of catalog) {
    f.effort = featEffort(f);
    f.bundle = planningBundle(f);
  }
  catalog.sort(
    (a, b) => a.title.localeCompare(b.title) || a.group.localeCompare(b.group),
  );
  await writeFile(
    "src/data/articles.json",
    JSON.stringify(articles.map(cleanImportedArticle), null, 2) + "\n",
  );
  const assignmentReport = JSON.parse(
    await readFile("data/guide-release-assignments.json", "utf8"),
  );
  assignmentReport.records = assignmentReport.records.filter(
    (r) => !priorSlugs.has(r.slug),
  );
  for (const a of articles.filter(
    (a) =>
      !originals.some((old) => old.slug === a.slug) || priorSlugs.has(a.slug),
  ))
    assignmentReport.records.push({
      slug: a.slug,
      ids: assignments[a.slug],
      method: "feat-source-release",
      source: a.source,
      evidence: `${a.title}: ${a.summary} Source catalog links and exact release names determine the release; unassociated system feats use game-systems.`,
    });
  await writeFile(
    "data/guide-release-assignments.json",
    JSON.stringify(assignmentReport, null, 2) + "\n",
  );
  await writeFile(
    "src/data/guide-releases.json",
    JSON.stringify(assignments, null, 2) + "\n",
  );
  await writeFile(
    "src/data/feats.json",
    JSON.stringify(
      { groups, walkthroughs: detailGroup.guides, feats: catalog },
      null,
      2,
    ) + "\n",
  );
  const audit = {
    partial,
    sources: report.length,
    sourceRows: report.reduce((n, r) => n + r.rows, 0),
    feats: catalog.length,
    articles: [
      ...new Map(
        [...groups.flatMap((g) => g.guides), ...detailGroup.guides].map((g) => [
          g.slug,
          g,
        ]),
      ).values(),
    ],
    groups: groups.length,
    duplicates: report.reduce(
      (n, r) => n + r.rows - r.unique - (r.supplemented || 0),
      0,
    ),
    supplementedRows: report.reduce((n, r) => n + (r.supplemented || 0), 0),
    details,
    records: report,
  };
  await writeFile(
    "data/feat-import.json",
    JSON.stringify(audit, null, 2) + "\n",
  );
  console.log({
    sources: audit.sources,
    sourceRows: audit.sourceRows,
    feats: catalog.length,
    groups: groups.length,
    articles: audit.articles.length,
    duplicates: audit.duplicates,
    rejected: report.reduce((n, r) => n + r.rejected.length, 0),
  });
}
if (process.argv[1]?.endsWith("import-feats.mjs"))
  await importFeats({ partial: process.argv.includes("--partial") });
