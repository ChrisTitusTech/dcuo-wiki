import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
test("item research supports an environment-only key without a .env file or network access", async () => {
  const directory = await fs.mkdtemp(join(tmpdir(), "dcuo-item-research-"));
  try {
    await fs.mkdir(join(directory, "data"));
    await fs.writeFile(join(directory, "data/census-item-index.json"), "[]");
    await fs.writeFile(
      join(directory, "fetch-fixture.mjs"),
      "globalThis.fetch=async()=>Response.json({items:[]});",
    );
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        join(directory, "fetch-fixture.mjs"),
        resolve("scripts/research-unknown-items.mjs"),
        "11111111-1111-4111-8111-111111111111",
      ],
      {
        cwd: directory,
        env: { ...process.env, FIRECRAWL_API_KEY: "test-only" },
        encoding: "utf8",
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).complete, true);
    assert.equal(JSON.parse(result.stdout).ids, 0);
    await assert.rejects(fs.access(join(directory, ".env")), {
      code: "ENOENT",
    });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});
