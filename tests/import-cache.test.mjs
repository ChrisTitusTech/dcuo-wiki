import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
test("CLI resumes, repairs corrupt cache, and refreshes without publishing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dcuo-import-"));
  try {
    const mock = join(dir, "mock.mjs");
    await writeFile(
      mock,
      `import {appendFile} from 'node:fs/promises';globalThis.fetch=async()=>{await appendFile('calls','x');return {ok:true,status:200,json:async()=>({success:true,data:{markdown:'Fixture article',links:[],html:'<p>Fixture article</p>',status:'published'}})}};`,
    );
    const script = fileURLToPath(
      new URL("../scripts/import.mjs", import.meta.url),
    );
    function run(...args) {
      const r = spawnSync(
        process.execPath,
        ["--import", mock, script, ...args],
        {
          cwd: dir,
          env: { ...process.env, FIRECRAWL_API_KEY: "test-fixture" },
          encoding: "utf8",
        },
      );
      assert.equal(r.status, 0, r.stderr);
    }
    const url = "https://dcuniverseonline.fandom.com/wiki/Fire_(Power)";
    run(url, url + "#A");
    assert.equal(await readFile(join(dir, "calls"), "utf8"), "x");
    run(url);
    assert.equal(await readFile(join(dir, "calls"), "utf8"), "x");
    const [name] = await readdir(join(dir, ".import-cache"));
    const file = join(dir, ".import-cache", name);
    assert.equal(
      JSON.parse(await readFile(file, "utf8")).status,
      "needs-review",
    );
    await writeFile(file, "broken JSON");
    run(url);
    assert.equal(await readFile(join(dir, "calls"), "utf8"), "xx");
    run("--refresh", url);
    assert.equal(await readFile(join(dir, "calls"), "utf8"), "xxx");
    assert.equal((await readdir(join(dir, ".import-cache"))).length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("inventory CLI dry run and bounded resume avoid publishing and repeated fetches", async () => {
  const dir = await mkdtemp(join(tmpdir(), "dcuo-batch-"));
  try {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(join(dir, "data"));
    const base = "https://dcuniverseonline.fandom.com/wiki/";
    await writeFile(
      join(dir, "data/inventory.json"),
      JSON.stringify({
        entries: [
          { kind: "article", status: "published", url: base + "Published" },
          ...["A", "B", "C"].map((name) => ({
            kind: "article",
            status: "unreviewed",
            url: base + name,
          })),
        ],
      }),
    );
    const mock = join(dir, "mock.mjs");
    await writeFile(
      mock,
      `import {appendFile} from 'node:fs/promises';globalThis.fetch=async()=>{await appendFile('calls','x');return {ok:true,status:200,json:async()=>({success:true,data:{markdown:'Useful fixture body'}})}};`,
    );
    const script = fileURLToPath(
      new URL("../scripts/import.mjs", import.meta.url),
    );
    function run(...args) {
      const result = spawnSync(
        process.execPath,
        ["--import", mock, script, ...args],
        {
          cwd: dir,
          env: { ...process.env, FIRECRAWL_API_KEY: "test-fixture" },
          encoding: "utf8",
        },
      );
      assert.equal(result.status, 0, result.stderr);
      return result.stdout;
    }
    const preview = run("--inventory", "2", "--dry-run");
    assert.match(preview, /Would stage: .*\/A/);
    assert.match(preview, /Would stage: .*\/B/);
    assert.doesNotMatch(preview, /\/C|\/Published/);
    await assert.rejects(readFile(join(dir, "calls")), { code: "ENOENT" });
    run("--inventory", "2");
    assert.equal(await readFile(join(dir, "calls"), "utf8"), "xx");
    run("--inventory", "2");
    assert.equal(await readFile(join(dir, "calls"), "utf8"), "xxx");
    run("--inventory", "2");
    assert.equal(await readFile(join(dir, "calls"), "utf8"), "xxx");
    assert.equal((await readdir(join(dir, ".import-cache"))).length, 3);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
