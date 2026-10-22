import test from "node:test";
import assert from "node:assert/strict";
import { fromMarkdown } from "mdast-util-from-markdown";
import { directRelease, normalize } from "../scripts/assign-guide-releases.mjs";
import { releases, releaseIdsFor, releasesFor } from "../shared/releases.mjs";
import articles from "../src/data/articles.json" with { type: "json" };
import report from "../data/guide-release-assignments.json" with { type: "json" };
const source = "https://dcuniverseonline.fandom.com/wiki/";
test("release badges outrank incidental introductory links and exclude body references", () => {
  const aliases = new Map([
    [source + "Fight_for_the_Light", ["episode-1"]],
    [source + "Hand_of_Fate", ["episode-5"]],
  ]);
  const parse = (s) => fromMarkdown(s).children;
  assert.deepEqual(
    directRelease(
      parse(
        `[![Badge](https://example.com/icon.png)](${source}Fight_for_the_Light)\n\nA mission mentioning [Hand of Fate](${source}Hand_of_Fate).\n\n## Trivia\n\n[Hand of Fate](${source}Hand_of_Fate)`,
      ),
      aliases,
    ),
    ["episode-1"],
  );
  assert.deepEqual(
    directRelease(
      parse(
        `A mission with [Sinestro](${source}Sinestro).\n\n## Rewards\n\n[Hand of Fate](${source}Hand_of_Fate)`,
      ),
      aliases,
    ),
    [],
  );
  assert.equal(
    normalize(source + "Mxyzptlk%27s_Mischief#Missions"),
    source + "Mxyzptlk's_Mischief",
  );
});
test("every guide has valid audited release metadata, with chapter parents and separate core/events", () => {
  const ids = new Set(releases.map((r) => r.id));
  assert.equal(ids.size, releases.length);
  assert.deepEqual(
    releases.filter((r) => r.kind === "episode").map((r) => r.number),
    Array.from({ length: 48 }, (_, i) => i + 1),
  );
  assert.equal(releases.filter((r) => r.kind === "chapter").length, 6);
  assert.equal(report.records.length, articles.length);
  for (const a of articles) {
    const assigned = releasesFor(a.slug);
    assert.ok(assigned.length, a.slug);
    assert.ok(report.records.find((r) => r.slug === a.slug)?.evidence, a.slug);
    for (const r of assigned) assert.ok(ids.has(r.id));
  }
  assert.deepEqual(releaseIdsFor("Sea_Change"), ["episode-6"]);
  assert.deepEqual(releaseIdsFor("Alert_T1_Oan_Sciencells_Heroes"), [
    "episode-1",
  ]);
  assert.deepEqual(releaseIdsFor("Grab_and_Smash"), ["episode-5"]);
  assert.deepEqual(releaseIdsFor("Beware_My_Power"), ["core-game"]);
  assert.deepEqual(releaseIdsFor("Powers"), ["game-systems"]);
  assert.deepEqual(releaseIdsFor("Batman_Day_Daily_Alert"), ["batman-day"]);
  assert.deepEqual(releaseIdsFor("Celebrate_Pride"), ["celebrate-pride"]);
  assert.deepEqual(releaseIdsFor("Alert_T1_Area_51"), ["core-game"]);
  assert.deepEqual(releaseIdsFor("Crushing_Sorrow_Ghostly_Anomaly"), [
    "light-and-rain-chapter-3",
    "light-and-rain",
  ]);
  assert.deepEqual(releaseIdsFor("unknown-guide"), []);
});

test("each numbered Episode and chapter has substantive imported content", () => {
  for (const release of releases.filter((r) =>
    ["episode", "chapter"].includes(r.kind),
  ))
    assert.ok(
      articles.some((a) => releaseIdsFor(a.slug).includes(release.id)),
      release.label,
    );
  assert.deepEqual(releaseIdsFor("Patrol_Catastrophe"), ["episode-13"]);
  assert.deepEqual(releaseIdsFor("Return_to_the_Nexus"), ["episode-13"]);
  assert.deepEqual(releaseIdsFor("Iceberg_Lounge_Challenge"), ["episode-25"]);
  assert.deepEqual(releaseIdsFor("Kandor_Central_Tower"), ["episode-26"]);
  assert.deepEqual(releaseIdsFor("Wrath_of_the_Worldkillers"), [
    "children-of-krypton-chapter-2",
    "children-of-krypton",
  ]);
});
