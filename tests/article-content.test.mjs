import { test } from "node:test";
import assert from "node:assert/strict";
import { renderPart } from "../shared/article-content.mjs";
test("published text is escaped and tables retain their shape", () => {
  assert.equal(
    renderPart({ kind: "text" }, "<script>alert(1)</script>"),
    "&lt;script&gt;alert(1)&lt;/script&gt;",
  );
  assert.match(
    renderPart({ kind: "items" }, "- <img src=x onerror=alert(1)>"),
    /&lt;img/,
  );
  const table = {
    kind: "table",
    caption: "Combos",
    columns: ["Weapon", "Combo"],
  };
  assert.match(renderPart(table, "Bow | Jump shot"), /<td>Jump shot<\/td>/);
  assert.throws(() => renderPart(table, "Missing column"));
  assert.throws(() =>
    renderPart({ kind: "links" }, "Map | javascript:alert(1)"),
  );
  assert.equal(renderPart({ kind: "videos" }, ""), "");
});
