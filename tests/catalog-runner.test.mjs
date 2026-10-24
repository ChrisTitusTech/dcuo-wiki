import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

test("actual bulk runner finishes the queue when a completed batch omits a page", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "dcuo-runner-"));
  try {
    await fs.mkdir(path.join(dir, "src/data"), { recursive: true });
    await fs.mkdir(path.join(dir, "data"));
    await fs.writeFile(path.join(dir, "src/data/articles.json"), "[]");
    await fs.writeFile(
      path.join(dir, "data/catalog-downloads.json"),
      JSON.stringify({ records: [] }),
    );
    await fs.writeFile(
      path.join(dir, "data/inventory.json"),
      JSON.stringify({
        entries: [
          {
            url: "https://dcuniverseonline.fandom.com/wiki/Stats",
            kind: "article",
          },
        ],
      }),
    );
    await fs.symlink(
      fileURLToPath(new URL("../scripts", import.meta.url)),
      path.join(dir, "scripts"),
    );
    const fixture = path.join(dir, "simulate.mjs");
    await fs.writeFile(
      fixture,
      `globalThis.fetch=async(url,options)=>new Response(JSON.stringify(options.method==='POST'?{success:true,id:'test-job'}:{status:'completed',data:[],completed:0,total:0}),{status:200,headers:{'content-type':'application/json'}});`,
    );
    const result = spawnSync(
      process.execPath,
      ["scripts/download-all-catalog.mjs", "--write"],
      {
        cwd: dir,
        encoding: "utf8",
        timeout: 10000,
        env: {
          ...process.env,
          FIRECRAWL_API_KEY: "test-key",
          NODE_OPTIONS: "--import=" + fixture,
        },
      },
    );
    assert.equal(result.status, 0, result.stderr);
    const state = JSON.parse(
      await fs.readFile(
        path.join(dir, ".import-cache/catalog/download-all-state.json"),
        "utf8",
      ),
    );
    assert.equal(state.status, "downloaded-with-errors-awaiting-review");
    assert.equal(state.failedCaptures, 1);
    assert.equal(state.completedBatches, 1);
    const log = await fs.readFile(
      path.join(dir, ".import-cache/catalog/download-all.log"),
      "utf8",
    );
    assert.match(log, /batch-completed-with-holds/);
    assert.match(log, /No missing captures in this batch/);
    const progress = JSON.parse(
      await fs.readFile(
        path.join(dir, ".import-cache/catalog/download-progress.json"),
        "utf8",
      ),
    );
    assert.equal(progress.records[0].status, "failed");
    await assert.rejects(
      fs.access(path.join(dir, ".import-cache/catalog/download-all.lock")),
    );
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
