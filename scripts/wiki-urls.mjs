export const origin = "https://dcuniverseonline.fandom.com";
const excludedNamespaces =
  /^(?:Special|User(?: talk)?|Talk|Forum|Blog|Message Wall(?: Greeting)?|MediaWiki(?: talk)?|Template talk|Category talk|File talk|Help talk|DC Universe Online(?: Wiki)?(?: talk)?):/i;
export function classifyURL(raw) {
  let u, title;
  try {
    u = new URL(raw, origin);
    if (
      u.origin !== origin ||
      u.username ||
      u.password ||
      !u.pathname.startsWith("/wiki/")
    )
      return { kind: "excluded", reason: "outside article scope" };
    title = decodeURIComponent(u.pathname.slice(6))
      .normalize("NFC")
      .replace(/[ _]+/g, "_")
      .trim();
    if (!title || /[\u0000-\u001f\u007f]/.test(title)) throw Error();
  } catch {
    return { kind: "excluded", reason: "invalid URL" };
  }
  const url =
    origin +
    "/wiki/" +
    title
      .split("/")
      .map((s) => encodeURIComponent(s))
      .join("/");
  if (excludedNamespaces.test(title.replaceAll("_", " ")))
    return { kind: "excluded", reason: "non-gameplay namespace", url, title };
  if (/^(?:Category|File|Template|Help):/i.test(title))
    return { kind: "support", url, title };
  return { kind: "article", url, title };
}
export function nextPage(markdown) {
  const match = markdown.match(/\[Next page[^\]]*\]\((https:\/\/[^\s"]+)/);
  if (!match) return null;
  const raw = match[1].replace(/\)$/, "");
  const url = new URL(raw);
  if (
    url.origin !== origin ||
    url.pathname !== "/wiki/Special:AllPages" ||
    !url.searchParams.has("from") ||
    url.username ||
    url.password
  )
    throw new Error("Unexpected discovery continuation");
  return url.href;
}
export function buildInventory(pages, articles) {
  const records = new Map(),
    exclusions = new Map();
  let observations = 0;
  const published = new Map();
  for (const article of articles)
    if (!published.has(classifyURL(article.source).url))
      published.set(classifyURL(article.source).url, article.slug);
  for (const page of pages)
    for (const raw of page.links || []) {
      const entry = classifyURL(typeof raw === "string" ? raw : raw.url);
      if (entry.kind === "excluded") {
        const key = String(raw);
        exclusions.set(key, { url: key, reason: entry.reason });
        continue;
      }
      observations++;
      if (!records.has(entry.url))
        records.set(entry.url, {
          ...entry,
          status: published.has(entry.url) ? "published" : "unreviewed",
          ...(published.has(entry.url)
            ? { slug: published.get(entry.url) }
            : {}),
          discoveredOn: [],
        });
      const record = records.get(entry.url);
      if (!record.discoveredOn.includes(page.url))
        record.discoveredOn.push(page.url);
    }
  const discoveredUnique = records.size;
  // Published sources are part of the inventory even when not linked from the sampled index range.
  for (const a of articles) {
    const entry = classifyURL(a.source);
    if (!records.has(entry.url))
      records.set(entry.url, {
        ...entry,
        status: "published",
        slug: a.slug,
        discoveredOn: [a.source],
      });
  }
  const allPages = pages.filter((p) => p.kind === "all-pages");
  const visited = new Set();
  let cursor = origin + "/wiki/Special:AllPages";
  while (cursor && !visited.has(cursor)) {
    const page = allPages.find((p) => p.url === cursor);
    if (!page) break;
    visited.add(cursor);
    cursor = page.nextUrl;
  }
  const entries = [...records.values()].sort((a, b) =>
    a.url.localeCompare(b.url),
  );
  return {
    schemaVersion: 1,
    exhaustive: cursor === null && visited.size > 0,
    nextPage: cursor,
    summary: {
      discoveryPages: pages.length,
      allPagesBatches: visited.size,
      articleCandidates: entries.filter((e) => e.kind === "article").length,
      supportPages: entries.filter((e) => e.kind === "support").length,
      published: entries.filter((e) => e.status === "published").length,
      duplicateObservations: observations - discoveredUnique,
      excludedLinks: exclusions.size,
    },
    entries,
    excluded: [...exclusions.values()],
  };
}
