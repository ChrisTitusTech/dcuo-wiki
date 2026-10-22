import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { hasFactionConflict } from "../scripts/mission-video-match.mjs";

test("opposing mission variants are rejected while neutral and both-faction titles remain eligible", () => {
  assert.equal(
    hasFactionConflict(
      "Birds of Prey (Villains)",
      "DCUO Birds of Prey Full Run Hero",
    ),
    true,
  );
  assert.equal(
    hasFactionConflict(
      "Raven Unleashed (hero mission)",
      "DCUO Raven Unleashed [Villain Side]",
    ),
    true,
  );
  assert.equal(
    hasFactionConflict(
      "Raven Unleashed (hero mission)",
      "DCUO Raven Unleashed Hero",
    ),
    false,
  );
  assert.equal(
    hasFactionConflict(
      "Birds of Prey (Villains)",
      "DCUO Birds of Prey Heroes and Villains",
    ),
    false,
  );
  assert.equal(
    hasFactionConflict("Birds of Prey (Villains)", "DCUO Birds of Prey"),
    false,
  );
  assert.equal(
    hasFactionConflict("Birds of Prey", "DCUO Birds of Prey Hero"),
    false,
  );
});

test("video research reuses cache without credentials and accepts environment-only credentials", async () => {
  const cwd = await mkdtemp(join(tmpdir(), "mission-video-research-"));
  const script = resolve("scripts/research-mission-videos.mjs");
  const env = { ...process.env };
  for (const key of ["FIRECRAWL_API_KEY", "FIRECRAWL_KEY", "firecrawl_key"])
    delete env[key];
  try {
    await mkdir(join(cwd, "data"));
    await mkdir(join(cwd, ".import-cache/video-search"), { recursive: true });
    await writeFile(
      join(cwd, "data/mission-downloads.json"),
      JSON.stringify({
        records: [
          { title: "Example Mission", url: "https://example.com/mission" },
        ],
      }),
    );
    const query = 'DCUO site:youtube.com/watch ("Example Mission")';
    const cached = join(
      cwd,
      ".import-cache/video-search",
      createHash("sha256").update(query).digest("hex") + ".json",
    );
    await writeFile(cached, JSON.stringify({ results: [] }));
    assert.match(
      execFileSync(process.execPath, [script], { cwd, env, encoding: "utf8" }),
      /"researched":1/,
    );
    await rm(cached);
    assert.throws(
      () =>
        execFileSync(process.execPath, [script], { cwd, env, stdio: "pipe" }),
      /Missing Firecrawl key for uncached query/,
    );
    const mock = join(cwd, "mock-fetch.mjs");
    await writeFile(
      mock,
      `globalThis.fetch = async (url, options) => {
      if (url !== 'https://api.firecrawl.dev/v2/search' || options.headers.Authorization !== 'Bearer fixture-key') throw Error('Unexpected research request');
      return { ok: true, status: 200, json: async () => ({ success: true, data: { web: [] } }) };
    };`,
    );
    assert.match(
      execFileSync(process.execPath, ["--import", mock, script], {
        cwd,
        env: { ...env, FIRECRAWL_API_KEY: "fixture-key" },
        encoding: "utf8",
      }),
      /"researched":1/,
    );
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("published video evidence contains no explicit opposing faction titles", async () => {
  const { readFile } = await import("node:fs/promises");
  const data = JSON.parse(
    await readFile(
      new URL("../data/mission-videos.json", import.meta.url),
      "utf8",
    ),
  );
  for (const record of data.records)
    for (const match of record.matches)
      assert.equal(
        hasFactionConflict(record.title, match.title),
        false,
        `${record.title}: ${match.title}`,
      );
});
