// Copy every approved image through the bounded production R2 mirror, resumably.
import fs from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { acquireCatalogLock } from "./catalog-lock.mjs";
const sources = JSON.parse(
  await fs.readFile("data/migration/catalog-media.json", "utf8"),
);
const write = process.argv.includes("--write");
const file = ".import-cache/catalog/media-progress.json";
let progress = { records: [] };
try {
  progress = JSON.parse(await fs.readFile(file, "utf8"));
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const records = new Map(progress.records.map((r) => [r.id, r]));
const pending = sources.filter((s) => !records.has(s.id));
console.log(
  JSON.stringify({ approved: sources.length, pending: pending.length, write }),
);
if (!write) process.exit(0);
const release = acquireCatalogLock(".import-cache/catalog/media-writer.lock");
process.once("exit", release);
let cursor = 0,
  changed = 0,
  saving = Promise.resolve(),
  stopped = false;
const summary = () => ({
  approved: sources.length,
  completed: [...records.values()].filter((r) => r.status === "copied").length,
  failed: [...records.values()].filter((r) => r.status === "unavailable")
    .length,
  pending: sources.length - records.size,
});
const save = () =>
  (saving = saving.then(async () => {
    const data = {
      ...summary(),
      status: stopped
        ? "stopped"
        : records.size === sources.length
          ? "finished"
          : "running",
      updated: new Date().toISOString(),
      records: [...records.values()],
    };
    await fs.writeFile(file + ".tmp", JSON.stringify(data) + "\n");
    await fs.rename(file + ".tmp", file);
  }));
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    stopped = true;
  });
await save();
await Promise.all(
  Array.from({ length: 4 }, async () => {
    while (cursor < pending.length && !stopped) {
      const source = pending[cursor++];
      for (;;) {
        try {
          const response = await fetch(
            "https://dcuo-wiki.com/api/catalog-media/" + source.id,
            {
              method: "GET",
              redirect: "manual",
              signal: AbortSignal.timeout(60000),
            },
          );
          if (response.status === 404) {
            records.set(source.id, {
              id: source.id,
              status: "unavailable",
              reason: "Source image not found",
            });
            break;
          }
          if (response.status !== 302) {
            const message = (await response.text()).slice(0, 600);
            if (/supported image|too large|Unapproved image/.test(message)) {
              records.set(source.id, {
                id: source.id,
                status: "unavailable",
                reason: message,
              });
              break;
            }
            throw Error("Mirror HTTP " + response.status);
          }
          const url = "https://images.dcuo-wiki.com/catalog/" + source.id;
          if (response.headers.get("Location") !== url)
            throw Error("Unexpected mirror destination");
          const image = await fetch(url, {
            method: "HEAD",
            redirect: "error",
            signal: AbortSignal.timeout(30000),
          });
          if (
            !image.ok ||
            !image.headers.get("Content-Type")?.startsWith("image/")
          )
            throw Error("R2 public verification failed");
          records.set(source.id, {
            id: source.id,
            status: "copied",
            url,
            type: image.headers.get("Content-Type"),
            verified: new Date().toISOString(),
          });
          break;
        } catch (error) {
          console.log(
            JSON.stringify({
              status: "retry",
              id: source.id,
              reason: error.message,
              retryAfterSeconds: 300,
            }),
          );
          await save();
          for (let i = 0; i < 30 && !stopped; i++) await delay(10000);
          if (stopped) break;
        }
      }
      if (++changed % 25 === 0) {
        await save();
        console.log(JSON.stringify(summary()));
      }
    }
  }),
);
await save();
console.log(
  JSON.stringify({ ...summary(), status: stopped ? "stopped" : "finished" }),
);
