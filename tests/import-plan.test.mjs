import test from "node:test";
import assert from "node:assert/strict";
import { importPlan, reusableCache } from "../scripts/import-plan.mjs";
const url = "https://dcuniverseonline.fandom.com/wiki/Artifacts";
test("inventory batches select only unreviewed articles with bounded attempts", () => {
  const plan = importPlan(["--inventory", "25", "--dry-run"], {
    entries: [
      { kind: "article", status: "unreviewed", url },
      { kind: "article", status: "unreviewed", url: url + "#A" },
      { kind: "article", status: "published", url: url + "2" },
      { kind: "support", status: "unreviewed", url: url + "3" },
    ],
  });
  assert.deepEqual(plan.urls, [url]);
  assert.equal(plan.limit, 25);
  assert.equal(plan.dryRun, true);
  for (const n of ["0", "101", "-1", "1.5", "all"])
    assert.throws(() => importPlan(["--inventory", n], { entries: [] }));
  assert.throws(() =>
    importPlan(["--inventory", "1", "--refresh"], { entries: [] }),
  );
  assert.throws(() => importPlan(["--unknown", url]));
  assert.throws(() => importPlan(["https://example.com/wiki/Artifacts"]));
});
test("cache reuse rejects HTTP errors even when an error page contains text", () => {
  const record = { url, status: "needs-review", markdown: "Example body" };
  assert.equal(reusableCache(record, url), true);
  assert.equal(
    reusableCache({ ...record, metadata: { statusCode: 404 } }, url),
    false,
  );
  assert.equal(reusableCache({ ...record, markdown: " " }, url), false);
  assert.equal(reusableCache({ ...record, status: "published" }, url), false);
});
