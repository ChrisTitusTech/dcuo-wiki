// Queue only missing mission captures, then retrieve every result page locally.
import { readFile, writeFile, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parseEnv } from "node:util";
import { classifyURL } from "./wiki-urls.mjs";
import { reusableCache } from "./import-plan.mjs";
const env = parseEnv(await readFile(".env", "utf8"));
const key =
  process.env.FIRECRAWL_API_KEY ||
  env.FIRECRAWL_API_KEY ||
  env.FIRECRAWL_KEY ||
  env.firecrawl_key;
if (!key) throw new Error("Missing Firecrawl key");
const manifest = JSON.parse(
  await readFile("data/mission-downloads.json", "utf8"),
);
const hash = (s) => createHash("sha256").update(s).digest("hex");
const fileFor = (url) => `.import-cache/${hash(url)}.json`;
const jobFile = ".import-cache/mission-batch-job.json";
async function save(path, data) {
  await writeFile(path + ".tmp", JSON.stringify(data, null, 2) + "\n");
  await rename(path + ".tmp", path);
}
async function request(url, body) {
  const u = new URL(url);
  if (
    u.origin !== "https://api.firecrawl.dev" ||
    !u.pathname.startsWith("/v2/batch/scrape") ||
    u.username ||
    u.password
  )
    throw new Error("Unexpected batch API URL");
  const response = await fetch(u, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) {
    const info = await response.json().catch(() => ({}));
    throw new Error(
      `Batch API HTTP ${response.status}: ${String(info.error || "").replace(/fc-[a-zA-Z0-9-]+/g, "[redacted]")}`,
    );
  }
  return response.json();
}
let job;
try {
  job = JSON.parse(await readFile(jobFile, "utf8"));
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
if (!job) {
  const urls = [];
  for (const r of manifest.records) {
    let cached;
    try {
      cached = JSON.parse(await readFile(fileFor(r.url), "utf8"));
    } catch (e) {
      if (e.code !== "ENOENT" && !(e instanceof SyntaxError)) throw e;
    }
    if (!reusableCache(cached, r.url)) urls.push(r.url);
  }
  if (!urls.length) {
    console.log("All mission captures already exist");
    process.exit(0);
  }
  const response = await request("https://api.firecrawl.dev/v2/batch/scrape", {
    urls,
    maxConcurrency: 5,
    formats: ["markdown", "html", "links"],
    includeTags: [".mw-parser-output"],
    onlyMainContent: true,
  });
  if (!response.success || !response.id)
    throw new Error("Batch submission did not return a job ID");
  job = { id: response.id, urls, submittedAt: new Date().toISOString() };
  await save(jobFile, job);
  console.log(`Queued ${urls.length} missing mission pages`);
}
const expected = new Set(job.urls);
const savedUrls = new Set(job.savedUrls || []);
let next = job.next || `https://api.firecrawl.dev/v2/batch/scrape/${job.id}`;
let status;
while (next) {
  const response = await request(next);
  status = response.status;
  if (!["scraping", "completed", "failed", "cancelled"].includes(status))
    throw new Error(`Unexpected batch status: ${status}`);
  for (const data of response.data || []) {
    const url = classifyURL(data.metadata?.sourceURL || data.metadata?.url).url;
    if (!expected.has(url))
      throw new Error("Result does not match requested mission URL");
    if (!data.markdown?.trim() || data.metadata?.statusCode !== 200) continue;
    if (!savedUrls.has(url)) {
      await save(fileFor(url), {
        ...data,
        url,
        retrieved: new Date().toISOString(),
        status: "needs-review",
      });
      savedUrls.add(url);
    }
  }
  const continuation = response.next || (status === "scraping" ? next : null);
  Object.assign(job, {
    status,
    saved: savedUrls.size,
    savedUrls: [...savedUrls],
    next: continuation,
    retrievedAt: new Date().toISOString(),
  });
  await save(jobFile, job);
  console.log(
    JSON.stringify({
      status,
      completed: response.completed,
      total: response.total,
      saved: savedUrls.size,
    }),
  );
  next = continuation;
  if (status === "scraping") await new Promise((r) => setTimeout(r, 15000));
}
if (savedUrls.size !== expected.size)
  throw new Error(
    `Retrieved ${savedUrls.size}/${expected.size}; rerun the individual downloader for missing pages`,
  );
