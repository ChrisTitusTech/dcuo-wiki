import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfm } from "micromark-extension-gfm";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { classifyURL } from "./wiki-urls.mjs";
import { plain } from "./convert-reference.mjs";
export const normalize = (url) => {
  try {
    const u = new URL(url);
    return u.origin + decodeURIComponent(u.pathname).replaceAll(" ", "_");
  } catch {
    return url;
  }
};
export const links = (node) =>
  node.type === "link"
    ? [
        {
          url: normalize(node.url),
          label: plain(node),
          badge: node.children?.some((c) => c.type === "image"),
        },
      ]
    : (node.children || []).flatMap(links);
const parse = (markdown) =>
  fromMarkdown(markdown, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  }).children;
export function introductory(nodes) {
  const end = nodes.findIndex((n) => n.type === "heading");
  return nodes
    .slice(0, end < 0 ? nodes.length : end)
    .filter((n) => n.type === "paragraph");
}
export function directRelease(nodes, aliases) {
  const intro = introductory(nodes),
    refs = intro.flatMap(links);
  let selected = refs.filter((r) => r.badge && aliases.has(r.url));
  if (!selected.length) selected = refs.filter((r) => aliases.has(r.url));
  return [...new Set(selected.flatMap((r) => aliases.get(r.url)))];
}
const load = async (url) => {
  try {
    return JSON.parse(
      await readFile(
        ".import-cache/" +
          createHash("sha256").update(classifyURL(url).url).digest("hex") +
          ".json",
        "utf8",
      ),
    );
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    return null;
  }
};
export async function assign() {
  const articles = JSON.parse(await readFile("src/data/articles.json", "utf8"));
  const catalog = JSON.parse(await readFile("src/data/releases.json", "utf8"));
  const aliases = new Map();
  for (const r of catalog.filter((r) => r.id !== "anniversary-gifts"))
    for (const u of r.aliases) aliases.set(normalize(u), [r.id]);
  const questURLs = new Set(
    articles
      .filter((a) => a.category === "Quests")
      .map((a) => normalize(a.source)),
  );
  const membership = new Map(),
    membershipSources = new Map();
  const add = (url, id, source) => {
    url = normalize(url);
    if (!membership.has(url)) membership.set(url, new Set());
    membership.get(url).add(id);
    if (!membershipSources.has(url)) membershipSources.set(url, new Set());
    membershipSources.get(url).add(source);
  };
  for (const r of catalog) {
    if (r.id === "anniversary-gifts") continue;
    for (const item of r.content || [])
      for (const link of item.links)
        if (questURLs.has(normalize(link.url))) add(link.url, r.id, r.source);
    const cache = await load(r.source);
    if (!cache?.markdown) continue;
    const nodes = parse(cache.markdown);
    let active = false,
      excluded = false;
    for (const n of nodes) {
      if (n.type === "heading") {
        const title = plain(n).replace(/\[.*$/, "").trim();
        if (n.depth === 2) {
          active =
            /^(?:Missions|Content|Chapter \d|Main Arcs|Exploration|Misc|On Duty|Recurring Missions|Daily|Weekly|Event|Overview|Seasonal)/i.test(
              title,
            ) || r.kind === "event";
          excluded = false;
        } else
          excluded =
            /Characters|Equipment|Collectibles|Feats|Story Blogs|Locations|Briefings|Investigations|Rewards|Collections/i.test(
              title,
            );
        if (
          /Trivia|See also|External Links|Gallery|News|Trailer|Contents|Background|Characters|Equipment|Collectibles|Rewards/i.test(
            title,
          )
        ) {
          excluded = true;
          if (n.depth === 2) active = false;
        }
      } else if (active && !excluded)
        for (const link of links(n))
          if (!link.badge && questURLs.has(link.url))
            add(link.url, r.id, r.source);
    }
  }

  const supports = JSON.parse(
    await readFile("data/release-support-sources.json", "utf8"),
  );
  for (const support of supports) {
    const cache = await load(support.url);
    if (!cache?.markdown) continue;
    const nodes = parse(cache.markdown);
    for (const node of nodes) {
      if (
        node.type === "heading" &&
        /See also|External Links|Trivia|Gallery/i.test(plain(node))
      )
        break;
      if (node.type === "heading" || node.type === "paragraph") continue;
      for (const ref of links(node))
        if (questURLs.has(ref.url)) add(ref.url, support.release, support.url);
    }
  }
  const raw = new Map();
  for (const a of articles) {
    const c = await load(a.source);
    if (a.category === "Quests" && !c?.markdown)
      throw Error("Missing mission capture: " + a.source);
    if (c?.markdown)
      raw.set(normalize(a.source), {
        nodes: parse(c.markdown),
        source: a.source,
      });
  }
  const known = new Map(),
    report = [];
  for (const a of articles) {
    const key = normalize(a.source),
      c = raw.get(key);
    let ids =
      c && a.category === "Quests" ? directRelease(c.nodes, aliases) : [];
    let method = "source-release-badge-or-introduction";
    if (a.category === "Quests" && !ids.length && membership.has(key)) {
      ids = [...membership.get(key)];
      method = "release-content-list";
    }
    if (ids.length)
      known.set(key, {
        ids,
        method,
        ...(method === "release-content-list"
          ? { via: [...membershipSources.get(key)] }
          : {}),
        source: a.source,
        evidence: c
          ? introductory(c.nodes).map(plain).join(" ").slice(0, 1600)
          : "",
      });
  }
  for (const a of articles) {
    if (a.category !== "Quests") continue;
    const key = normalize(a.source),
      c = raw.get(key);
    if (!c || known.has(key)) continue;
    const intro = introductory(c.nodes).map(plain).join(" ");
    if (/(?:level\s+(?:[1-9]|1\d|2\d)(?:\s|[,.-])|low level)/i.test(intro))
      known.set(key, {
        ids: ["core-game"],
        method: "early-level-mission",
        source: a.source,
        evidence: intro.slice(0, 1600),
      });
  }

  const overrides = JSON.parse(
    await readFile("data/release-assignment-overrides.json", "utf8"),
  );
  for (const item of overrides) {
    for (const slug of item.slugs) {
      const a = articles.find((a) => a.slug === slug);
      if (!a) throw Error("Unknown override guide " + slug);
      known.set(normalize(a.source), {
        ids: item.ids,
        method: "reviewed-source-context",
        source: a.source,
        via: item.sources,
        evidence: item.reason,
      });
    }
  }
  // Audited imports come from exact release content entries, including instance pages outside Category:Missions.
  const releaseImports = JSON.parse(
    await readFile("data/release-guide-import.json", "utf8"),
  );
  for (const record of releaseImports.records.filter((r) => r.published)) {
    if (!catalog.some((r) => r.id === record.release))
      throw Error("Unknown imported release " + record.release);
    known.set(normalize(record.url), {
      ids: [record.release],
      method: "verified-release-content-entry",
      source: record.url,
      via: [record.releaseSource, record.catalogSource],
      evidence: record.evidence,
    });
  }
  // City exploration is core progression. Event names are matched only in mission introductions.
  for (const a of articles) {
    if (a.category !== "Quests") continue;
    const key = normalize(a.source),
      c = raw.get(key);
    if (!c || known.has(key)) continue;
    const intro = introductory(c.nodes).map(plain).join(" ");
    let id;
    if (/city exploration missions/.test(intro)) id = "core-game";
    for (const [pattern, release] of [
      [/Wonder Woman Day.*(?:daily|celebration)/i, "wonder-woman-day"],
      [/Batman Day.*(?:daily|celebration)/i, "batman-day"],
      [/Superman Celebration|Superman Day Celebration/i, "superman-day"],
      [/Pride Month celebration/i, "celebrate-pride"],
    ])
      if (pattern.test(intro)) id = release;
    if (id)
      known.set(key, {
        ids: [id],
        method: "explicit-mission-context",
        source: a.source,
        evidence: intro.slice(0, 1600),
      });
  }
  // Only explicit introductory context can inherit an unambiguous content-list or mission association.
  for (let pass = 0; pass < 6; pass++)
    for (const [key, c] of raw) {
      if (known.has(key) || !questURLs.has(key)) continue;
      const intro = introductory(c.nodes);
      const ids = new Set(),
        via = [];
      for (const ref of intro.flatMap(links)) {
        if (ref.url === key) continue;
        const found = known.get(ref.url)?.ids || [];
        if (found.length === 1) {
          ids.add(found[0]);
          via.push(ref.url);
        }
      }
      if (ids.size === 1)
        known.set(key, {
          ids: [...ids],
          method: "introductory-content-association",
          source: c.source,
          via,
          evidence: intro.map(plain).join(" ").slice(0, 1600),
        });
    }
  const assignments = {};
  for (const a of articles) {
    const key = normalize(a.source);
    let entry = known.get(key);
    const intro = raw.has(key)
      ? introductory(raw.get(key).nodes).map(plain).join(" ")
      : a.summary;
    if (!entry && a.category !== "Quests")
      entry = {
        ids: ["game-systems"],
        method: "general-guide",
        source: a.source,
        evidence: a.category + ": " + a.summary,
      };
    if (!entry && /level\s+(?:[1-9]|1\d|2\d)(?:\s|[,.-])/i.test(intro))
      entry = {
        ids: ["core-game"],
        method: "early-level-mission",
        source: a.source,
        evidence: intro.slice(0, 1600),
      };
    if (entry) {
      assignments[a.slug] = entry.ids;
      report.push({ slug: a.slug, ...entry });
    } else
      report.push({
        slug: a.slug,
        ids: [],
        source: a.source,
        method: "unresolved",
        evidence: intro.slice(0, 1600),
      });
  }
  await writeFile(
    "src/data/guide-releases.json",
    JSON.stringify(assignments, null, 2) + "\n",
  );
  await writeFile(
    "data/guide-release-assignments.json",
    JSON.stringify(
      {
        catalogSources: [...new Set(catalog.map((r) => r.catalogSource))],
        records: report,
      },
      null,
      2,
    ) + "\n",
  );
  await writeFile(
    ".import-cache/releases/unresolved.json",
    JSON.stringify(
      report.filter((r) => !r.ids.length),
      null,
      2,
    ) + "\n",
  );
  if (report.some((row) => !row.ids.length))
    throw Error(
      "Unresolved guide releases: see .import-cache/releases/unresolved.json",
    );
  console.log({
    assigned: report.filter((r) => r.ids.length).length,
    unresolved: report.filter((r) => !r.ids.length).length,
  });
}
if (process.argv[1]?.endsWith("assign-guide-releases.mjs")) await assign();
