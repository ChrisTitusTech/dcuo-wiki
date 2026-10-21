import test from "node:test";
import assert from "node:assert/strict";
import { convertReference } from "../scripts/convert-reference.mjs";
const source = "https://dcuniverseonline.fandom.com/wiki/Feats";
test("reference conversion preserves table relationships and real headers", () => {
  const result = convertReference(
    "## Costs\n\n| | | |\n|---|---|---|\n| Feat Level | Replay Badges Cost | Cost per Skill Point |\n| 100 Points | 7 | 7 Replay Badges |",
    source,
  );
  const table = result.sections.find((s) => s.table).table;
  assert.deepEqual(table.columns, [
    "Feat Level",
    "Replay Badges Cost",
    "Cost per Skill Point",
  ]);
  assert.deepEqual(table.rows, [["100 Points", "7", "7 Replay Badges"]]);
  assert.equal(result.reviewed, false);
});
test("directory cells retain separate entries and source links without publishing HTML", () => {
  const result = convertReference(
    "## Directory\n\n| |\n|---|\n| - [One](https://dcuniverseonline.fandom.com/wiki/One)<br>- [Two](https://dcuniverseonline.fandom.com/wiki/Two) |",
    source,
  );
  assert.deepEqual(result.sections[0].items, ["One", "Two"]);
  assert.equal(result.sections[0].references.length, 2);
  assert.throws(
    () => convertReference("<script>bad()</script>", source),
    /Unsupported/,
  );
});
test("large tables split at editable limits without dropping rows", () => {
  const rows = Array.from(
    { length: 100 },
    (_, i) => `| ${i} | ${"text ".repeat(30)} |`,
  );
  const result = convertReference(
    "| ID | Details |\n|---|---|\n" + rows.join("\n"),
    source,
  );
  const tables = result.sections.filter((s) => s.table).map((s) => s.table);
  assert.ok(tables.length > 1);
  assert.equal(tables.flatMap((t) => t.rows).length, 100);
  for (const t of tables)
    assert.ok(t.rows.map((r) => r.join(" | ")).join("\n").length <= 6500);
});

test("a table after the contents list is substantive content", () => {
  const result = convertReference(
    "## Contents\n\n- [Overview](#overview)\n\n| Ability | Cost |\n|---|---|\n| Fireball | 100 |\n\n## Overview\n\nUseful details.",
    source,
  );
  assert.deepEqual(result.sections.find((s) => s.table).table.rows, [
    ["Fireball", "100"],
  ]);
});

test("multi-row headerless directories preserve every entry", () => {
  const result = convertReference(
    "| | |\n|---|---|\n| One | Two |\n| Three | Four |",
    source,
  );
  assert.deepEqual(result.sections[0].items, ["One", "Two", "Three", "Four"]);
  assert.equal(
    result.sections.some((s) => s.table),
    false,
  );
});

test("malformed table markup requires HTML review instead of becoming prose", () => {
  assert.throws(
    () =>
      convertReference("| Interaction | Powers |\n| Burns | Fire |", source),
    /Malformed Markdown table/,
  );
});
