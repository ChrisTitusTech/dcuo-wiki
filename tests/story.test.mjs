import test from "node:test";
import assert from "node:assert/strict";
import story from "../src/data/story.json" with { type: "json" };
import articles from "../src/data/articles.json" with { type: "json" };
import releases from "../src/data/releases.json" with { type: "json" };
import { articleParts } from "../shared/article-content.mjs";
import { baselineDocument, validateDocument } from "../shared/rich-article.mjs";
import { releaseIdsFor } from "../shared/releases.mjs";
test("story coverage includes every named release, six mentors and the classic source arcs", () => {
  assert.equal(story.entries.filter((e) => e.era === "mentor").length, 6);
  assert.deepEqual(
    story.entries
      .filter((e) => e.era === "mentor")
      .map((e) => e.faction)
      .sort(),
    ["Hero", "Hero", "Hero", "Villain", "Villain", "Villain"],
  );
  assert.equal(story.entries.filter((e) => e.era === "classic").length, 11);
  assert.equal(story.entries.filter((e) => e.era === "original").length, 1);
  const expected = releases
    .filter((r) => ["episode", "chapter", "bonus"].includes(r.kind))
    .map((r) => r.id)
    .sort();
  assert.deepEqual(
    story.entries
      .filter((e) => ["episode", "chapter"].includes(e.era))
      .map((e) => e.release)
      .sort(),
    expected,
  );
  const sequence = story.entries
    .filter((e) => e.era === "episode")
    .map((e) => e.release);
  assert.deepEqual(
    sequence.slice(
      sequence.indexOf("episode-31"),
      sequence.indexOf("episode-32") + 1,
    ),
    ["episode-31", "death-of-superman", "episode-32"],
  );
});
test("all story links resolve to substantive editable articles, preserve R2 references, and match their releases", () => {
  const seen = new Set();
  for (const e of story.entries) {
    assert.ok(!seen.has(e.id));
    seen.add(e.id);
    const a = articles.find((a) => a.slug === e.slug);
    assert.ok(a, e.slug);
    assert.ok(releaseIdsFor(a.slug).includes(e.release));
    assert.doesNotThrow(
      () => validateDocument(baselineDocument(a, articleParts(a))),
      a.slug,
    );
    for (const g of e.guides)
      assert.ok(
        articles.some((a) => a.slug === g),
        g,
      );
    for (const s of a.sections) {
      assert.ok(
        s.items.length || s.table || s.images?.length || s.references?.length,
        a.slug + ": " + s.title,
      );
      assert.ok(
        !s.items.some((t) => /^(?:unknown|none|tba|tbd|\?+)$/i.test(t)),
        a.slug,
      );
      if (s.images) assert.ok(s.images.length);
    }
  }
  assert.ok(!story.generatedSlugs.includes("Shadows_Over_Argo"));
  assert.ok(!story.generatedSlugs.includes("Wrath_of_the_Worldkillers"));
});

test("empty mentor level headings still scope subsequent mission lists", async () => {
  const { convertReference } = await import("../scripts/convert-reference.mjs");
  const { storyHeadingContext } = await import("../scripts/story-content.mjs");
  const converted = convertReference(
    "## Level 5: Scarecrow\n\n### Instances\n\n- Gotham Sewers\n\n## Level 15: Punchline\n\n##### Instances\n\n- Regal Hotel\n\n## Level 30: Punchline finale\n\n### Main Quests\n\n- Defeat Joker",
    "https://dcuniverseonline.fandom.com/wiki/Tech_Hero_Storyline",
    { headingTitle: storyHeadingContext() },
  );
  assert.deepEqual(
    converted.sections.map((s) => s.title),
    [
      "Level 5: Scarecrow - Instances",
      "Level 15: Punchline - Instances",
      "Level 30: Punchline finale - Main Quests",
    ],
  );
  const batman = articles.find((a) => a.slug === "Story_tech_hero_storyline");
  assert.equal(
    batman.sections.filter((s) =>
      /^Level (?:5|15|30).* - Instances$/.test(s.title),
    ).length,
    3,
  );
  const magic = articles.find((a) => a.slug === "Story_magic_hero_storyline");
  assert.ok(
    magic.sections.some((s) => /^Level 30.* - Instances$/.test(s.title)),
  );
  assert.ok(
    !magic.sections.some((s) => /^Level 9.* - Instances$/.test(s.title)),
  );
});
test("chapter mission sequences survive later source metadata boundaries", () => {
  const day = articles.find((a) => a.slug === "Story_light_and_rain_chapter_1");
  const missions = day.sections.find((s) => s.title === "Chapter Missions");
  assert.ok(missions);
  assert.match(missions.items.join(" "), /Murder in Kaznia/);
  assert.match(missions.items.join(" "), /Dead Reckoning/);
  for (let i = 1; i <= 4; i++)
    assert.ok(
      articles
        .find((a) => a.slug === "Story_light_and_rain_chapter_" + i)
        .sections.some((s) => s.title === "Chapter Missions"),
    );
});
