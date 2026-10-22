import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const origin = "https://dcuniverseonline.fandom.com/wiki/";
async function runFixture(ambiguous) {
  const root = await mkdtemp(join(tmpdir(), "dcuo-enrichment-"));
  try {
    await mkdir(join(root, "data"));
    await mkdir(join(root, ".import-cache/converted-missions"), {
      recursive: true,
    });
    const parent = {
      source: origin + "Bounties",
      slug: "Bounties",
      reasons: [],
    };
    const child = {
      source: origin + "BOUNTY%3A_Fire",
      slug: "BOUNTY_Fire",
      reasons: ["Insufficient source detail"],
    };
    const entries = [
      parent,
      child,
      ...(ambiguous
        ? [
            {
              source: origin + "WANTED%3A_Fire",
              slug: "WANTED_Fire",
              reasons: [],
            },
          ]
        : []),
    ];
    await writeFile(
      join(root, "data/mission-conversion.json"),
      JSON.stringify({ records: entries }),
    );
    await writeFile(
      join(root, "data/mission-downloads.json"),
      JSON.stringify({
        records: [
          { url: parent.source, cacheFile: ".import-cache/bounties.json" },
        ],
      }),
    );
    await writeFile(
      join(root, ".import-cache/bounties.json"),
      JSON.stringify({
        markdown:
          "| Wanted | Origin | City | Faction | Episode |\n| --- | --- | --- | --- | --- |\n| [Fire](" +
          origin +
          "Fire) | The Gotham Tap Room | Gotham City | Rogues | - |",
      }),
    );
    for (const r of entries) {
      await writeFile(
        join(root, ".import-cache/converted-missions", r.slug + ".json"),
        JSON.stringify({
          article: {
            ...r,
            title:
              r.slug === "Bounties"
                ? "Bounties"
                : r.slug === "BOUNTY_Fire"
                  ? "BOUNTY: Fire"
                  : "WANTED: Fire",
            sections: [
              {
                title: "Source overview",
                items: [
                  "Bounties require defeating the named target and can be obtained from the source-listed mission contact.",
                ],
              },
            ],
          },
          words: 20,
          reasons: r.reasons,
        }),
      );
    }
    execFileSync(
      process.execPath,
      [
        fileURLToPath(
          new URL("../scripts/enrich-mission-locations.mjs", import.meta.url),
        ),
      ],
      { cwd: root, stdio: "pipe" },
    );
    return JSON.parse(
      await readFile(
        join(root, ".import-cache/converted-missions/BOUNTY_Fire.json"),
        "utf8",
      ),
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
test("bounty directory provides city and origin for a unique named bounty", async () => {
  const r = await runFixture(false);
  assert.equal(r.article.location.label, "Gotham City / The Gotham Tap Room");
  assert.equal(r.bountyDirectorySource, origin + "Bounties");
  assert.equal(r.article.sections.at(-1).table.rows[0][0], "Fire");
});
test("ambiguous NPC names do not assign a bounty to the wrong faction or variant", async () => {
  const r = await runFixture(true);
  assert.equal(r.article.location, undefined);
  assert.equal(r.bountyDirectorySource, undefined);
});
