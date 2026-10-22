import { createHash } from "node:crypto";
import { classifyURL } from "./wiki-urls.mjs";
export function reusableCatalogCapture(cached, url, expectedHash) {
  return Boolean(
    cached?.markdown?.trim() &&
    cached.html &&
    cached.metadata?.statusCode === 200 &&
    classifyURL(cached.url || cached.metadata.sourceURL || cached.metadata.url)
      .url === url &&
    (!expectedHash ||
      createHash("sha256").update(cached.html).digest("hex") === expectedHash),
  );
}
export function resumableCatalogJob(job) {
  return Boolean(
    job &&
    (job.status === "scraping" || (job.status === "completed" && job.next)),
  );
}

export function omittedCatalogCaptures(targets, saved, retrieved) {
  const received = new Set(saved);
  return targets
    .filter((t) => !received.has(t.url))
    .map((t) => ({
      ...t,
      status: "failed",
      retrieved,
      error: "Source omitted from terminal batch response; held for review",
    }));
}
export function catalogProgress(manifest) {
  return {
    downloaded: manifest.records.filter((r) => r.status === "downloaded")
      .length,
    failedCaptures: manifest.records.filter((r) => r.status === "failed")
      .length,
  };
}
