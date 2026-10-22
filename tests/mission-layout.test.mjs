import test from "node:test";
import assert from "node:assert/strict";
import { missionLayout, missionSummary } from "../scripts/mission-layout.mjs";
test("import summaries use substantive introductions instead of image captions", () => {
  const intro =
    "Wayne Manor Gala is a Tier 4 2 player operation in Episode 26.";
  assert.equal(
    missionSummary({
      summary: "Kandor Central Tower",
      sections: [
        { items: [], images: [{ label: "Kandor Central Tower" }] },
        { items: [intro] },
      ],
    }),
    intro,
  );
  assert.equal(
    missionSummary({ summary: intro, sections: [{ items: [] }] }),
    intro,
  );
});
test("reward references and images survive merging into their table", () => {
  const image = { label: "Weapon", url: "https://example.com/weapon.png" },
    ref = { label: "Reward details", url: "https://example.com/reward" };
  const a = {
    sections: [
      { title: "Rewards", items: [], references: [ref], images: [image] },
      {
        title: "Rewards - table 1",
        items: [],
        table: { caption: "Rewards", columns: ["Reward"], rows: [["Weapon"]] },
      },
    ],
  };
  const output = missionLayout(a);
  assert.equal(output.length, 1);
  assert.deepEqual(output[0].references, [ref]);
  assert.deepEqual(output[0].images, [image]);
  assert.equal(output[0].table.rows[0][0], "Weapon");
  assert.equal(a.sections.length, 2);
});
test("maps already displayed in the location panel appear once, while distinct gallery images remain", () => {
  const map = { label: "Map", url: "https://example.com/map.png" },
    scene = { label: "Scene", url: "https://example.com/scene.png" };
  const output = missionLayout({
    location: { maps: [map] },
    sections: [
      { title: "Map", items: ["Map"], images: [map] },
      {
        title: "Gallery",
        items: ["Scene", "The door is beside the stairs."],
        images: [scene],
      },
    ],
  });
  assert.equal(output.length, 1);
  assert.deepEqual(output[0].images, [scene]);
  assert.deepEqual(output[0].items, ["The door is beside the stairs."]);
});
