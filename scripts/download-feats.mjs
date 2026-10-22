// Download the linked feat catalog with bounded Firecrawl concurrency and reusable captures.
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parseEnv } from "node:util";
import { parseFragment } from "parse5";
import { parseFeats } from "./feat-content.mjs";
import { classifyURL } from "./wiki-urls.mjs";
import { scrape } from "./firecrawl.mjs";
const origin = "https://dcuniverseonline.fandom.com";
export function featURL(value) {
  try {
    const u = new URL(value, origin);
    const title = decodeURIComponent(u.pathname.slice(6)).replaceAll(" ", "_");
    if (
      u.username ||
      u.password ||
      u.origin !== origin ||
      !u.pathname.startsWith("/wiki/") ||
      /^(?:Category|File|Special|Template|User(?:_talk)?|Talk|Help|MediaWiki|Forum):/i.test(
        title,
      ) ||
      !/(?:^|[_ (])Feats?(?:[_ ):/]|$)/i.test(title) ||
      u.search
    )
      return null;
    return (
      origin +
      "/wiki/" +
      encodeURI(title)
        .replaceAll("&", "%26")
        .replaceAll("?", "%3F")
        .replaceAll("#", "%23")
        .replaceAll(":", "%3A")
    );
  } catch {
    return null;
  }
}
export function featLinks(html) {
  const found = new Set();
  const visit = (n) => {
    if (n.tagName === "a") {
      const attrs = Object.fromEntries(
        (n.attrs || []).map((a) => [a.name, a.value]),
      );
      const url = featURL(attrs.href || "");
      if (url && !/\bnew\b/.test(attrs.class || "")) found.add(url);
    }
    for (const c of n.childNodes || []) visit(c);
  };
  visit(parseFragment(html));
  return [...found];
}
async function main() {
  let env = {};
  try {
    env = parseEnv(await readFile(".env", "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const key =
    process.env.FIRECRAWL_API_KEY ||
    process.env.FIRECRAWL_KEY ||
    env.FIRECRAWL_API_KEY ||
    env.FIRECRAWL_KEY ||
    env.firecrawl_key;
  await mkdir(".import-cache/feats", { recursive: true });
  const articles = JSON.parse(await readFile("src/data/articles.json", "utf8"));
  const root = articles.find((a) => a.slug === "Feats");
  const inventory = JSON.parse(await readFile("data/inventory.json", "utf8"));
  const inventoryURLs = inventory.entries
    .filter((e) => e.kind === "article")
    .map((e) => featURL(e.url))
    .filter(Boolean);
  let queue = [
    ...new Set([
      origin + "/wiki/Feats",
      ...inventoryURLs,
      ...root.sections
        .flatMap((s) => (s.references || []).map((r) => featURL(r.url)))
        .filter(Boolean),
    ]),
  ];
  const seen = new Set(queue),
    records = [];
  let progressWrite = Promise.resolve();
  let requestQueue = Promise.resolve(),
    nextRequest = 0;
  const fetcher = async (...args) => {
    const slot = requestQueue.then(async () => {
      const wait = Math.max(0, nextRequest - Date.now());
      if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
      nextRequest = Date.now() + 6500;
    });
    requestQueue = slot;
    await slot;
    return fetch(...args);
  };
  for (let wave = 0; queue.length; wave++) {
    const waveQueue = queue;
    queue = [];
    let next = 0;
    await Promise.all(
      Array.from({ length: 8 }, async () => {
        while (next < waveQueue.length) {
          const url = waveQueue[next++];
          const file =
            ".import-cache/" +
            createHash("sha256").update(url).digest("hex") +
            ".json";
          try {
            let capture;
            try {
              capture = JSON.parse(await readFile(file, "utf8"));
            } catch (e) {
              if (e.code !== "ENOENT") throw e;
            }
            if (!capture?.html || !capture?.markdown) {
              capture = {
                ...(await scrape(url, { key, fetcher })),
                url,
                retrieved: new Date().toISOString(),
                status: "needs-review",
              };
              await writeFile(
                file + ".tmp",
                JSON.stringify(capture, null, 2) + "\n",
              );
              await rename(file + ".tmp", file);
            }
            const named = parseFeats(capture.html, url)
              .records.flatMap((f) => f.detailSources || [])
              .map((raw) => {
                const e = classifyURL(raw);
                return e.kind === "article" ? e.url : null;
              })
              .filter(Boolean);
            const links = [...new Set([...featLinks(capture.html), ...named])];
            for (const link of links)
              if (!seen.has(link)) {
                seen.add(link);
                queue.push(link);
              }
            records.push({
              url,
              cacheFile: file,
              retrieved: capture.retrieved,
              sha256: createHash("sha256").update(capture.html).digest("hex"),
              links,
            });
            console.log(
              JSON.stringify({
                completed: records.length,
                wave,
                pending: waveQueue.length - next + queue.length,
                url,
              }),
            );
          } catch (e) {
            const omitted =
              [404, 410].includes(e.sourceStatus) ||
              (e.sourceStatus === 200 &&
                typeof e.capture?.markdown === "string" &&
                !e.capture.markdown.trim());
            let diagnostic;
            if (e.capture) {
              diagnostic =
                ".import-cache/feats/empty-" +
                createHash("sha256").update(url).digest("hex") +
                ".json";
              await writeFile(
                diagnostic,
                JSON.stringify({ url, ...e.capture }, null, 2) + "\n",
              );
            }
            const failure = {
              url,
              error: e.message,
              sourceStatus: e.sourceStatus,
              status: omitted ? "omitted-empty-or-missing" : "failed",
              ...(diagnostic ? { diagnostic } : {}),
              ...(e.capture
                ? {
                    markdownBytes: Buffer.byteLength(e.capture.markdown || ""),
                    htmlBytes: Buffer.byteLength(e.capture.html || ""),
                  }
                : {}),
            };
            records.push(failure);
            console.error(JSON.stringify(failure));
          }
          const snapshot = JSON.stringify(records, null, 2) + "\n";
          progressWrite = progressWrite.then(async () => {
            await writeFile(
              ".import-cache/feats/download-progress.json.tmp",
              snapshot,
            );
            await rename(
              ".import-cache/feats/download-progress.json.tmp",
              ".import-cache/feats/download-progress.json",
            );
          });
          await progressWrite;
        }
      }),
    );
    if (seen.size > 1000)
      throw Error(
        "Unexpected feat link expansion; inspect captures before continuing",
      );
  }
  await writeFile(
    "data/feat-sources.json",
    JSON.stringify(
      {
        retrieved: new Date().toISOString(),
        records: records.sort((a, b) => a.url.localeCompare(b.url)),
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({
      downloaded: records.filter((r) => !r.error).length,
      omitted: records.filter((r) => r.status === "omitted-empty-or-missing")
        .length,
      failed: records.filter(
        (r) => r.error && r.status !== "omitted-empty-or-missing",
      ).length,
    }),
  );
  if (records.some((r) => r.error && r.status !== "omitted-empty-or-missing"))
    process.exitCode = 1;
}
if (
  process.argv[1]?.endsWith("/download-feats.mjs") ||
  process.argv[1] === "scripts/download-feats.mjs"
)
  await main();
