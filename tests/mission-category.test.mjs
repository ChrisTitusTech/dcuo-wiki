import test from "node:test";
import assert from "node:assert/strict";
import {
  parseMissionCategory,
  missionCategory,
} from "../scripts/mission-category.mjs";
const fixture = `<a href="/wiki/Noise">Unrelated navigation</a>
<a class="category-page__member-link" href="/wiki/Quest_(Hero)">Quest</a>
<a class="category-page__member-link" href="/wiki/Quest_(Hero)">Duplicate</a>
<a class="category-page__member-link" href="/wiki/Category:Hero_Missions">Category</a>
<p class="category-page__total-number">All items (1,130)</p>`;
test("category discovery excludes navigation, deduplicates and separates support entries", () => {
  const result = parseMissionCategory(fixture);
  assert.equal(result.total, 1130);
  assert.equal(result.entries.length, 2);
  assert.deepEqual(
    result.entries.map((e) => e.kind),
    ["article", "support"],
  );
  assert.equal(result.nextUrl, null);
});
test("category pagination preserves its cursor and rejects unexpected destinations", () => {
  const link = (url) =>
    `<a class="category-page__pagination-next" href="${url}">Next</a>`;
  assert.equal(
    parseMissionCategory(
      fixture + link(missionCategory + "?from=Campaign+Reform"),
    ).nextUrl,
    missionCategory + "?from=Campaign+Reform",
  );
  for (const url of [
    "https://example.com/wiki/Category:Missions?from=X",
    missionCategory,
    "https://dcuniverseonline.fandom.com/wiki/Other?from=X",
  ])
    assert.throws(
      () => parseMissionCategory(fixture + link(url)),
      /Unexpected/,
    );
});
test("empty or truncated category captures cannot claim completion", () => {
  assert.throws(() => parseMissionCategory("<p>Blocked</p>"), /Missing/);
  assert.throws(
    () =>
      parseMissionCategory(
        '<p class="category-page__total-number">All items (1130)</p>',
      ),
    /Missing/,
  );
});
