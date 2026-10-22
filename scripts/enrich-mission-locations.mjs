// Add explicitly linked mission-set context without inventing objective coordinates.
import { readFile, writeFile } from "node:fs/promises";
import { classifyURL } from "./wiki-urls.mjs";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";
import { plain } from "./convert-reference.mjs";
import { normalizeTitle } from "./convert-missions.mjs";
const report = JSON.parse(
  await readFile("data/mission-conversion.json", "utf8"),
);
const records = new Map();
for (const row of report.records) {
  if (row.error) continue;
  const value = JSON.parse(
    await readFile(
      ".import-cache/converted-missions/" + row.slug + ".json",
      "utf8",
    ),
  );
  records.set(row.source, { row, value });
}
const originalLocations = new Set(
  [...records].filter(([, r]) => r.value.article.location).map(([url]) => url),
);
let enriched = 0;
for (const { row, value } of records.values()) {
  const article = value.article;
  if (article.location) continue;
  const intros = article.sections.filter((s) =>
    /^(?:Source overview|Intro)$/i.test(s.title),
  );
  if (
    !intros.some((s) =>
      s.items.some((i) =>
        /one of .*missions|missions set|mission set|side mission of|wrapper/i.test(
          i,
        ),
      ),
    )
  )
    continue;
  const refs = intros.flatMap((s) => s.references || []);
  for (const ref of refs) {
    const key = classifyURL(ref.url).url;
    if (!originalLocations.has(key)) continue;
    const parent = records.get(key).value.article;
    const reciprocal = parent.sections.some((s) =>
      (s.references || []).some((r) => classifyURL(r.url).url === row.source),
    );
    if (!reciprocal) continue;
    const parentEvidence = records.get(key).value.locationExcerpts?.[0]?.item;
    if (!parentEvidence) continue;
    article.location = {
      label: parent.location.label,
      precision:
        "Associated mission-set area documented by " +
        parent.title +
        ". Exact positions for this individual objective have not been established.",
      source: parent.source,
      maps: parent.location.maps.map((m) => ({
        ...m,
        label: "Mission-set map context: " + m.label,
      })),
    };
    article.sections.push({
      title: "Mission-set location context",
      items: [parentEvidence],
      references: [
        { label: "Location evidence from " + parent.title, url: parent.source },
      ],
    });
    value.locationEnrichment = {
      source: parent.source,
      relationship:
        "Reciprocal source links and explicit mission-set relationship in the mission introduction",
      excerpt: parentEvidence,
    };
    value.words = article.sections
      .flatMap((s) => [...s.items, ...(s.table?.rows.flat() || [])])
      .join(" ")
      .split(/\s+/).length;
    if (value.words >= 40)
      value.reasons = value.reasons.filter(
        (r) => r !== "Insufficient source detail",
      );
    Object.assign(row, {
      location: article.location.label,
      maps: article.location.maps.length,
      words: value.words,
      reasons: value.reasons,
      locationContextSource: parent.source,
    });
    await writeFile(
      ".import-cache/converted-missions/" + row.slug + ".json",
      JSON.stringify(value, null, 2) + "\n",
    );
    enriched++;
    break;
  }
}
// Row-level links bind directory facts to the correct bounty and faction variant.
const bounties = [...records.values()].find((r) => r.row.slug === "Bounties");
let bountyDetails = 0;
if (bounties) {
  const manifest = JSON.parse(
    await readFile("data/mission-downloads.json", "utf8"),
  );
  const capture = JSON.parse(
    await readFile(
      manifest.records.find((r) => r.url === bounties.row.source).cacheFile,
      "utf8",
    ),
  );
  const tree = fromMarkdown(capture.markdown, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
  const links = (n) =>
    n.type === "link" ? [n] : (n.children || []).flatMap(links);
  for (const table of tree.children.filter((n) => n.type === "table")) {
    const columns = table.children[0].children.map(plain);
    if (columns.join("|") !== "Wanted|Origin|City|Faction|Episode") continue;
    for (const node of table.children.slice(1)) {
      const first = links(node.children[0])[0];
      if (!first) continue;
      let target = records.get(classifyURL(first.url).url);
      if (!target) {
        const wanted = normalizeTitle(plain(node.children[0]));
        const matching = [...records.values()].filter(
          (r) =>
            /^(?:BOUNTY|WANTED):/i.test(r.value.article.title) &&
            normalizeTitle(
              r.value.article.title.replace(/^(?:BOUNTY|WANTED):\s*/i, ""),
            ) === wanted,
        );
        if (matching.length === 1) target = matching[0];
      }
      if (!target) continue;
      const values = node.children.map(
        (c) => plain(c).trim() || "Not specified",
      );
      const { row, value } = target,
        article = value.article;
      if (article.sections.some((s) => s.title === "Bounty directory details"))
        continue;
      if (!article.sections.some((s) => /^Objectives?$/i.test(s.title))) {
        article.sections.push({
          title: "Objective",
          items: ["Defeat " + values[0] + "."],
          references: [
            {
              label: "Bounty objective and target evidence",
              url: bounties.row.source,
            },
          ],
        });
        value.reasons = value.reasons.filter(
          (reason) => reason !== "Missing objectives",
        );
      }
      article.sections.push({
        title: "Bounty directory details",
        items: [
          bounties.value.article.sections.find(
            (s) => s.title === "Source overview",
          ).items[0],
        ],
        table: {
          caption: "Source bounty directory entry",
          columns,
          rows: [values],
        },
        references: [
          { label: "Bounty directory source", url: bounties.row.source },
        ],
      });
      if (!article.location)
        article.location = {
          label: values[2] + " / " + values[1],
          precision:
            "City and Origin columns in the source bounty directory; exact spawn points are not established by this row",
          source: bounties.row.source,
          maps: [],
        };
      article.category = "Quests";
      value.words = article.sections
        .flatMap((s) => [...s.items, ...(s.table?.rows.flat() || [])])
        .join(" ")
        .split(/\s+/).length;
      if (value.words >= 40)
        value.reasons = value.reasons.filter(
          (r) => r !== "Insufficient source detail",
        );
      value.bountyDirectorySource = bounties.row.source;
      Object.assign(row, {
        location: article.location.label,
        maps: article.location.maps.length,
        words: value.words,
        reasons: value.reasons,
        bountyDirectorySource: bounties.row.source,
      });
      await writeFile(
        ".import-cache/converted-missions/" + row.slug + ".json",
        JSON.stringify(value, null, 2) + "\n",
      );
      bountyDetails++;
    }
  }
}
let contacts = 0;
for (const { row, value } of records.values()) {
  const article = value.article;
  if (article.location && !value.reasons.length) continue;
  if (
    article.sections.some(
      (s) => s.title === "Mission contact and related main mission",
    )
  )
    continue;
  for (const { value: parentValue } of records.values()) {
    const parent = parentValue.article;
    if (parent.source === article.source) continue;
    const section = parent.sections.find(
      (s) =>
        /freelance missions|side missions/i.test(s.title) &&
        (s.references || []).some(
          (ref) => classifyURL(ref.url).url === row.source,
        ),
    );
    if (!section) continue;
    const entry = section.items.find(
      (item) =>
        normalizeTitle(item).includes(normalizeTitle(article.title)) &&
        /\bfrom\b/i.test(item),
    );
    if (!entry) continue;
    article.sections.push({
      title: "Mission contact and related main mission",
      items: [
        `The source lists this as a freelance mission alongside ${parent.title}. ${entry}`,
      ],
      references: [
        {
          label: "Mission and contact evidence from " + parent.title,
          url: parent.source,
        },
      ],
    });
    if (!article.location && parent.location)
      article.location = {
        ...parent.location,
        precision:
          "Associated main-mission area from " +
          parent.title +
          "; the exact position of this freelance mission contact is not established",
        maps: parent.location.maps.map((m) => ({
          ...m,
          label: "Related mission map context: " + m.label,
        })),
      };
    value.words = article.sections
      .flatMap((s) => [...s.items, ...(s.table?.rows.flat() || [])])
      .join(" ")
      .split(/\s+/).length;
    if (value.words >= 40)
      value.reasons = value.reasons.filter(
        (r) => r !== "Insufficient source detail",
      );
    Object.assign(row, {
      location: article.location?.label,
      maps: article.location?.maps.length || 0,
      words: value.words,
      reasons: value.reasons,
      contactSource: parent.source,
    });
    await writeFile(
      ".import-cache/converted-missions/" + row.slug + ".json",
      JSON.stringify(value, null, 2) + "\n",
    );
    contacts++;
    break;
  }
}
const supplements = JSON.parse(
  await readFile("data/mission-supplementary-evidence.json", "utf8").catch(
    (error) => {
      if (error.code === "ENOENT") return '{"records":[]}';
      throw error;
    },
  ),
);
let supplementalContacts = 0;
for (const evidence of supplements.records) {
  const target = [...records.values()].find(
    (r) => r.row.slug === evidence.slug,
  );
  if (!target) continue;
  const { row, value } = target,
    article = value.article;
  if (article.sections.some((s) => s.title === "Contact and start location"))
    continue;
  article.sections.push({
    title: "Contact and start location",
    items: [evidence.excerpt],
    references: [{ label: "Contact location evidence", url: evidence.source }],
  });
  article.location = {
    label: evidence.location,
    precision: evidence.precision,
    source: evidence.source,
    maps: article.location?.maps || [],
  };
  value.words = article.sections
    .flatMap((s) => [...s.items, ...(s.table?.rows.flat() || [])])
    .join(" ")
    .split(/\s+/).length;
  if (value.words >= 40)
    value.reasons = value.reasons.filter(
      (r) => !["Insufficient source detail", "Missing objectives"].includes(r),
    );
  Object.assign(row, {
    location: article.location.label,
    maps: article.location.maps.length,
    words: value.words,
    reasons: value.reasons,
    supplementarySource: evidence.source,
  });
  await writeFile(
    ".import-cache/converted-missions/" + row.slug + ".json",
    JSON.stringify(value, null, 2) + "\n",
  );
  supplementalContacts++;
}
report.enrichedAt = new Date().toISOString();
await writeFile(
  "data/mission-conversion.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log({
  enriched,
  bountyDetails,
  contacts,
  supplementalContacts,
  withLocation: report.records.filter((r) => r.location).length,
  thin: report.records.filter((r) => r.reasons?.length).length,
});
