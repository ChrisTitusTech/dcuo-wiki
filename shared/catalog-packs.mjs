// Line-addressable source records keep editor assets below the file allowance.
export function catalogPackPath(slug) {
  if (!/^[A-Za-z0-9_-]+$/.test(slug)) throw Error("Invalid article slug");
  let hash = 2166136261;
  for (const char of slug)
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (
    "/_catalog/" + ((hash >>> 0) % 256).toString(16).padStart(2, "0") + ".txt"
  );
}
export function packLine(slug, kind, payload) {
  catalogPackPath(slug);
  if (!["article", "editor", "media", "html"].includes(kind))
    throw Error("Invalid catalog record type");
  return slug + "\t" + kind + "\t" + JSON.stringify(payload) + "\n";
}
export function packedValue(pack, slug, kind) {
  catalogPackPath(slug);
  const marker = slug + "\t" + kind + "\t";
  const index = pack.startsWith(marker) ? 0 : pack.indexOf("\n" + marker) + 1;
  if (index === 0 && !pack.startsWith(marker)) return null;
  const start = index + marker.length;
  const end = pack.indexOf("\n", start);
  if (end < 0) throw Error("Truncated catalog pack");
  return pack.slice(start, end);
}
