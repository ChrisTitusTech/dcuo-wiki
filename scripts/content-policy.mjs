function text(value) {
  return typeof value === "string" && value.trim().length > 0;
}
function https(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password;
  } catch {
    return false;
  }
}
export function issuesFor(a) {
  const errors = [];
  if (!/^[A-Za-z0-9_-]+$/.test(a.slug || ""))
    errors.push("unsafe or missing slug");
  if (a.reviewed !== true) errors.push("editorial review required");
  for (const key of ["title", "summary", "category", "retrieved", "license"])
    if (!text(a[key])) errors.push(`missing ${key}`);
  for (const key of ["source", "history"])
    if (
      !https(a[key]) ||
      new URL(a[key]).hostname !== "dcuniverseonline.fandom.com"
    )
      errors.push(`invalid ${key}`);
  const sections = Array.isArray(a.sections) ? a.sections : [];
  for (const section of sections) {
    if (
      !text(section.title) ||
      !Array.isArray(section.items) ||
      section.items.some((i) => !text(i))
    )
      errors.push("invalid section");
    for (const field of ["images", "references"]) {
      if (
        section[field] !== undefined &&
        (!Array.isArray(section[field]) ||
          section[field].some((r) => !text(r.label) || !https(r.url)))
      )
        errors.push(`invalid section ${field}`);
    }
    if (section.table) {
      const t = section.table;
      if (
        !text(t.caption) ||
        !Array.isArray(t.columns) ||
        !t.columns.length ||
        t.columns.some((c) => !text(c)) ||
        !Array.isArray(t.rows) ||
        !t.rows.length ||
        t.rows.some(
          (r) =>
            !Array.isArray(r) ||
            r.length !== t.columns.length ||
            r.some((c) => !text(c)),
        )
      )
        errors.push("invalid table");
    }
  }
  const body = sections
    .flatMap((s) => [
      ...(Array.isArray(s.items) ? s.items : []),
      ...(Array.isArray(s.table?.rows) ? s.table.rows.flat() : []),
    ])
    .join(" ");
  if (body.trim().split(/\s+/).length < 40)
    errors.push("insufficient substantive content");
  if (/\b(TODO|TBD|coming soon)\b/i.test(body))
    errors.push("placeholder content");
  if (a.location) {
    if (
      !text(a.location.label) ||
      !text(a.location.precision) ||
      !https(a.location.source)
    )
      errors.push("location source required");
    if (
      !Array.isArray(a.location.maps) ||
      a.location.maps.some((m) => !text(m.label) || !https(m.url))
    )
      errors.push("invalid map reference");
  }
  if (a.category === "Quests") {
    if (!a.location?.label && !text(a.locationLimitation))
      errors.push("location evidence or researched limitation required");
    if (!text(a.videoReview?.checked) || !text(a.videoReview?.query))
      errors.push("YouTube research required");
  }
  for (const v of a.videos || []) {
    if (
      !text(v.title) ||
      !text(v.evidence) ||
      !/^https:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]{11}$/.test(v.url) ||
      (v.startSeconds !== undefined &&
        (!Number.isInteger(v.startSeconds) || v.startSeconds < 0))
    )
      errors.push("unverified video");
  }
  if (a.videos?.length && a.videoReview?.status !== "verified-match")
    errors.push("video status must agree with verified matches");
  return errors;
}
