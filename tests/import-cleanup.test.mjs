import test from "node:test";
import assert from "node:assert/strict";
import articles from "../src/data/articles.json" with { type: "json" };
import contexts from "../src/data/reward-context.json" with { type: "json" };
import {
  cleanImportText,
  cleanImportItems,
  missingImportText,
  cleanImportedArticle,
  sectionHasContent,
  filledTable,
} from "../shared/import-text.mjs";
import { articleParts, renderPart } from "../shared/article-content.mjs";
import {
  baselineDocument,
  documentText,
  renderDocument,
} from "../shared/rich-article.mjs";
import { convertReference } from "../scripts/convert-reference.mjs";

test("cleanup omits only empty fields and preserves actual gameplay claims", () => {
  assert.equal(cleanImportText("Finish the alert.\\"), "Finish the alert.");
  assert.equal(cleanImportText("\\* Random boss"), "* Random boss");
  assert.deepEqual(
    cleanImportItems([
      "\\",
      "n/a\\",
      "1. n/a",
      "Feat reward: Not stated",
      "n/a Points",
      "[[]]",
      "--",
      "?",
      "Unknown Evil",
      "0 Marks",
      "No combat required",
      "A None of the Above feat",
    ]),
    [
      "Unknown Evil",
      "0 Marks",
      "No combat required",
      "A None of the Above feat",
    ],
  );
  assert.deepEqual(
    filledTable(
      ["Name", "Unknown", "Reward"],
      [
        ["Quest", "", ""],
        ["", "n/a", ""],
        ["Quest 2", "", "5 Marks"],
      ],
    ),
    {
      columns: ["Name", "Reward"],
      rows: [
        ["Quest", ""],
        ["Quest 2", "5 Marks"],
      ],
    },
  );
});

test("empty sections keep revision indices but disappear from the full editor and published contents", () => {
  const a = cleanImportedArticle({
    slug: "Test",
    title: "Test",
    summary: "Test",
    sections: [
      { title: "Rewards", items: ["n/a\\"] },
      { title: "Objectives", items: ["Complete the alert.\\"] },
    ],
  });
  assert.equal(a.sections.length, 2);
  assert.equal(sectionHasContent(a.sections[0]), false);
  assert.equal(
    articleParts(a).find((p) => p.id === "section-1").text,
    "- Complete the alert.",
  );
  const document = baselineDocument(a, articleParts(a));
  assert.doesNotMatch(documentText(document.content), /Rewards|n\/a/);
  assert.match(renderDocument(document).html, /id="section-1"/);
  // An effective legacy revision can restore an omitted section without shifting IDs.
  const restored = articleParts(a).map((p) =>
    p.id === "section-0" ? { ...p, text: "- 5 Source Marks" } : p,
  );
  assert.match(
    documentText(baselineDocument(a, restored).content),
    /Rewards.*5 Source Marks/,
  );
});

test("blank table cells round-trip without inventing values or losing populated rewards", () => {
  const table = {
    kind: "table",
    caption: "Rewards",
    columns: ["Mission", "Reward", "Unknown"],
  };
  const html = renderPart(table, "First |  | \nSecond | 5 Source Marks | ");
  assert.match(html, /<td><\/td>/);
  assert.match(html, /5/);
  assert.doesNotMatch(html, /Unknown|Not specified/);
  assert.throws(() => renderPart(table, "Missing columns"));
  assert.throws(() => renderPart({ kind: "links" }, "Map | "));
  const a = {
    slug: "Test",
    title: "Test",
    summary: "Summary",
    sections: [
      {
        title: "Rewards",
        items: [],
        table: {
          ...table,
          rows: [
            ["First", "", ""],
            ["Second", "5 Source Marks", ""],
          ],
        },
      },
    ],
  };
  const document = baselineDocument(a, articleParts(a));
  assert.doesNotMatch(documentText(document.content), /Unknown|Not specified/);
  assert.match(renderDocument(document).html, /<td[^>]*><p><\/p><\/td>/);
});

test("future source conversions discard backslash debris and unfilled reward entries", () => {
  const result = convertReference(
    "## Objectives\n\n- Finish the alert.\\\n\n## Rewards\n\n- n/a\\\n\n## Results\n\n| Name | Reward |\n| --- | --- |\n| First | |\n| Second | 5 Marks |",
    "https://dcuniverseonline.fandom.com/wiki/Test",
  );
  assert.ok(!result.sections.some((s) => s.title === "Rewards"));
  assert.equal(result.sections[0].items[0], "Finish the alert.");
  assert.ok(result.sections.find((s) => s.table).table.rows[0].includes(""));
});

test("the full catalog is clean, repeatable and retains matching currency restoration", () => {
  for (const a of articles) {
    assert.deepEqual(cleanImportedArticle(a), a, a.slug);
    for (const s of a.sections) {
      for (const i of s.items)
        assert.ok(!missingImportText(i), a.slug + ": " + i);
      for (const row of s.table?.rows || [])
        for (const cell of row)
          assert.ok(
            cell === "" || !missingImportText(cell),
            a.slug + ": " + cell,
          );
    }
    for (const p of articleParts(a)) {
      const c = contexts[a.slug]?.[p.id];
      if (c) assert.equal(c.base, p.text, a.slug + ": " + p.id);
    }
  }
  const coast = articles.find((a) => a.slug === "Disturbance_on_the_Coast");
  assert.deepEqual(coast.sections.find((s) => s.title === "Objectives").items, [
    "Restore Order in Coast City",
  ]);
  assert.equal(
    sectionHasContent(coast.sections.find((s) => s.title === "Rewards")),
    false,
  );
});

test("relaxed blank-cell parsing does not accept link/video formats the editor cannot load", () => {
  assert.throws(() =>
    renderPart(
      { kind: "videos" },
      "Title|https://www.youtube.com/watch?v=Yw2aiR3y5m8|Evidence",
    ),
  );
  assert.throws(() =>
    renderPart({ kind: "links" }, "Map|https://example.com/map.png"),
  );
  assert.match(
    renderPart(
      { kind: "videos" },
      "Title | https://www.youtube.com/watch?v=Yw2aiR3y5m8 | Evidence",
    ),
    /youtube/,
  );
});
