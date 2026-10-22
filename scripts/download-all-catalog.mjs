// Long-running download only. Publication still requires editorial and media review.
import fs from "node:fs/promises";
import { createWriteStream, constants } from "node:fs";
import { acquireCatalogLock } from "./catalog-lock.mjs";
import { catalogProgress } from "./catalog-cache.mjs";
import { spawn } from "node:child_process";
const write = process.argv.includes("--write");
await fs.mkdir(".import-cache/catalog", { recursive: true });
try {
  await fs.copyFile(
    "data/catalog-downloads.json",
    ".import-cache/catalog/download-progress.json",
    constants.COPYFILE_EXCL,
  );
} catch (e) {
  if (e.code !== "EEXIST") throw e;
}
const lockFile = ".import-cache/catalog/download-all.lock";
const release = write ? acquireCatalogLock(lockFile) : () => {};
if (write) process.once("exit", release);
const stateFile = ".import-cache/catalog/download-all-state.json";
const state = {
  pid: process.pid,
  started: new Date().toISOString(),
  status: write ? "running" : "dry-run",
  completedBatches: 0,
};
const save = async () => {
  if (!write) return;
  await fs.writeFile(
    stateFile + ".tmp",
    JSON.stringify({ ...state, updated: new Date().toISOString() }, null, 2) +
      "\n",
  );
  await fs.rename(stateFile + ".tmp", stateFile);
};
let child,
  stopped = false;
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    stopped = true;
    child?.kill(signal);
  });
const log = createWriteStream(".import-cache/catalog/download-all.log", {
  flags: "a",
});
try {
  do {
    await save();
    const args = [
      "scripts/download-catalog.mjs",
      "--background-progress",
      "--limit",
      "100",
      ...(write ? ["--write"] : []),
    ];
    child = spawn(process.execPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output = (output + chunk.toString()).slice(-20000);
    });
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    const code = await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", resolve);
    });
    child = null;
    const progress = JSON.parse(
      await fs.readFile(".import-cache/catalog/download-progress.json", "utf8"),
    );
    Object.assign(state, catalogProgress(progress));
    if (stopped) {
      state.status = "stopped";
      break;
    }
    if (code !== 0) {
      state.status = "failed";
      state.exitCode = code;
      process.exitCode = 1;
      break;
    }
    if (!write || output.includes("No missing captures in this batch")) {
      state.status = write
        ? state.failedCaptures
          ? "downloaded-with-errors-awaiting-review"
          : "downloaded-awaiting-review"
        : "dry-run";
      break;
    }
    state.completedBatches++;
  } while (!stopped);
} catch (e) {
  state.status = "failed";
  state.error = e.message;
  process.exitCode = 1;
} finally {
  await save();
  release();
  log.end();
}
console.log(JSON.stringify(state));
