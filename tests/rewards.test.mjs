import test from "node:test";
import assert from "node:assert/strict";
import { rewardAtoms } from "../scripts/build-reward-context.mjs";
import { renderCurrencyText } from "../shared/rewards.mjs";
import { articleParts, renderPart } from "../shared/article-content.mjs";
import articles from "../src/data/articles.json" with { type: "json" };
test("icon-only amounts recover exact source currency without duplicating named/plural labels", () => {
  const icons = new Map([
    ["SourceMark.png", "Source Mark"],
    ["Ra.png", "Coin of Ra"],
  ]);
  const md =
    "## Rewards\n\n- 5 [![SourceMark](https://static.wikia.nocookie.net/dcuo/images/2/27/SourceMark.png)](https://example.com)\n- 8 Coins of Ra [![Ra](https://static.wikia.nocookie.net/dcuo/images/2/27/Ra.png)](https://example.com)";
  const { atoms } = rewardAtoms(md, icons);
  assert.equal(atoms[0].base, "5");
  assert.equal(atoms[0].restored, "5 Source Mark");
  assert.equal(atoms[1].restored, "8 Coins of Ra");
});
test("currency labels and locally hosted icons are safe, and edited amounts do not inherit stale labels", () => {
  const html = renderCurrencyText(
    "<script>alert(1)</script> 8 Marks of Victory and 2 Source Marks",
  );
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>"));
  assert.match(html, /images\.dcuo-wiki\.com/);
  assert.match(html, /Historical currency/);
  assert.equal((html.match(/<img/g) || []).length, 2);
  const a = articles.find((a) => a.slug === "BOUNTY_New_Genesis_Protector");
  const part = articleParts(a).find((p) => p.title === "Rewards");
  assert.ok(part);
  assert.match(renderPart(part, part.text, { slug: a.slug }), /1.*Source Mark/);
  const changed = renderPart(part, "- 12 <img src=x onerror=bad()>", {
    slug: a.slug,
  });
  assert.ok(!changed.includes("Source Mark"));
  assert.ok(changed.includes("&lt;img"));
});
test("explicit currency names win over conflicting source icons", () => {
  const icons = new Map([
    ["Daemohedron.png", "Daemohedron"],
    ["DarkMetalCoin.png", "Dark Metal Coin"],
  ]);
  const { atoms } = rewardAtoms(
    "- 8 Daemohedrons ![Coin](https://static.wikia.nocookie.net/dcuo/images/a/ab/DarkMetalCoin.png)",
    icons,
  );
  assert.equal(atoms[0].restored, "8 Daemohedrons");
});
