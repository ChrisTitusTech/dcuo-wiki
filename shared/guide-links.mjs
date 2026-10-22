import records from "../src/data/guide-links.json" with { type: "json" };
const normalize = (value) => {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {}
  return decoded
    .normalize("NFC")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
};
const bySlug = new Map(records.map((r) => [r.slug, r]));
const byTitle = new Map(),
  bySource = new Map(),
  byFactionBase = new Map();
const add = (map, key, r) => {
  const list = map.get(key) || [];
  if (!list.includes(r)) list.push(r);
  map.set(key, list);
};
for (const r of records) {
  add(byTitle, normalize(r.title), r);
  add(byTitle, normalize(r.slug), r);
  add(bySource, normalize(new URL(r.source).pathname.slice(6)), r);
  if (/\((Heroes|Villains)\)$/i.test(r.title))
    add(
      byFactionBase,
      normalize(r.title.replace(/\s*\((Heroes|Villains)\)$/i, "")),
      r,
    );
}
function choose(matches, context = {}, hash = "") {
  if (!matches?.length) return null;
  if (matches.length === 1) return matches[0];
  if (hash) {
    try {
      const key = normalize(hash.slice(1).replace(/\.([a-f0-9]{2})/gi, "%$1"));
      const anchored = matches.filter((r) =>
        r.sections.some(([title]) => normalize(title) === key),
      );
      if (anchored.length === 1) return anchored[0];
    } catch {}
  }
  const faction = context.faction || bySlug.get(context.slug)?.faction;
  const scoped = matches.filter((r) => r.faction === faction);
  if (scoped.length === 1) return scoped[0];
  // Split feat pages are a numbered continuation of the same source. Start at 1.
  const first = matches.find((r) => r.slug.endsWith("_1"));
  return first &&
    matches.every(
      (r) => r.slug.replace(/_\d+$/, "") === first.slug.replace(/_\d+$/, ""),
    )
    ? first
    : null;
}
function factionMatch(key, context) {
  const faction = context.faction || bySlug.get(context.slug)?.faction;
  if (!faction) return null;
  return choose(
    byFactionBase.get(key)?.filter((r) => r.faction === faction),
    context,
  );
}
function destination(record, hash = "") {
  if (!record) return null;
  let anchor = "";
  if (hash) {
    try {
      const key = normalize(hash.slice(1).replace(/\.([a-f0-9]{2})/gi, "%$1"));
      const found = record.sections.find(
        ([title, id]) => normalize(title) === key || id === hash.slice(1),
      );
      if (found) anchor = "#" + found[1];
    } catch {}
  }
  return "/wiki/" + record.slug + "/" + anchor;
}
export function localGuideLink(value, context = {}) {
  try {
    const u = new URL(value, "https://dcuo-wiki.com");
    if (
      u.protocol !== "https:" ||
      u.username ||
      u.password ||
      ![
        "dcuniverseonline.fandom.com",
        "dcuo-wiki.com",
        "www.dcuo-wiki.com",
      ].includes(u.hostname) ||
      !u.pathname.startsWith("/wiki/") ||
      u.search
    )
      return null;
    const path = u.pathname.slice(6).replace(/\/$/, "");
    if (u.hostname !== "dcuniverseonline.fandom.com")
      return bySlug.has(path) ? "/wiki/" + path + "/" + u.hash : null;
    const key = normalize(path);
    return destination(
      choose(bySource.get(key), context, u.hash) ||
        choose(byTitle.get(key), context) ||
        factionMatch(key, context),
      u.hash,
    );
  } catch {
    return null;
  }
}
export function guideReferenceLink(url, context = {}) {
  return localGuideLink(url, context) || url;
}
export function guideTitleLink(title, context = {}) {
  try {
    const key = normalize(title);
    return destination(
      choose(byTitle.get(key), context) ||
        choose(bySource.get(key), context) ||
        factionMatch(key, context),
    );
  } catch {
    return null;
  }
}
// Match source-backed labels as plain text, never as HTML or a fuzzy name guess.
export function guideTextParts(value, references = [], context = {}) {
  if (!value) return [];
  const groups = new Map();
  for (const r of references) {
    const href = localGuideLink(r.url, context);
    if (!r.label) continue;
    const options = groups.get(r.label) || new Set();
    options.add(href || r.url);
    groups.set(r.label, options);
  }
  const faction = context.faction || bySlug.get(context.slug)?.faction;
  const candidates = [...groups]
    .flatMap(([text, options]) => {
      const urls = [...options];
      if (urls.some((url) => !url.startsWith("/wiki/"))) return [];
      if (urls.length === 1) return [{ text, href: urls[0] }];
      const scoped = urls.filter(
        (url) => faction && bySlug.get(url.split("/")[2])?.faction === faction,
      );
      return scoped.length === 1 ? [{ text, href: scoped[0] }] : [];
    })
    .sort((a, b) => b.text.length - a.text.length);
  const exact = candidates.find((r) => r.text === value);
  if (exact) return [exact];
  // A source reference disambiguates a label; do not override an unresolved one
  // with a different article that happens to have the same display name.
  const explicit = references.some((r) => r.label === value);
  const direct =
    context.seeAlso &&
    !explicit &&
    guideTitleLink(value.replace(/^\d+\.\s*/, ""), context);
  if (direct) return [{ text: value, href: direct }];
  if (!candidates.length) return [{ text: value }];
  const parts = [];
  let offset = 0,
    plain = "";
  while (offset < value.length) {
    const match = candidates.find(
      (r) =>
        value.startsWith(r.text, offset) &&
        (!/[\p{L}\p{N}_]/u.test(r.text[0]) ||
          offset === 0 ||
          !/[\p{L}\p{N}_]/u.test(value[offset - 1])) &&
        (!/[\p{L}\p{N}_]/u.test(r.text.at(-1)) ||
          offset + r.text.length === value.length ||
          !/[\p{L}\p{N}_]/u.test(value[offset + r.text.length])),
    );
    if (match) {
      if (plain) {
        parts.push({ text: plain });
        plain = "";
      }
      parts.push(match);
      offset += match.text.length;
    } else plain += value[offset++];
  }
  if (plain) parts.push({ text: plain });
  return parts;
}
