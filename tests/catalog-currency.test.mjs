import test from "node:test";
import assert from "node:assert/strict";
import { convertReference } from "../scripts/convert-reference.mjs";
import { renderPart } from "../shared/article-content.mjs";
const cash =
  "![Cash](https://static.wikia.nocookie.net/dcuo/images/b/b7/MoneyPickup.png)";
test("new source tables retain currency names from icons and render hosted currency symbols", () => {
  const result = convertReference(
    "## Vendor prices\n\n| Item | Cost |\n| --- | --- |\n| Example | 1500 " +
      cash +
      " |",
    "https://dcuniverseonline.fandom.com/wiki/Vendor",
    { currencies: true },
  );
  const table = result.sections.find((s) => s.table).table;
  assert.equal(table.rows[0][1], "1500 Cash");
  assert.ok(!result.images.length);
  const html = renderPart(
    {
      id: "table-0",
      kind: "table",
      title: "Vendor prices",
      columns: table.columns,
    },
    "Example | 1500 Cash",
  );
  assert.match(html, /reward-currency/);
  assert.match(html, /images\.dcuo-wiki\.com/);
});
test("explicit currency labels win and the legacy extraction baseline stays unchanged", () => {
  const markdown = "## Rewards\n\n- 10 Source Marks " + cash;
  const restored = convertReference(
    markdown,
    "https://dcuniverseonline.fandom.com/wiki/Test",
    { currencies: true },
  );
  assert.equal(restored.sections[0].items[0], "10 Source Marks");
  const legacy = convertReference(
    "## Rewards\n\n- 1500 " + cash,
    "https://dcuniverseonline.fandom.com/wiki/Test",
  );
  assert.equal(legacy.sections[0].items[0], "1500");
});

test("currency mentions do not erase separate prices in prose or nested lists", () => {
  const mark =
    "![SourceMark](https://static.wikia.nocookie.net/dcuo/images/2/27/SourceMark.png)";
  const result = convertReference(
    "## Comparison\n\n- Elite gear requires renown; styles cost " +
      mark +
      " 80.\n  - The original set costs " +
      mark +
      " 104 and this one " +
      mark +
      " 52.\n\n- 10 Source Marks " +
      mark +
      ", plus 1500 " +
      cash,
    "https://dcuniverseonline.fandom.com/wiki/Vendor",
    { currencies: true },
  );
  const text = result.sections[0].items.join(" ");
  assert.match(text, /Source Marks? 80/);
  assert.match(text, /Source Marks? 104/);
  assert.match(text, /Source Marks? 52/);
  assert.match(text, /10 Source Marks\s*, plus 1500 Cash/);
});
