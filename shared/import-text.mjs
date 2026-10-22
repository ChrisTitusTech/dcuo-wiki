// Imported prose is plain text. Remove Markdown escapes and line-break debris,
// but leave URLs, meaningful zero values and ordinary sentences untouched.
export function cleanImportText(value) {
  return value
    .replace(/\\([\\`*_{}\[\]()#+\-.!>|])/g, "$1")
    .replace(/\\+\s*$/g, "")
    .trim();
}
export function missingImportText(value) {
  const text = cleanImportText(value).replace(/^\d+[.)]\s*/, "");
  return (
    !text ||
    /^[\[\]{}|_*?>:;.\s-]+$/.test(text) ||
    /^(?:[^:\n]{1,100}:\s*)?(?:n\/?a|none|unknown|not (?:specified|stated|available|known|provided|applicable)|tba|tbd|\?+)(?: Points)?[.!\s]*$/i.test(
      text,
    )
  );
}
export function cleanImportItems(items) {
  return items.map(cleanImportText).filter((t) => !missingImportText(t));
}
// Keep section positions intact: section-N is the key used by live revisions.
// Empty sections stay in the source data but are omitted from the page/editor.
export function cleanImportedArticle(article) {
  const a = structuredClone(article);
  a.summary = cleanImportText(a.summary);
  for (const s of a.sections) {
    s.title = cleanImportText(s.title);
    s.items = cleanImportItems(s.items);
    for (const field of ["images", "references"])
      for (const r of s[field] || []) r.label = cleanImportText(r.label);
    if (s.table) {
      s.table.caption = cleanImportText(s.table.caption);
      s.table.columns = s.table.columns.map(cleanImportText);
      s.table.rows = s.table.rows.map((row) =>
        row.map((cell) =>
          missingImportText(cell) ? "" : cleanImportText(cell),
        ),
      );
    }
  }
  if (a.location) {
    a.location.label = cleanImportText(a.location.label);
    a.location.precision = cleanImportText(a.location.precision);
    for (const r of a.location.maps) r.label = cleanImportText(r.label);
  }
  return a;
}
export function sectionHasContent(section) {
  return Boolean(
    section.items.some((t) => !missingImportText(t)) ||
    section.images?.length ||
    section.references?.length ||
    section.table?.rows.some((row) => row.some((t) => !missingImportText(t))),
  );
}

// Currency restoration is keyed to exact imported text. Rebase only when the
// difference consists entirely of the same mechanical cleanup; preserve labels.
export function cleanRewardContexts(context, articles) {
  const result = structuredClone(context);
  const bySlug = new Map(articles.map((a) => [a.slug, a]));
  for (const [slug, parts] of Object.entries(result)) {
    const article = bySlug.get(slug);
    if (!article) continue;
    for (const [id, entry] of Object.entries(parts)) {
      const section = article.sections[Number(id.split("-")[1])];
      if (!section) continue;
      let base, prior;
      if (id.startsWith("table-") && section.table) {
        base = section.table.rows.map((r) => r.join(" | ")).join("\n");
        prior = entry.base
          .split("\n")
          .map((r) =>
            r
              .split(/\s*\|\s*/)
              .map(cleanImportCell)
              .join(" | "),
          )
          .join("\n");
      } else if (id.startsWith("section-")) {
        base = section.items.map((t) => "- " + t).join("\n");
        prior = cleanImportItems(
          entry.base.split("\n").map((t) => t.replace(/^[-*]\s*/, "")),
        )
          .map((t) => "- " + t)
          .join("\n");
      }
      if (base === undefined || prior !== base) continue;
      entry.base = base;
      if (entry.items) entry.items = cleanImportItems(entry.items);
      if (entry.rows)
        entry.rows = entry.rows.map((row) => row.map(cleanImportCell));
    }
  }
  return result;
}
export const cleanImportCell = (value) =>
  missingImportText(value) ? "" : cleanImportText(value);

// Empty cells carry no claim. Keep useful rows, and omit columns with no values.
export function filledTable(columns, rows) {
  const cleaned = rows.map((row) => row.map(cleanImportCell));
  const indices = columns
    .map((_, i) => i)
    .filter((i) => cleaned.some((row) => row[i]));
  return {
    columns: indices.map((i) => columns[i]),
    rows: cleaned
      .filter((row) => row.some(Boolean))
      .map((row) => indices.map((i) => row[i])),
  };
}
