import test from "node:test";
import assert from "node:assert/strict";
import { htmlTables } from "../scripts/html-tables.mjs";
test("merged combo labels stay attached to every command", () => {
  const [rows] = htmlTables(
    '<table><tr><th>Power</th><th>Construct</th><th>Command</th></tr><tr><td rowspan="3">Chainsaw</td><td rowspan="2">Chainsaw</td><td>Tap</td></tr><tr><td>Hold</td></tr><tr><td>Ram</td><td>Range</td></tr></table>',
  );
  assert.deepEqual(rows.slice(1), [
    ["Chainsaw", "Chainsaw", "Tap"],
    ["Chainsaw", "Chainsaw", "Hold"],
    ["Chainsaw", "Ram", "Range"],
  ]);
});
test("table parsing is inert and rejects invalid spans", () => {
  assert.equal(
    htmlTables(
      "<table><tr><td><script>alert(1)</script>Safe<br>text</td></tr></table>",
    )[0][0][0],
    "Safe; text",
  );
  assert.throws(
    () =>
      htmlTables('<table><tr><td rowspan="2">Missing row</td></tr></table>'),
    /exceeds/,
  );
});
