// Supplemental item effects, retrieved through Firecrawl without page navigation.
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { parseEnv } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { catalogFetch } from "./catalog-network.mjs";
import { sourceTitle, titleKey } from "./census-item-source.mjs";
const read = async (p) => JSON.parse(await fs.readFile(p, "utf8"));
const rows = (await read("data/migration/catalog.json")).records,
  items = await read("data/census-community-items.json");
const keyTitle = (t) => titleKey(t).toLowerCase();
const targets = [];
for (const name of [
  ...new Set(
    items.filter((i) => i.kind === "Artifacts").map((i) => i.sourceTitle),
  ),
]) {
  const urls = [
    ...new Set(
      rows
        .filter(
          (r) => keyTitle(sourceTitle(r.canonical || r.url)) === keyTitle(name),
        )
        .map((r) => r.canonical || r.url),
    ),
  ];
  if (urls.length !== 1) throw new Error("Ambiguous artifact source: " + name);
  targets.push({
    url: urls[0],
    name,
    file:
      ".import-cache/census-items/infobox-" +
      createHash("sha256").update(urls[0]).digest("hex") +
      ".json",
  });
}
await fs.mkdir(".import-cache/census-items", { recursive: true });
for (const f of (await fs.readdir(".import-cache/census-items")).filter((f) =>
  /^artifact-infobox-\d+\.json$/.test(f),
)) {
  const c = await read(".import-cache/census-items/" + f),
    target = targets.find((t) => t.url === c.url);
  if (target) await fs.writeFile(target.file, JSON.stringify(c));
}
const pending = [];
for (const t of targets) {
  try {
    const data = await read(t.file);
    if (!data.capture?.html?.includes("portable-infobox"))
      throw new Error("Invalid saved infobox");
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
    pending.push(t);
  }
}
console.log(
  JSON.stringify({ artifacts: targets.length, pending: pending.length }),
);
if (!process.argv.includes("--download") || !pending.length) process.exit(0);
const env = parseEnv(await fs.readFile(".env", "utf8").catch(() => "")),
  key =
    process.env.FIRECRAWL_API_KEY ||
    process.env.FIRECRAWL_KEY ||
    env.FIRECRAWL_API_KEY ||
    env.FIRECRAWL_KEY ||
    env.firecrawl_key;
if (!key) throw new Error("Missing Firecrawl key");
const save = async (p, v) => {
  await fs.writeFile(p + ".tmp", JSON.stringify(v));
  await fs.rename(p + ".tmp", p);
};
const request = async (url, body) => {
  const u = new URL(url);
  if (
    u.origin !== "https://api.firecrawl.dev" ||
    !u.pathname.startsWith("/v2/batch/scrape") ||
    u.username ||
    u.password
  )
    throw new Error("Unexpected batch URL");
  await delay(7000);
  const r = await catalogFetch(u, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: "Bearer " + key.trim(),
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!r.ok) throw new Error("Firecrawl HTTP " + r.status);
  return r.json();
};
const jobFile = ".import-cache/census-items/infobox-job.json";
let job = await read(jobFile).catch((e) => {
  if (e.code !== "ENOENT") throw e;
  return null;
});
if (
  !job ||
  (["completed", "failed", "cancelled"].includes(job.status) && !job.next)
) {
  const r = await request("https://api.firecrawl.dev/v2/batch/scrape", {
    urls: pending.map((t) => t.url),
    formats: ["html"],
    includeTags: [".portable-infobox"],
    onlyMainContent: false,
    maxConcurrency: 5,
  });
  if (!r.success || !r.id) throw new Error("No batch ID");
  job = { id: r.id, status: "scraping", targets: pending, saved: [] };
  await save(jobFile, job);
}
const expected = new Map(job.targets.map((t) => [t.url, t])),
  saved = new Set(job.saved || []);
let next = job.next || "https://api.firecrawl.dev/v2/batch/scrape/" + job.id;
while (next) {
  const r = await request(next);
  if (!["scraping", "completed", "failed", "cancelled"].includes(r.status))
    throw new Error("Unexpected batch status");
  for (const capture of r.data || []) {
    const url = capture.metadata?.sourceURL || capture.metadata?.url,
      target = expected.get(url);
    if (!target) throw new Error("Unexpected artifact source");
    if (saved.has(url)) continue;
    if (
      capture.metadata?.statusCode !== 200 ||
      !capture.html?.includes("portable-infobox")
    ) {
      console.log(
        JSON.stringify({
          skipped: target.name,
          reason: "No item infobox; source requires review",
        }),
      );
      saved.add(url);
      continue;
    }
    await save(target.file, {
      url,
      retrieved: new Date().toISOString(),
      capture,
    });
    saved.add(url);
  }
  next = r.next || (r.status === "scraping" ? next : null);
  Object.assign(job, {
    next,
    status: r.status,
    saved: [...saved],
    completed: r.completed,
    total: r.total,
  });
  await save(jobFile, job);
  console.log(
    JSON.stringify({
      status: r.status,
      saved: saved.size,
      total: job.targets.length,
    }),
  );
  if (next && !r.next) await delay(30000);
}
if (saved.size !== job.targets.length)
  throw new Error("Infoboxes omitted; rerun to retry missing sources");
