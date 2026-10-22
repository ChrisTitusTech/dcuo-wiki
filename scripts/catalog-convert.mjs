// Convert reviewed category foundations without changing published article IDs.
import { convertReference } from "./convert-reference.mjs";
import { classifyURL } from "./wiki-urls.mjs";
import { rootGroups } from "./catalog-plan.mjs";
import { missionLayout, missionSummary } from "./mission-layout.mjs";
import {
  cleanImportedArticle,
  sectionHasContent,
  filledTable,
} from "../shared/import-text.mjs";
import { baselineDocument } from "../shared/rich-article.mjs";
import { articleParts } from "../shared/article-content.mjs";
import { issuesFor } from "./content-policy.mjs";

export function canonicalCapture(capture) {
  for (const value of [
    capture.metadata?.ogUrl,
    capture.metadata?.url,
    capture.url,
  ]) {
    if (!value) continue;
    const parsed = classifyURL(value);
    if (parsed.kind !== "article")
      throw Error("Canonical source is outside gameplay articles");
    return parsed;
  }
  throw Error("Missing canonical source");
}
const maintenance =
  /^(?:This article (?:needs|is a)|Please (?:refer to|follow)|The following is a list of links to pages that might share|Source details and references for |Source-listed entries\.)/i;
export function convertCatalog(capture, target) {
  if (
    capture.metadata?.statusCode !== 200 ||
    !capture.html ||
    !capture.markdown?.trim()
  )
    throw Error("Incomplete source capture");
  if (/This article is a disambiguation page/i.test(capture.markdown))
    throw Error("Disambiguation: follow substantive targets instead");
  const canonical = canonicalCapture(capture);
  const title = canonical.title.replaceAll("_", " ");
  // These are explicitly reviewed foundations. Do not inherit a referring
  // quest/feat category for an unknown target or bypass its quality requirements.
  const root = Object.entries(rootGroups).find(([, names]) =>
    names.includes(canonical.title),
  );
  const category =
    root?.[0] || (target.priority === 0 ? target.category : null);
  if (!category) throw Error("Category requires editorial classification");
  let markdown = capture.markdown;
  const transformations = [];
  if (canonical.title === "New_Genesis") {
    markdown = markdown.replace(
      /(^## Inhabitants[^\n]*\n)([\s\S]*?)(?=^## )/m,
      (_, heading, body) => {
        transformations.push(
          "Flattened malformed nested Inhabitants gallery tables; retained character links, labels and images.",
        );
        return (
          heading +
          body
            .split("\n")
            .filter((line) => !/^[ |:-]+$/.test(line))
            .map((line) =>
              line.replace(/^\s*\|+\s*/, "").replace(/(?:\s*\|)+\s*$/, ""),
            )
            .join("\n") +
          "\n\n"
        );
      },
    );
  }
  const converted = convertReference(markdown, canonical.url);
  converted.audit.push(
    ...transformations.map((note) => ({ transformation: note })),
  );
  const sourceIntro = converted.sections[0]?.items.join(" ") || "";
  if (
    /\bis an? artifact\b/i.test(sourceIntro) &&
    !converted.sections.some((s) => /rank|effects|stats/i.test(s.title))
  )
    throw Error("Artifact rank/effect details absent from capture");
  let article = cleanImportedArticle({
    slug: canonical.title
      .replace(/[^A-Za-z0-9_-]+/g, "_")
      .replace(/_+/g, "_")
      .replace(/_$/, ""),
    title,
    category,
    summary: "",
    sections: converted.sections,
    source: canonical.url,
    history: canonical.url + "?action=history",
    license: "CC-BY-SA; see source for exceptions",
    retrieved:
      capture.retrieved?.slice(0, 10) || target.retrieved?.slice(0, 10),
    reviewed: true,
  });
  for (const s of article.sections) {
    s.items = s.items.filter((i) => !maintenance.test(i));
    if (canonical.title === "Infernal_Kahndaq")
      s.items = s.items.map((item) =>
        item.replace(
          "This was a hint that a new bounty was coming soon. Pride was officially launched as a Bounty on 26 Jan 2023.",
          "Pride was officially launched as a Bounty on 26 Jan 2023.",
        ),
      );
    if (s.items.some((i) => /^This subject has been replaced/.test(i))) {
      s.items = s.items.filter(
        (i) => i !== '"All reality shall be consumed by the Paradox!"',
      );
      s.images = (s.images || []).filter(
        (i) => !/Paradox_Reaper|Speedforce2/.test(i.url),
      );
    }
    if (s.references)
      s.references = s.references.filter(
        (r) => classifyURL(r.url).kind !== "excluded",
      );
    if (s.table) {
      const table = filledTable(s.table.columns, s.table.rows);
      if (!table.rows.length || !table.columns.length) delete s.table;
      else Object.assign(s.table, table);
    }
  }
  article.sections = missionLayout({
    ...article,
    sections: distributeTableReferences(article.sections),
  }).filter(sectionHasContent);
  article.summary = missionSummary(article);
  if (article.summary.length >= 400)
    article.summary = article.summary.replace(/\s+\S*$/, "") + "...";
  const issues = issuesFor(article);
  if (issues.length) throw Error([...new Set(issues)].join("; "));
  const used = new Set(
    article.sections.flatMap((s) => s.images || []).map((i) => i.url),
  );
  return {
    article,
    images: converted.images
      .filter((i) => used.has(i.sourcePage))
      .map((i) => ({ ...i, retrieved: article.retrieved })),
    audit: converted.audit,
  };
}

// Table references belong beside the rows they describe, rather than a huge
// reference-only heading detached from the table. Preserve unmatched evidence.
export function distributeTableReferences(sections) {
  for (let i = 0; i < sections.length; i++) {
    const parent = sections[i];
    if (parent.table || !parent.references?.length) continue;
    const tables = [];
    for (let j = i + 1; j < sections.length && sections[j].table; j++)
      tables.push(sections[j]);
    if (!tables.length) continue;
    const moved = new Set();
    for (const s of tables) {
      const cells = s.table.rows.flat();
      const matches = parent.references.filter((r) =>
        cells.some((c) => c === r.label || c.includes(r.label)),
      );
      if (matches.length) s.references = [...(s.references || []), ...matches];
      for (const r of matches) moved.add(r);
    }
    const prose = parent.items.join(" ");
    parent.references = parent.references.filter(
      (r) => !moved.has(r) || prose.includes(r.label),
    );
  }
  return sections;
}

export function splitCatalogArticle(article, maxBytes = 60000) {
  try {
    baselineDocument(article, articleParts(article));
    return [article];
  } catch (e) {
    if (!/document limit|too complex|too long|characters/i.test(e.message))
      throw e;
  }
  const groups = [];
  let current = [],
    bytes = 0;
  for (const section of article.sections) {
    const size = Buffer.byteLength(JSON.stringify(section));
    if (size > maxBytes)
      throw Error(
        "Oversized section needs editorial splitting: " + section.title,
      );
    if (current.length && bytes + size > maxBytes) {
      groups.push(current);
      current = [];
      bytes = 0;
    }
    current.push(section);
    bytes += size;
  }
  if (current.length) groups.push(current);
  const slugs = groups.map((_, i) => article.slug + "_" + (i + 1));
  const parts = groups.map((sections, i) => ({
    ...article,
    slug: slugs[i],
    title: article.title + " (Part " + (i + 1) + ")",
    sections,
    related: [article.slug, ...slugs.filter((s) => s !== slugs[i])],
  }));
  const root = {
    ...article,
    sections: [
      { title: "Overview", items: [article.summary] },
      {
        title: "Article parts",
        items: parts.map((p) => p.title),
        references: parts.map((p) => ({
          label: p.title,
          url: "https://dcuo-wiki.com/wiki/" + p.slug + "/",
        })),
      },
    ],
    related: slugs,
  };
  for (const a of [root, ...parts]) {
    const issues = issuesFor(a);
    if (issues.length) throw Error(a.slug + ": " + issues.join("; "));
  }
  return [root, ...parts];
}

export function selectCatalogPublications(entries, existing) {
  const sources = new Set(existing.map((a) => classifyURL(a.source).url));
  const slugs = new Set(existing.map((a) => a.slug));
  const groups = [];
  for (const entry of entries) {
    const source = classifyURL(entry.article.source).url;
    if (sources.has(source)) continue;
    const articles = splitCatalogArticle(entry.article);
    for (const a of articles) {
      if (slugs.has(a.slug)) throw Error("Duplicate article slug: " + a.slug);
      slugs.add(a.slug);
    }
    groups.push({ entry, articles });
    sources.add(source);
  }
  return groups;
}
