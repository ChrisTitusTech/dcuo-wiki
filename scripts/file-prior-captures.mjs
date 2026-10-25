import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { catalogArticles } from "./catalog-files.mjs";
import { classifyURL } from "./wiki-urls.mjs";
import { canonicalCapture } from "./catalog-convert.mjs";
import { classifyCatalog } from "./catalog-classify.mjs";
const bulk = JSON.parse(
  await fs.readFile("data/migration/catalog.json", "utf8"),
);
const known = new Set(bulk.records.map((r) => r.captureFile));
const byURL = new Map(bulk.records.map((r) => [r.url, r]));
const existing = JSON.parse(
  await fs.readFile("src/data/articles.json", "utf8"),
);
const published = new Map();
for (const article of [...existing, ...(await catalogArticles())])
  if (!published.has(classifyURL(article.source).url))
    published.set(classifyURL(article.source).url, article);
async function jsonFiles(directory) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (directory === ".import-cache" && entry.name === "filed") continue;
    const file = directory + "/" + entry.name;
    if (entry.isDirectory()) files.push(...(await jsonFiles(file)));
    else if (entry.name.endsWith(".json")) files.push(file);
  }
  return files;
}
let previous = [];
try {
  previous = JSON.parse(
    await fs.readFile("data/migration/prior-captures.json", "utf8"),
  ).records;
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const prior = new Map(previous.map((r) => [r.captureFile, r]));
const records = [];
for (const file of (await jsonFiles(".import-cache")).sort()) {
  if (known.has(file)) continue;
  const capture = JSON.parse(await fs.readFile(file, "utf8"));
  if (!capture || typeof capture !== "object" || Array.isArray(capture))
    continue;
  const root = /^\.import-cache\/[a-f0-9]{64}\.json$/.test(file);
  const batch =
    Array.isArray(capture.data) &&
    capture.data.some((p) => p?.html && p?.markdown);
  if (
    !root &&
    !batch &&
    (!(
      capture.url ||
      capture.metadata?.sourceURL ||
      capture.metadata?.url ||
      (typeof capture.source === "string" ? capture.source : undefined)
    ) ||
      (!("markdown" in capture) && !("html" in capture)))
  )
    continue;
  const name = root
    ? file.split("/").at(-1)
    : createHash("sha256").update(file).digest("hex") + ".json";
  const url =
    capture.url ||
    capture.metadata?.sourceURL ||
    capture.metadata?.url ||
    (typeof capture.source === "string" ? capture.source : undefined);
  const parsed = classifyURL(url),
    row = {
      captureFile: file,
      url,
      title: parsed.title || capture.metadata?.title || file.split("/").at(-1),
      category: "Research",
      type: "Supporting source",
      status: "supporting-research",
      reason: "Supporting source evidence retained",
    };
  if (batch)
    row.reason = "Batch source response retained as supporting evidence";
  else if (
    capture.metadata?.statusCode !== 200 ||
    (!capture.html && !capture.markdown?.trim()) ||
    (parsed.kind === "article" && (!capture.html || !capture.markdown?.trim()))
  )
    Object.assign(row, {
      category: "Source errors",
      status: "source-error",
      reason: "Prior capture lacks successful substantive HTML and Markdown",
    });
  else if (parsed.kind === "article") {
    try {
      const canonical = canonicalCapture({ ...capture, url }),
        article = published.get(canonical.url),
        covered = byURL.get(parsed.url);
      Object.assign(row, classifyCatalog(capture, canonical.title), {
        canonical: canonical.url,
      });
      if (article)
        Object.assign(row, {
          category: article.category,
          type: article.type || article.category,
          status: "already-published",
          slug: article.slug,
          reason:
            "Existing published source; preserve article and live corrections",
        });
      else if (covered)
        Object.assign(row, {
          category: covered.category,
          status: "bulk-covered",
          reason: covered.reason,
          slug: covered.slug,
        });
      else
        Object.assign(row, {
          status: "held",
          reason:
            "Prior gameplay capture outside the bulk plan requires conversion review",
        });
    } catch (error) {
      Object.assign(row, { status: "held", reason: error.message });
    }
  }
  if (row.status === "supporting-research" && !batch) {
    const host = new URL(url).hostname;
    if (/(?:^|\.)youtube\.com$|^youtu\.be$/.test(host))
      Object.assign(row, {
        category: "Video research",
        type: "Video evidence",
      });
    else if (/^File:/i.test(parsed.title || ""))
      Object.assign(row, {
        category: "Media sources",
        type: "Image source pages",
      });
    else if (parsed.kind !== "article")
      Object.assign(row, {
        category: "Source indexes",
        type: "Supporting indexes and reference sources",
      });
  }
  if (capture.html)
    row.captureHash = createHash("sha256").update(capture.html).digest("hex");
  const directory =
    ".import-cache/filed/" +
    row.category.replace(/[^A-Za-z0-9_-]/g, "-") +
    "/prior-" +
    row.status;
  await fs.mkdir(directory, { recursive: true });
  row.filedCapture =
    directory +
    "/" +
    row.title.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 96) +
    "--" +
    name;
  try {
    await fs.link(file, row.filedCapture);
  } catch (e) {
    if (e.code !== "EEXIST") throw e;
    const [a, b] = await Promise.all([
      fs.stat(file),
      fs.stat(row.filedCapture),
    ]);
    if (a.ino !== b.ino || a.dev !== b.dev)
      throw Error("Prior filed source differs; preserve both for inspection");
  }
  const old = prior.get(file)?.filedCapture;
  if (old && old !== row.filedCapture) {
    if (!old.startsWith(".import-cache/filed/"))
      throw Error("Unexpected archive path");
    await fs.unlink(old);
  }
  records.push(row);
}
const counts = {};
for (const r of records) counts[r.status] = (counts[r.status] || 0) + 1;
await fs.writeFile(
  "data/migration/prior-captures.json",
  JSON.stringify({ schemaVersion: 1, counts, records }) + "\n",
);
const combined = [...bulk.records, ...records];
for (const category of new Set(combined.map((r) => r.category))) {
  const directory =
    ".import-cache/filed/" + category.replace(/[^A-Za-z0-9_-]/g, "-");
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(
    directory + "/index.json",
    JSON.stringify(
      combined.filter((r) => r.category === category),
      null,
      2,
    ) + "\n",
  );
}
console.log(
  JSON.stringify(
    {
      counts,
      priorFiles: records.length,
      held: records
        .filter((r) => r.status === "held")
        .map((r) => ({ title: r.title, url: r.url })),
    },
    null,
    2,
  ),
);
