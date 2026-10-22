import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { issuesFor } from "../scripts/content-policy.mjs";
import { checkBudget } from "../scripts/check-budget.mjs";
const articles = JSON.parse(
  readFileSync(new URL("../src/data/articles.json", import.meta.url)),
);
test("reviewed starters meet publication rules", () => {
  for (const a of articles) assert.deepEqual(issuesFor(a), []);
});
test("blocks empty and unreviewed imports", () => {
  assert.ok(
    issuesFor({ ...articles[0], reviewed: false, sections: [] }).length >= 2,
  );
});
test("quests require location research and video checks", () => {
  const q = {
    ...articles.find((a) => a.slug === "House_of_Venom"),
    location: undefined,
    videoReview: undefined,
  };
  assert.ok(issuesFor(q).includes("YouTube research required"));
  assert.ok(
    issuesFor(q).includes(
      "location evidence or researched limitation required",
    ),
  );
});
test("incidental video matches cannot pass without evidence", () => {
  assert.ok(
    issuesFor({
      ...articles.find((a) => a.slug === "House_of_Venom"),
      videos: [{ url: "https://www.youtube.com/watch?v=abc" }],
    }).includes("unverified video"),
  );
});
test("deployment includes all files and rejects oversized assets", () => {
  assert.equal(checkBudget(Array(18001).fill(1)).ok, false);
  assert.equal(checkBudget([26 * 1024 * 1024]).ok, false);
  assert.equal(checkBudget([100, 200]).ok, true);
});
test("rejects unsafe map links, invalid timestamps and malformed tables", () => {
  const quest = articles.find((a) => a.slug === "House_of_Venom");
  assert.ok(
    issuesFor({
      ...quest,
      location: {
        ...quest.location,
        maps: [{ label: "Map", url: "javascript:alert(1)" }],
      },
    }).includes("invalid map reference"),
  );
  assert.ok(
    issuesFor({
      ...quest,
      videos: [{ ...quest.videos[0], startSeconds: -1 }],
    }).includes("unverified video"),
  );
  assert.ok(
    issuesFor({
      ...articles[0],
      sections: [
        {
          title: "Test",
          items: articles[0].sections[0].items,
          table: { caption: "Table", columns: ["One"], rows: [["A", "B"]] },
        },
      ],
    }).includes("invalid table"),
  );
});

test("brief quests require concrete objectives, a source-backed location and a verified video", () => {
  const base = articles.find((a) => a.slug === "House_of_Venom");
  const brief = {
    ...base,
    sections: [
      {
        title: "Objectives",
        items: [
          "Travel to the named mission area and defeat the guards. Collect the requested samples, then speak to the contact to finish the objective.",
        ],
      },
    ],
  };
  assert.deepEqual(issuesFor(brief), []);
  assert.ok(
    issuesFor({ ...brief, videos: [] }).includes(
      "insufficient substantive content",
    ),
  );
  assert.ok(
    issuesFor({ ...brief, location: undefined }).includes(
      "insufficient substantive content",
    ),
  );
  assert.ok(
    issuesFor({
      ...brief,
      sections: [{ title: "Background", items: brief.sections[0].items }],
    }).includes("insufficient substantive content"),
  );
  assert.ok(
    issuesFor({
      ...brief,
      sections: [{ title: "Objectives", items: ["Defeat the target."] }],
    }).includes("insufficient substantive content"),
  );
});
