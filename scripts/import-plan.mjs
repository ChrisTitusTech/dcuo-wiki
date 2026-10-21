import { classifyURL } from "./wiki-urls.mjs";

export function importPlan(args, inventory) {
  const refresh = args.includes("--refresh");
  const dryRun = args.includes("--dry-run");
  const tokens = args.filter((a) => a !== "--refresh" && a !== "--dry-run");
  let urls, limit;
  if (tokens[0] === "--inventory") {
    if (tokens.length !== 2 || !/^[1-9]\d*$/.test(tokens[1]))
      throw new Error("Use --inventory <1-100> for a bounded batch.");
    limit = Number(tokens[1]);
    if (limit > 100) throw new Error("Batch limit must be between 1 and 100.");
    if (refresh)
      throw new Error(
        "Refresh requires explicit URLs, not an inventory batch.",
      );
    if (!Array.isArray(inventory?.entries))
      throw new Error("Invalid inventory.");
    urls = inventory.entries
      .filter((e) => e.kind === "article" && e.status === "unreviewed")
      .map((e) => e.url);
  } else {
    if (!tokens.length || tokens.some((a) => a.startsWith("--")))
      throw new Error(
        "Usage: npm run import -- [--refresh] [--dry-run] <URLs> OR --inventory <1-100>",
      );
    urls = tokens;
    limit = Infinity;
  }
  const entries = urls.map(classifyURL);
  if (entries.some((e) => e.kind !== "article"))
    throw new Error(
      "Import only gameplay articles; use discovery for supporting pages.",
    );
  return {
    urls: [...new Set(entries.map((e) => e.url))],
    limit,
    refresh,
    dryRun,
  };
}

export function reusableCache(cached, url) {
  return (
    cached?.url === url &&
    cached.status === "needs-review" &&
    typeof cached.markdown === "string" &&
    Boolean(cached.markdown.trim()) &&
    (cached.metadata?.statusCode === undefined ||
      cached.metadata.statusCode === 200)
  );
}
