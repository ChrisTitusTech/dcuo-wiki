export function issuesFor(a) {
  const errors = [];
  if (!/^[A-Za-z0-9_-]+$/.test(a.slug || ""))
    errors.push("unsafe or missing slug");
  if (!a.reviewed) errors.push("editorial review required");
  for (const key of ["title", "summary", "category", "retrieved", "license"])
    if (!a[key]?.trim()) errors.push(`missing ${key}`);
  for (const key of ["source", "history"]) {
    try {
      const u = new URL(a[key]);
      if (
        u.protocol !== "https:" ||
        u.hostname !== "dcuniverseonline.fandom.com"
      )
        throw Error();
    } catch {
      errors.push(`invalid ${key}`);
    }
  }
  const text = (a.sections || []).flatMap((s) => s.items || []).join(" ");
  if (text.split(/\s+/).length < 40)
    errors.push("insufficient substantive content");
  if (/\b(TODO|TBD|coming soon)\b/i.test(text))
    errors.push("placeholder content");
  if (a.category === "Quests") {
    if (!a.location?.label && !a.locationLimitation)
      errors.push("location evidence or researched limitation required");
    if (a.location && !a.location.source?.startsWith("https://"))
      errors.push("location source required");
    if (!a.videoReview?.checked || !a.videoReview?.query)
      errors.push("YouTube research required");
    for (const v of a.videos || [])
      if (
        !v.evidence ||
        !/^https:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]+$/.test(v.url)
      )
        errors.push("unverified video");
  }
  return errors;
}
