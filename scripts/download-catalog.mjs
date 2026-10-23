// Resumable Firecrawl batches. Captures are staged; publication requires review.
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { parseEnv } from "node:util";
import { acquireCatalogLock } from "./catalog-lock.mjs";
import { catalogFetch } from "./catalog-network.mjs";
import { catalogPlan } from "./catalog-plan.mjs";
import { classifyURL } from "./wiki-urls.mjs";
import {
  reusableCatalogCapture,
  resumableCatalogJob,
  omittedCatalogCaptures,
} from "./catalog-cache.mjs";
const write = process.argv.includes("--write");
const background = process.argv.includes("--background-progress");
const manifestFile = background
  ? ".import-cache/catalog/download-progress.json"
  : "data/catalog-downloads.json";
if (write && !background) {
  try {
    await fs.access(".import-cache/catalog/download-all.lock");
    throw Error(
      "Stop the background download before starting a foreground batch.",
    );
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
}
const limitIndex = process.argv.indexOf("--limit");
const limit = limitIndex < 0 ? 100 : Number(process.argv[limitIndex + 1]);
if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
  throw Error("Use --limit between 1 and 1000");
const articles = JSON.parse(
  await fs.readFile("src/data/articles.json", "utf8"),
);
const inventory = JSON.parse(await fs.readFile("data/inventory.json", "utf8"));
const targets = catalogPlan(articles, inventory);
await fs.mkdir(".import-cache/catalog", { recursive: true });
if (write) {
  const release = acquireCatalogLock(
    ".import-cache/catalog/download-writer.lock",
  );
  process.once("exit", release);
  process.once("SIGTERM", () => process.exit(143));
  process.once("SIGINT", () => process.exit(130));
}
let manifest = {
  schemaVersion: 1,
  scope:
    "Complete remaining main-namespace content, with category foundations and existing guide links first",
  records: [],
};
try {
  manifest = JSON.parse(await fs.readFile(manifestFile, "utf8"));
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const hash = (s) => createHash("sha256").update(s).digest("hex");
const fileFor = (url) => ".import-cache/" + hash(url) + ".json";
const canonical = (url) => classifyURL(url).url;
const save = async (path, data) => {
  await fs.writeFile(path + ".tmp", JSON.stringify(data, null, 2) + "\n");
  await fs.rename(path + ".tmp", path);
};
const rows = new Map(manifest.records.map((r) => [r.url, r]));
const pending = [];
for (const t of targets) {
  const prior = rows.get(t.url);
  if (prior?.status === "missing" || (background && prior?.status === "failed"))
    continue;
  let cached;
  try {
    cached = JSON.parse(await fs.readFile(fileFor(t.url), "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT" && !(e instanceof SyntaxError)) throw e;
  }
  if (reusableCatalogCapture(cached, t.url, prior?.sha256)) {
    rows.set(t.url, {
      ...t,
      status: "downloaded",
      cacheFile: fileFor(t.url),
      retrieved: cached.retrieved,
      sha256: hash(cached.html),
    });
  } else {
    if (prior?.status === "downloaded") rows.delete(t.url);
    if (pending.length < limit) pending.push(t);
  }
}
manifest.records = [...rows.values()];
manifest.totalTargets = targets.length;
manifest.updated = new Date().toISOString();
console.log(
  JSON.stringify({
    targets: targets.length,
    reused: rows.size,
    queued: pending.length,
    first: pending.slice(0, 8).map((r) => r.title),
  }),
);
if (!write) process.exit(0);
await save(manifestFile, manifest);
let env = {};
try {
  env = parseEnv(await fs.readFile(".env", "utf8"));
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const key =
  process.env.FIRECRAWL_API_KEY ||
  process.env.FIRECRAWL_KEY ||
  env.FIRECRAWL_API_KEY ||
  env.FIRECRAWL_KEY ||
  env.firecrawl_key;
if (!key) throw Error("Missing Firecrawl key");
const request = async (url, body) => {
  const u = new URL(url);
  if (
    u.origin !== "https://api.firecrawl.dev" ||
    !u.pathname.startsWith("/v2/batch/scrape") ||
    u.username ||
    u.password
  )
    throw Error("Unexpected batch API URL");
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await catalogFetch(u, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: "Bearer " + key,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if ((response.status === 429 || response.status >= 500) && attempt < 3) {
      await new Promise((r) => setTimeout(r, 15000));
      continue;
    }
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw Error(
        "Firecrawl batch HTTP " +
          response.status +
          ": " +
          String(error.error || "").replace(/fc-[a-zA-Z0-9-]+/g, "[redacted]"),
      );
    }
    return response.json();
  }
};
const jobFile = background
  ? ".import-cache/catalog/background-job.json"
  : ".import-cache/catalog/active-job.json";
let job;
try {
  job = JSON.parse(await fs.readFile(jobFile, "utf8"));
  if (!resumableCatalogJob(job)) job = null;
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
if (!job) {
  if (!pending.length) {
    console.log("No missing captures in this batch");
    process.exit(0);
  }
  const response = await request("https://api.firecrawl.dev/v2/batch/scrape", {
    urls: pending.map((r) => r.url),
    maxConcurrency: 5,
    formats: ["markdown", "html", "links"],
    includeTags: [".mw-parser-output", ".portable-infobox"],
    onlyMainContent: true,
  });
  if (!response.success || !response.id)
    throw Error("Batch did not return a job ID");
  job = {
    id: response.id,
    submitted: new Date().toISOString(),
    targets: pending,
    status: "scraping",
    saved: [],
  };
  await save(jobFile, job);
}
const expected = new Map(job.targets.map((r) => [r.url, r]));
const saved = new Set(job.saved || []);
let next = job.next || "https://api.firecrawl.dev/v2/batch/scrape/" + job.id;
while (next) {
  const response = await request(next);
  if (
    !["scraping", "completed", "failed", "cancelled"].includes(response.status)
  )
    throw Error("Unexpected batch status");
  for (const data of response.data || []) {
    const url = canonical(data.metadata?.sourceURL || data.metadata?.url);
    if (!expected.has(url)) throw Error("Unexpected source in batch");
    if (saved.has(url)) continue;
    const row = {
      ...expected.get(url),
      retrieved: new Date().toISOString(),
      sourceStatus: data.metadata?.statusCode,
    };
    if (
      data.metadata?.statusCode === 200 &&
      data.markdown?.trim() &&
      data.html
    ) {
      const capture = {
        ...data,
        url,
        retrieved: row.retrieved,
        status: "needs-review",
      };
      await save(fileFor(url), capture);
      Object.assign(row, {
        status: "downloaded",
        cacheFile: fileFor(url),
        sha256: hash(data.html),
      });
    } else
      Object.assign(row, {
        status: data.metadata?.statusCode === 404 ? "missing" : "failed",
        error: "No successful substantive capture",
      });
    rows.set(url, row);
    saved.add(url);
  }
  next = response.next || (response.status === "scraping" ? next : null);
  Object.assign(job, {
    status: response.status,
    next,
    saved: [...saved],
    completed: response.completed,
    total: response.total,
    updated: new Date().toISOString(),
  });
  // Failure holds must reach disk before the terminal (non-resumable) job
  // checkpoint. If this save fails, the previous job remains resumable.
  if (!next && job.status !== "scraping") {
    for (const row of omittedCatalogCaptures(
      job.targets,
      saved,
      new Date().toISOString(),
    ))
      rows.set(row.url, row);
  }
  manifest.records = [...rows.values()].sort(
    (a, b) => a.priority - b.priority || a.title.localeCompare(b.title),
  );
  manifest.updated = new Date().toISOString();
  await save(manifestFile, manifest);
  await save(jobFile, job);
  console.log(
    JSON.stringify({
      status: job.status,
      completed: response.completed,
      total: response.total,
      saved: saved.size,
      downloaded: manifest.records.filter((r) => r.status === "downloaded")
        .length,
    }),
  );
  if (job.status === "scraping") await new Promise((r) => setTimeout(r, 15000));
}
if (saved.size !== expected.size) {
  throw Error(
    `Captured ${saved.size}/${expected.size}; failed or missing batch items require follow-up`,
  );
}
if (job.status !== "completed")
  throw Error("Firecrawl batch ended with status " + job.status);
