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

test("faction mission tables keep separate source-ordered paths and faction links", async () => {
  const { storyMarkdown, storyHeadingContext } =
    await import("../scripts/story-content.mjs");
  const { convertReference } = await import("../scripts/convert-reference.mjs");
  for (const episode of [1, 2, 11]) {
    const article = articles.find((a) => a.slug === "Story_episode_" + episode);
    for (const faction of ["Heroes", "Villains"]) {
      const title = "Story Missions - For " + faction;
      const actual = article.sections.find((s) => s.title === title);
      assert.ok(actual, episode + ": " + title);
      assert.equal(new Set(actual.items).size, actual.items.length);
      assert.ok(
        actual.references.every(
          (r) =>
            !r.url.includes(faction === "Heroes" ? "(Villains)" : "(Heroes)"),
        ),
      );
    }
  }
  const fixture =
    "## Story Missions\n\n| | |\n| --- | --- |\n| ##### For Heroes<br>- [First](https://dcuniverseonline.fandom.com/wiki/First)<br>- Shared | ##### For Villains<br>- Second<br>- Shared |";
  const converted = convertReference(
    storyMarkdown(fixture),
    "https://dcuniverseonline.fandom.com/wiki/Test",
    { headingTitle: storyHeadingContext() },
  );
  assert.deepEqual(
    converted.sections.map((s) => [s.title, s.items]),
    [
      ["Story Missions - For Heroes", ["First", "Shared"]],
      ["Story Missions - For Villains", ["Second", "Shared"]],
    ],
  );
  assert.equal(
    converted.sections[0].references[0].url,
    "https://dcuniverseonline.fandom.com/wiki/First",
  );
  const first = articles.find((a) => a.slug === "Story_episode_1");
  assert.deepEqual(
    first.sections.find((s) => s.title.endsWith("For Heroes")).items,
    [
      "Emergency at Ferris Aircraft",
      "ALERT: Coast City",
      "ALERT: Oan Sciencells",
      "Alert T1: STAR Labs Research Facility",
    ],
  );
});

test("classic missions retain numbered main and optional side paths without import markup", () => {
  const punchline = articles.find((a) => a.slug === "Story_classic_punchline");
  const main = punchline.sections.find(
    (s) => s.title === "Episode 1: Funhouse - Hero Missions - Main Missions",
  );
  const side = punchline.sections.find(
    (s) => s.title === "Episode 1: Funhouse - Hero Missions - Side Missions",
  );
  assert.deepEqual(main.items, [
    "1. Gordon Wants a Word",
    "2. Laugh Riot",
    "3. Beware of Jokers Bearing Gifts",
    "4. Lunatic Fringe",
    "5. Chat With The Commish",
  ]);
  assert.deepEqual(side.items, [
    "2. Rollercoaster of Doom",
    "4. What's In The Box? & Cops Behind Bars",
  ]);
  for (const slug of story.generatedSlugs) {
    for (const section of articles.find((a) => a.slug === slug).sections) {
      assert.equal(
        new Set(section.items).size,
        section.items.length,
        slug + ": " + section.title,
      );
      for (const item of section.items)
        assert.doesNotMatch(
          item,
          /Edit section:|^#+ |^>\s*$|^(?:\d+\.\s*)?n\/a$/i,
          slug,
        );
    }
  }
});

test("shared classic collectibles are scoped to the episode rather than the last faction", () => {
  for (const slug of story.generatedSlugs.filter((s) =>
    s.startsWith("Story_classic_"),
  )) {
    for (const section of articles
      .find((a) => a.slug === slug)
      .sections.filter((s) =>
        /Featured (?:Briefings|Investigations?)/.test(s.title),
      )) {
      assert.doesNotMatch(
        section.title,
        /(?:Hero|Villain) Missions/,
        slug + ": " + section.title,
      );
    }
  }
  const beginning = articles.find(
    (a) => a.slug === "Story_classic_beginning_of_the_end",
  );
  assert.ok(
    beginning.sections.some(
      (s) =>
        s.title === "Prologue: Escaping Brainiac's Ship - Featured Briefings" &&
        s.items.includes("Brainiac Incursion"),
    ),
  );
});
