// Resumable Firecrawl retrieval of hidden wiki template item IDs; no publication.
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { parseEnv } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { parseRevisionBatch, sourceTitle } from "./census-item-source.mjs";
import { catalogFetch } from "./catalog-network.mjs";
const report = JSON.parse(
  await fs.readFile("data/migration/catalog.json", "utf8"),
);
const titles = [
  ...new Set(
    report.records
      .filter(
        (r) =>
          r.category === "Equipment" ||
          r.type === "Allies" ||
          r.slug === "Amulet_of_Rao",
      )
      .filter((r) => r.captureFile)
      .map((r) => sourceTitle(r.canonical || r.url)),
  ),
].sort();
let batches = [];
for (let i = 0; i < titles.length; i += 50) {
  const group = titles.slice(i, i + 50);
  const url = new URL("https://dcuniverseonline.fandom.com/api.php");
  for (const [key, value] of Object.entries({
    action: "query",
    prop: "revisions",
    rvprop: "ids|timestamp|content",
    rvslots: "main",
    redirects: "1",
    titles: group.join("|"),
    format: "json",
    formatversion: "2",
  }))
    url.searchParams.set(key, value);
  const digest = createHash("sha256").update(url.href).digest("hex");
  batches.push({
    url: url.href,
    titles: group,
    file: `.import-cache/census-items/${digest}.json`,
  });
}
const splitFile = ".import-cache/census-items/split-plan.json";
const splits = await fs
  .readFile(splitFile, "utf8")
  .then(JSON.parse)
  .catch((e) => {
    if (e.code !== "ENOENT") throw e;
    return {};
  });
const expand = (batch) => {
  if (!splits[batch.url]) return [batch];
  if (
    splits[batch.url].some(
      (child) => child.titles.length >= batch.titles.length,
    )
  )
    throw new Error("Invalid revision batch split");
  return splits[batch.url].flatMap(expand);
};
batches = batches.flatMap(expand);
await fs.mkdir(".import-cache/census-items", { recursive: true });
await fs.writeFile(
  ".import-cache/census-items/plan.json",
  JSON.stringify(batches, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    titles: titles.length,
    batches: batches.length,
    dryRun: !process.argv.includes("--download"),
  }),
);
if (!process.argv.includes("--download")) process.exit(0);
const env = parseEnv(await fs.readFile(".env", "utf8").catch(() => ""));
const key =
  process.env.FIRECRAWL_API_KEY ||
  process.env.FIRECRAWL_KEY ||
  env.FIRECRAWL_API_KEY ||
  env.FIRECRAWL_KEY ||
  env.firecrawl_key;
if (!key) throw new Error("Firecrawl key is not configured");

const save = async (file, data) => {
  await fs.writeFile(file + ".tmp", JSON.stringify(data));
  await fs.rename(file + ".tmp", file);
};
const pending = [];
for (const batch of batches) {
  try {
    parseRevisionBatch(
      JSON.parse(await fs.readFile(batch.file, "utf8")).capture,
    );
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    pending.push(batch);
  }
}
if (!pending.length) {
  console.log("All raw template batches are cached");
  process.exit(0);
}
const request = async (url, body) => {
  const parsed = new URL(url);
  if (
    parsed.origin !== "https://api.firecrawl.dev" ||
    !parsed.pathname.startsWith("/v2/batch/scrape") ||
    parsed.username ||
    parsed.password
  )
    throw new Error("Unexpected batch URL");
  await delay(7000);
  const response = await catalogFetch(parsed, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${key.trim()}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(
      `Firecrawl HTTP ${response.status}: ${String(error.error || "").replace(/fc-[a-zA-Z0-9-]+/g, "[redacted]")}`,
    );
  }
  return response.json();
};
const jobFile = ".import-cache/census-items/job.json";
let job = await fs
  .readFile(jobFile, "utf8")
  .then(JSON.parse)
  .catch((e) => {
    if (e.code !== "ENOENT") throw e;
    return null;
  });
if (
  !job ||
  (["completed", "failed", "cancelled"].includes(job.status) && !job.next)
) {
  const result = await request("https://api.firecrawl.dev/v2/batch/scrape", {
    urls: pending.map((b) => b.url),
    formats: ["rawHtml", "markdown"],
    onlyMainContent: false,
    maxConcurrency: 5,
  });
  if (!result.success || !result.id)
    throw new Error("Batch submission did not return an ID");
  job = {
    id: result.id,
    status: "scraping",
    targets: pending,
    saved: [],
    submitted: new Date().toISOString(),
  };
  await save(jobFile, job);
}
const expected = new Map(job.targets.map((b) => [b.url, b])),
  saved = new Set(job.saved || []);
let next = job.next || "https://api.firecrawl.dev/v2/batch/scrape/" + job.id;
while (next) {
  const result = await request(next);
  if (!["scraping", "completed", "failed", "cancelled"].includes(result.status))
    throw new Error("Unexpected batch state");
  for (const capture of result.data || []) {
    const source = capture.metadata?.sourceURL || capture.metadata?.url,
      batch = expected.get(source);
    if (!batch) throw new Error("Unexpected source returned by Firecrawl");
    if (saved.has(source)) continue;
    if (capture.metadata?.statusCode !== 200)
      throw new Error("Source revision batch unavailable");
    try {
      parseRevisionBatch(capture);
    } catch {
      if (batch.titles.length === 1)
        throw new Error("Source revision unavailable for " + batch.titles[0]);
      splits[batch.url] = [];
      for (
        let i = 0;
        i < batch.titles.length;
        i += Math.ceil(batch.titles.length / 2)
      ) {
        const titles = batch.titles.slice(
          i,
          i + Math.ceil(batch.titles.length / 2),
        );
        const url = new URL(batch.url);
        url.searchParams.set("titles", titles.join("|"));
        url.searchParams.set("rvsection", "0");
        const digest = createHash("sha256").update(url.href).digest("hex");
        splits[batch.url].push({
          url: url.href,
          titles,
          file: `.import-cache/census-items/${digest}.json`,
        });
      }
      await save(splitFile, splits);
      saved.add(source);
      continue;
    }
    await save(batch.file, {
      url: batch.url,
      titles: batch.titles,
      retrieved: new Date().toISOString(),
      capture,
    });
    saved.add(source);
  }
  next = result.next || (result.status === "scraping" ? next : null);
  Object.assign(job, {
    status: result.status,
    next,
    saved: [...saved],
    completed: result.completed,
    total: result.total,
    updated: new Date().toISOString(),
  });
  await save(jobFile, job);
  console.log(
    JSON.stringify({
      status: job.status,
      completed: job.completed,
      saved: saved.size,
      total: job.total,
      cached: batches.length - pending.length,
    }),
  );
  if (next && !result.next) await delay(30000);
}
if (saved.size !== job.targets.length)
  throw new Error("Source batch omitted pages; rerun to retry missing batches");
