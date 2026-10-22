import test from "node:test";
import assert from "node:assert/strict";
import { convertMission } from "../scripts/convert-missions.mjs";
const record = {
  title: "Panic_Attack",
  url: "https://dcuniverseonline.fandom.com/wiki/Panic_Attack",
};
const cache = (markdown) => ({
  markdown,
  html: "<p>Source text</p>",
  retrieved: "2026-10-21T00:00:00Z",
  metadata: { url: record.url },
});
test("mission locations come from objective evidence rather than incidental story locations", () => {
  const c = convertMission(
    cache(
      'Scarecrow escaped from Arkham Asylum.\n\n## Objective\n\n- Travel to the abandoned construction site in East End.\n- Collect 25 fear gas activators.\n\n## Intro\n\n"Send the thugs back to Arkham Asylum."',
    ),
    record,
  );
  assert.equal(c.article.location.label, "East End");
  assert.match(
    c.article.location.precision,
    /Travel to the abandoned construction site/,
  );
  assert.equal(c.article.reviewed, false);
});
test("missing locations and empty walkthrough headings do not become fabricated content", () => {
  const c = convertMission(
    cache(
      "A mission about collecting things.\n\n## Objectives\n\n- Collect 10 items.\n\n## Walkthrough\n\n## Trivia",
    ),
    record,
  );
  assert.equal(c.article.location, undefined);
  assert.equal(
    c.article.sections.some((s) => s.title === "Walkthrough"),
    false,
  );
  assert.ok(c.reasons.includes("Insufficient source detail"));
});
test("mission conversion retains reward table rows and meaningful source references", () => {
  const c = convertMission(
    cache(
      "This mission awards different weapons after defeating the guards.\n\n## Objectives\n\n- Defeat 15 guards in Metropolis and report to your contact.\n\n## Rewards\n\n| Type | Reward |\n| --- | --- |\n| Bow | Longbow |\n| Staff | Energy Staff |",
    ),
    record,
  );
  assert.deepEqual(c.article.sections.find((s) => s.table).table.rows, [
    ["Bow", "Longbow"],
    ["Staff", "Energy Staff"],
  ]);
});

test("image-only map sections retain their image without placeholder prose", () => {
  const d = cache(
    "This source gives useful mission objectives and a map.\n\n## Objectives\n\n- Travel to Metropolis and collect the samples.\n\n## Map\n\n![Mission map](https://static.wikia.nocookie.net/dcuo/images/a/ab/Mission_Map.jpg/revision/latest)",
  );
  d.html =
    '<img width="400" height="300" data-image-name="Mission_Map.jpg" src="https://static.wikia.nocookie.net/dcuo/images/a/ab/Mission_Map.jpg/revision/latest">';
  const r = convertMission(d, record);
  const map = r.article.sections.find((s) => s.title === "Map");
  assert.ok(map);
  assert.deepEqual(map.items, []);
  assert.equal(map.images.length, 1);
  assert.equal(r.article.location.maps.length, 1);
});

test("mission pages without an Objectives heading still receive quest publication checks", () => {
  const result = convertMission(
    cache(
      "This is a mission that begins in Metropolis.\n\n## Background\n\nLocate and defeat the target.",
    ),
    { ...record, title: "Aversion_Therapy" },
  );
  assert.equal(result.article.category, "Quests");
});
test("maps in the source Map section remain map references even when the filename only says Spawn", () => {
  const d = cache(
    "This is a mission with several possible spawn points.\n\n## Objectives\n\n- Defeat the target.\n\n## Map\n\n![Spawn positions](https://static.wikia.nocookie.net/dcuo/images/a/ab/Bounty_Spawn.png/revision/latest)",
  );
  d.html =
    '<img width="400" data-image-name="Bounty_Spawn.png" src="https://static.wikia.nocookie.net/dcuo/images/a/ab/Bounty_Spawn.png/revision/latest">';
  const result = convertMission(d, record);
  assert.equal(result.article.location.maps.length, 1);
});

test("source form placeholders do not become guide text or substantive words", () => {
  const result = convertMission(
    cache(
      "A short mission.\n\n## Objectives\n\nIntro Message\n\n- Collect the samples.\n\n## Outro\n\nOutro Message\n\nDescription",
    ),
    record,
  );
  assert.deepEqual(
    result.article.sections.find((s) => s.title === "Objectives").items,
    ["Collect the samples."],
  );
  assert.ok(
    result.article.sections.every((s) =>
      s.items.every(
        (item) => !/^(Intro Message|Outro Message|Description)$/.test(item),
      ),
    ),
  );
  assert.ok(result.reasons.includes("Insufficient source detail"));
});

test("checking the Journal after a world objective is not a menu-only location", () => {
  const world = convertMission(
    cache(
      "A disguise mission.\n\n## Objectives\n\nSpeak to Jimmy Olsen. Talk to Scoops to disguise yourself. Then check your journal for the new mission and its objectives.",
    ),
    record,
  );
  assert.equal(world.article.location, undefined);
  const menu = convertMission(
    cache(
      "Your Armory is a mission for heroes and villains.\n\n## Objective\n\nComplete the mission in your journal to acquire your first Armory",
    ),
    record,
  );
  assert.equal(menu.article.location.label, "Journal");
});
