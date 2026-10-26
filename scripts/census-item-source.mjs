// Read exact identifiers from source templates. Never infer them from names or stats.
export const sourceTitle = (url) =>
  decodeURIComponent(new URL(url).pathname.slice(6)).replaceAll("_", " ");
export const titleKey = (title) => title.replaceAll("_", " ").normalize("NFC");
export function parseRevisionBatch(capture) {
  const raw =
    capture.rawHtml?.trim() ||
    capture.markdown
      ?.replace(/^```(?:json)?\s*\n?/, "")
      .replace(/\n?```\s*$/, "")
      .trim();
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("Truncated or invalid wiki revision JSON");
  }
  if (data.error || !Array.isArray(data.query?.pages))
    throw new Error("Invalid wiki revision batch");
  return data;
}
export function itemIds(wikitext) {
  return [
    ...new Set(
      itemTemplates(wikitext)
        .map((fields) => fields.itemid)
        .filter(
          (value) => typeof value === "string" && /^[1-9]\d{0,29}$/.test(value),
        ),
    ),
  ];
}
export function revisionPages(data) {
  const result = new Map();
  const pages = new Map(
    data.query.pages
      .filter(
        (p) =>
          !p.missing &&
          !p.invalid &&
          p.ns === 0 &&
          typeof p.revisions?.[0]?.slots?.main?.content === "string",
      )
      .map((p) => [titleKey(p.title), p]),
  );
  const aliases = new Map(
    [...(data.query.normalized || []), ...(data.query.redirects || [])].map(
      (r) => [titleKey(r.from), titleKey(r.to)],
    ),
  );
  for (const title of [...pages.keys(), ...aliases.keys()]) {
    let key = title;
    const seen = new Set();
    while (aliases.has(key) && !seen.has(key)) {
      seen.add(key);
      key = aliases.get(key);
    }
    if (pages.has(key)) result.set(title, pages.get(key));
  }
  return result;
}

export function itemTemplates(wikitext) {
  const text = wikitext
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(
      /<(nowiki|pre|code|syntaxhighlight|source|script|style)\b[^>]*>[\s\S]*?<\/\1>/gi,
      "",
    );
  const templates = [];
  for (const match of text.matchAll(/{{\s*Item(?=\s*\||\s*\n)/gi)) {
    let depth = 0,
      end = match.index;
    for (; end < text.length; end++) {
      if (text[end] === "{") depth++;
      if (text[end] === "}") depth--;
      if (!depth) break;
    }
    if (depth) continue;
    const body = text.slice(match.index + 2, end - 1);
    let curly = 0,
      bracket = 0,
      start = 0;
    const chunks = [];
    for (let i = 0; i < body.length; i++) {
      const ch = body[i];
      if (ch === "{") curly++;
      if (ch === "}") curly--;
      if (ch === "[") bracket++;
      if (ch === "]") bracket--;
      if (ch === "|" && !curly && !bracket) {
        chunks.push(body.slice(start, i));
        start = i + 1;
      }
    }
    chunks.push(body.slice(start));
    const fields = {};
    for (const chunk of chunks.slice(1)) {
      const field = /^\s*([\w -]+)\s*=([\s\S]*)$/.exec(chunk);
      if (field) fields[field[1].trim().toLowerCase()] = field[2].trim();
    }
    templates.push(fields);
  }
  return templates;
}

export function resolveItemIdentities(candidates, overrides = []) {
  const grouped = new Map(),
    rules = new Map(overrides.map((r) => [r.itemId, r]));
  if (rules.size !== overrides.length)
    throw new Error("Duplicate item override");
  for (const row of candidates) {
    const rows = grouped.get(row.itemId) || [];
    rows.push(row);
    grouped.set(row.itemId, rows);
  }
  const resolved = [],
    conflicts = [];
  for (const [itemId, all] of grouped) {
    let rows = all;
    if (new Set(rows.map((r) => r.slug || "unlinked:" + r.title)).size > 1) {
      const rule = rules.get(itemId);
      if (!rule) {
        conflicts.push({ itemId, candidates: rows });
        continue;
      }
      if (
        typeof rule.slug !== "string" ||
        !/^[A-Za-z0-9_-]+$/.test(rule.slug) ||
        typeof rule.reason !== "string" ||
        rule.reason.length < 30 ||
        !all.some((r) => r.slug === rule.slug)
      )
        throw new Error("Unsupported item override: " + itemId);
      rows = all.filter((r) => r.slug === rule.slug);
      conflicts.push({
        itemId,
        candidates: all,
        resolution: rule.slug,
        reason: rule.reason,
      });
    }
    resolved.push({
      itemId,
      slug: rows[0].slug,
      title: rows[0].title,
      sources: rows.map(({ source, evidence, kind }) => ({
        url: source,
        evidence,
        kind,
      })),
    });
  }
  for (const itemId of rules.keys())
    if (!grouped.has(itemId))
      throw new Error("Override has no source candidate: " + itemId);
  return { resolved, conflicts };
}
