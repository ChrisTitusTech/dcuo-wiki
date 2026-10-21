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
