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
