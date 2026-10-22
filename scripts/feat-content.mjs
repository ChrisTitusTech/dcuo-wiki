import { parseFragment } from "parse5";
import { createHash } from "node:crypto";
import { convertReference } from "./convert-reference.mjs";
const attrs = (n) =>
  Object.fromEntries((n.attrs || []).map((a) => [a.name, a.value]));
export const clean = (s) =>
  s
    .replace(/\s+/g, " ")
    .replace(/\s*;\s*;/g, ";")
    .trim()
    .replace(/^;\s*|\s*;$/g, "")
    .trim();
export function nodeText(n) {
  if (n.nodeName === "#text") return n.value;
  if (
    ["script", "style", "sup"].includes(n.tagName) ||
    /(?:mw-editsection|mw-collapsible-toggle|toc|navbox)/.test(
      attrs(n).class || "",
    )
  )
    return "";
  if (n.tagName === "br") return "; ";
  if (n.tagName === "img")
    return /(?:points?|stars?)/i.test(attrs(n).alt || "") ? attrs(n).alt : "";
  const inner = (n.childNodes || []).map(nodeText).join("");
  return ["p", "li"].includes(n.tagName) ? "; " + inner + "; " : inner;
}
export function wikiLinks(n, source) {
  const links = [];
  const visit = (n) => {
    if (n.tagName === "a")
      try {
        const a = attrs(n),
          u = new URL(a.href, source),
          label = clean(nodeText(n));
        if (
          label &&
          u.origin === "https://dcuniverseonline.fandom.com" &&
          u.pathname.startsWith("/wiki/") &&
          !u.search &&
          !/\bnew\b/.test(a.class || "") &&
          !/\/(?:File|Category|Template|Special):/.test(u.pathname)
        )
          links.push({ label, url: u.href });
      } catch {}
    for (const c of n.childNodes || []) visit(c);
  };
  visit(n);
  return [...new Map(links.map((l) => [l.url, l])).values()];
}
const children = (n, tag) =>
  (n.childNodes || []).flatMap((c) =>
    c.tagName === tag ? [c] : c.tagName === "table" ? [] : children(c, tag),
  );
function grid(table) {
  const rows = [],
    carry = new Map();
  for (const tr of children(table, "tr")) {
    const row = [];
    for (const [i, v] of carry) {
      row[i] = v.cell;
      if (--v.left === 0) carry.delete(i);
    }
    let col = 0;
    for (const cell of (tr.childNodes || []).filter((n) =>
      ["th", "td"].includes(n.tagName),
    )) {
      while (row[col]) col++;
      const a = attrs(cell),
        width = Number(a.colspan || 1),
        height = Number(a.rowspan || 1);
      if (
        !Number.isInteger(width) ||
        width < 1 ||
        width > 100 ||
        !Number.isInteger(height) ||
        height < 1 ||
        height > 10000
      )
        throw Error("Invalid feat table spans");
      for (let j = 0; j < width; j++) {
        if (row[col]) throw Error("Overlapping feat table spans");
        row[col] = cell;
        if (height > 1) carry.set(col, { cell, left: height - 1 });
        col++;
      }
    }
    rows.push(row);
  }
  if (carry.size) throw Error("Incomplete feat table spans");
  return rows;
}
export function parseFeats(html, source) {
  const root = parseFragment(html),
    records = [],
    tables = [],
    rejected = [];
  let heading = "Feats",
    anchor = "";
  const visit = (n) => {
    if (/^h[1-6]$/.test(n.tagName || "")) {
      heading = clean(nodeText(n));
      const span = children(n, "span").find((c) => attrs(c).id);
      anchor = attrs(span || n).id || "";
    }
    if (n.tagName === "table") {
      if (/navbox/.test(attrs(n).class || "")) return;
      const hasFeatHeader = children(n, "tr").some((tr) => {
        const labels = (tr.childNodes || [])
          .filter((c) => ["th", "td"].includes(c.tagName))
          .map((c) => clean(nodeText(c)).toLowerCase());
        return (
          labels.some((t) => /^(?:title|feat(?: name)?|name)$/.test(t)) &&
          labels.some((t) =>
            /^(?:description|requirements?|objectives?)$/.test(t),
          )
        );
      });
      if (!hasFeatHeader) return;
      const rows = grid(n);
      let columns = null;
      for (let index = 0; index < rows.length; index++) {
        const row = rows[index],
          texts = row.map((c) => clean(nodeText(c))),
          labels = texts.map((t) => t.toLowerCase());
        const titleIndex = labels.findIndex((t) =>
          /^(?:title|feat(?: name)?|name)$/.test(t),
        );
        const descIndex = labels.findIndex((t) =>
          /^(?:description|requirements?|objectives?)$/.test(t),
        );
        if (titleIndex >= 0 && descIndex >= 0) {
          columns = {
            title: titleIndex,
            description: descIndex,
            reward: labels.findIndex((t) =>
              /^(?:reward|points|feat points)$/.test(t),
            ),
            labels: texts,
          };
          continue;
        }
        if (!columns) continue;
        if (new Set(row).size === 1) continue; // section-wide heading rows
        const title = texts[columns.title]?.replace(/;\s*(?=\()/g, " "),
          requirement = texts[columns.description];
        if (
          !requirement ||
          /\?{2,}|\b(?:TBD|coming soon)\b/i.test(requirement) ||
          /^(?:n\/?a|tbd|unknown|\?+|-+|coming soon)$/i.test(requirement)
        ) {
          rejected.push({
            heading,
            row: index,
            title,
            requirement,
            reason: "Missing substantive requirement",
          });
          continue;
        }
        const reward =
          columns.reward < 0
            ? "Not stated"
            : texts[columns.reward] || "Not stated";
        const pointsMatch =
          reward
            .replaceAll(";", " ")
            .match(/\b(10|25|50|100)\s+(?:feat\s+)?points?\b/i) ||
          reward.match(/^(10|25|50|100)$/);
        const points = pointsMatch ? Number(pointsMatch[1]) : null;
        const extra = columns.labels.flatMap((label, i) =>
          i !== columns.title &&
          i !== columns.description &&
          i !== columns.reward &&
          texts[i]
            ? [
                `${/^difficulty$/i.test(label) ? "Source reward tier" : label}: ${texts[i]}`,
              ]
            : [],
        );
        const links = [
          ...new Map(
            row
              .filter(Boolean)
              .flatMap((c) => wikiLinks(c, source))
              .map((l) => [l.url, l]),
          ).values(),
        ];
        const id = createHash("sha256")
          .update([title, requirement, reward, heading, ...extra].join("\n"))
          .digest("hex")
          .slice(0, 16);
        records.push({
          id,
          title: title || "?",
          requirement,
          reward,
          points,
          context: heading,
          source: source + (anchor ? "#" + encodeURIComponent(anchor) : ""),
          extra,
          links,
          detailSources: wikiLinks(row[columns.title], source)
            .filter((l) => {
              const norm = (s) =>
                s
                  .toLowerCase()
                  .replace(/\((?:heroes?|villains?) only\)/g, "")
                  .replace(/[^a-z0-9]/g, "");
              return norm(l.label) === norm((title || "").split(";")[0]);
            })
            .map((l) => l.url),
        });
      }
      if (columns)
        tables.push({ heading, rows: rows.length, columns: columns.labels });
      return;
    }
    for (const c of n.childNodes || []) visit(c);
  };
  visit(root);
  return { records, tables, rejected };
}
// Editorial estimates use mechanics and workload, never reward stars or points.
export function estimateDifficulty(feat) {
  const text = (feat.requirement + " " + (feat.context || ""))
    .toLowerCase()
    .replace(/\bnormal\s+or\s+elite(?:\s*(?:plus|\+))?/g, "normal")
    .replace(/\belite\s+or\s+elite\s*(?:plus|\+)/g, "elite");
  const equipmentOnly =
    /^(?:collect|create|equip|fortify|research|purchase|obtain)\b/i.test(
      feat.requirement,
    ) && !/\b(?:raid|alert|defeat|boss|operation|instance)\b/.test(text);
  let level = 2,
    reasons = [];
  if (
    !equipmentOnly &&
    /\belite\+|\belite plus|\bsurvival.*(?:round|level)\s*(?:2\d|30)|\b(?:round|level)\s*(?:2\d|30).*survival/i.test(
      text,
    )
  ) {
    level = 5;
    reasons.push(
      "Top-end encounter or late Survival round requires an experienced coordinated group.",
    );
  } else if (
    !equipmentOnly &&
    /\belite\b|\bround\s*(?:1\d|2\d|30)\b/.test(text)
  ) {
    level = 4;
    reasons.push(
      "Elite encounter or later Survival round raises the execution and group requirements.",
    );
  }
  if (
    /without (?:anyone |any (?:group |team )?members? )?(?:being |getting )?(?:knocked out|dying)|no (?:deaths|knockouts)|without.*(?:damage|hit|dying|defeated|knocked out)/.test(
      text,
    )
  ) {
    level = Math.max(level, 4);
    reasons.push(
      "A failure-avoidance condition must hold through the encounter.",
    );
  }
  if (
    /(?:under|within|less than|no more than)\s+(?:\d+|one|two|three|four|five).*?(?:minutes?|seconds?)/.test(
      text,
    )
  ) {
    level = Math.max(level, 3);
    reasons.push("A time limit makes routing and execution important.");
  }
  if (/\b(?:raid|raids|arena|arenas|pvp|duel|duels|legends pve)\b/.test(text)) {
    level = Math.max(level, 3);
    reasons.push("Group coordination or an opposing player adds variability.");
  }
  const numbers = [
    ...text.matchAll(
      /\b(?:defeat|collect|complete|win|earn|salvage|craft|gather|open|consume|destroy|research|squish|seal|disable|download|recover|assist|perform|activate|purchase|harvest)\s+([\d,]+)\b|\b([\d,]+)\s+(?:times|missions|bounties|races|items|enemies|players)\b|\brank\s+([\d,]+)/g,
    ),
  ].map((m) => Number((m[1] || m[2] || m[3]).replaceAll(",", "")));
  if (numbers.some((n) => n >= 100)) {
    level = Math.max(level, 3);
    reasons.push(
      "A large counter or rank requirement adds a substantial time investment.",
    );
  }
  if (
    /\b(?:collections?|style set|all styles|all pieces|all of the.*styles)\b/.test(
      text,
    )
  ) {
    level = Math.max(level, 2);
    reasons.push(
      "Collection completion depends on obtaining all required pieces.",
    );
  }
  if (
    level === 2 &&
    /^(?:reach level (?:[1-9]|[12]\d)|equip |use |visit |enter |collect (?:a |an |1 |one )|open )/i.test(
      feat.requirement,
    ) &&
    !/\b(?:all|elite|raid|round)\b/.test(text)
  ) {
    level = 1;
    reasons.push(
      "A single basic action with no additional timing or group condition stated.",
    );
  }
  if (!reasons.length)
    reasons.push(
      "Provisional estimate from the stated objective; effort depends on gear, group and availability. No completion time has been measured.",
    );
  return {
    level,
    label: ["", "Simple", "Routine", "Demanding", "Hard", "Extreme"][level],
    reason: reasons.join(" "),
    estimated: true,
  };
}
export function completionSteps(feat) {
  const req = feat.requirement,
    steps = [];
  // Preserve source conditions verbatim before adding requirement-based planning advice.
  steps.push("Complete the stated objective: " + req);
  if (/\b(?:raid|alert|duo|operation|elite|group|team|instance)\b/i.test(req))
    steps.push(
      "Before entering, agree on the feat conditions with your group and use the exact instance variant named in the requirement.",
    );
  if (
    /(?:under|within|less than|no more than)\s+(?:\d+|one|two|three|four|five).*?(?:minutes?|seconds?)/i.test(
      req,
    )
  )
    steps.push(
      "Plan movement and objectives before the attempt; keep the full run or encounter inside the stated time limit.",
    );
  if (/\bwithout\b|\bnever\b|\bdo not\b/i.test(req))
    steps.push(
      "Treat the stated failure condition as mandatory for the whole attempt; check with the group before continuing after a mistake.",
    );
  if (/\b(?:collect|collection|styles?|base items?|emblems?)\b/i.test(req))
    steps.push(
      "Track the named pieces in the feat menu before spending currency or collecting duplicates. Follow the source item links for the exact collection or style set.",
    );
  if (/\b(?:times|daily|days|weekly|weeks|missions|bounties)\b/i.test(req))
    steps.push(
      "Check the feat counter between completions and continue until its full target is met; follow any daily, weekly or event restriction stated above.",
    );
  steps.push(
    "Confirm completion in the in-game Feats menu. This planning advice is inferred from the requirement; it is not a verified encounter walkthrough.",
  );
  return steps;
}

export function featReleaseIDs(title, links, releases) {
  const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const numbered = Number(title.match(/^Episode (\d+) Feats$/i)?.[1]);
  const direct = releases.filter(
    (r) =>
      normalize(title.replace(/ Feats?$/i, "")) === normalize(r.title) ||
      (r.kind === "episode" && r.number === numbered),
  );
  if (direct.length) return direct.map((r) => r.id);
  const urls = new Set(
    links.map((u) => {
      try {
        return decodeURIComponent(new URL(u).pathname).replaceAll(" ", "_");
      } catch {
        return "";
      }
    }),
  );
  const linked = releases.filter(
    (r) =>
      !["Events", "Episode", "Chapter", "Feats"].includes(
        decodeURIComponent(new URL(r.source).pathname.slice(6)),
      ) &&
      urls.has(
        decodeURIComponent(new URL(r.source).pathname).replaceAll(" ", "_"),
      ),
  );
  return linked.length === 1 ? linked.map((r) => r.id) : [];
}

export function guideMatchesFeat(
  feat,
  { title, requirement, source, aliases = new Map(), allowDirect = true },
) {
  const urlKey = (value) => {
    try {
      const u = new URL(value);
      return decodeURIComponent(u.origin + u.pathname).replaceAll(" ", "_");
    } catch {
      return "";
    }
  };
  const canonical = (value) => aliases.get(urlKey(value)) || urlKey(value);
  const direct = feat.links.some((l) => canonical(l.url) === canonical(source));
  if (allowDirect && direct) return true;
  const normalize = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (normalize(feat.title) !== normalize(title)) return false;
  const left = normalize(feat.requirement),
    right = normalize(requirement);
  return (
    Math.min(left.length, right.length) >= 24 &&
    (left.includes(right) ||
      right.includes(left) ||
      (() => {
        const a = normalize(feat.requirement.split(";")[0]),
          b = normalize(requirement.split(";")[0]);
        return (
          Math.min(a.length, b.length) >= 24 && (a.includes(b) || b.includes(a))
        );
      })())
  );
}

// Older category pages use a named heading, objective/list and an explicit reward.
export function parseProseFeats(markdown, source) {
  const converted = convertReference(markdown, source);
  const overview =
    converted.sections
      .find((s) => s.title === "Source overview")
      ?.items.join(" ") || "";
  const legacy = /updated, current version|can now be found under/i.test(
    overview,
  );
  const records = [];
  for (const section of converted.sections) {
    const reward = section.items.find((t) => /^Reward:.*feat points/i.test(t));
    const requirement = section.items.find((t) =>
      /^(?:collect|acquire|complete|obtain|purchase|equip|reach|own)\b/i.test(
        t,
      ),
    );
    if (
      !reward ||
      !requirement ||
      /\?{2,}|\b(?:TBD|coming soon)\b/i.test(requirement)
    )
      continue;
    const title = section.title.split(": ").at(-1);
    const points =
      Number(reward.match(/\b(10|25|50|100)\s+feat points/i)?.[1]) || null;
    const extra = section.items
      .filter((t) => t !== requirement && t !== reward && t !== title)
      .map((t) => "Source guidance: " + t);
    if (legacy)
      extra.unshift(
        "Historical source listing: check the current in-game category and requirements.",
      );
    records.push({
      id: createHash("sha256")
        .update(source + "|" + title + "|" + requirement)
        .digest("hex")
        .slice(0, 16),
      title,
      requirement,
      reward: reward.replace(/^Reward:\s*/, ""),
      points,
      context: section.title + (legacy ? " (old)" : ""),
      source,
      extra,
      links: section.references || [],
      detailSources: [],
      sourceImages: section.images || [],
    });
  }
  return { records, images: converted.images };
}
