import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import report from "../data/migration/catalog.json" with { type: "json" };
import existing from "../src/data/articles.json" with { type: "json" };
import releases from "../src/data/releases.json" with { type: "json" };
import { catalogArticles } from "../scripts/catalog-files.mjs";
import { issuesFor } from "../scripts/content-policy.mjs";
import { classifyURL } from "../scripts/wiki-urls.mjs";
import prior from "../data/migration/prior-captures.json" with { type: "json" };
test("earlier source captures are also filed without duplicate cache-file entries", () => {
  const records = [...report.records, ...prior.records].filter(
    (r) => r.captureFile && r.filedCapture,
  );
  assert.equal(new Set(records.map((r) => r.captureFile)).size, records.length);
  for (const row of prior.records) {
    assert.ok(row.category && row.type && row.reason);
    assert.ok(row.filedCapture?.startsWith(".import-cache/filed/"));
  }
});
test("every downloaded record is filed once with a disposition and source evidence", async () => {
  const urls = new Set();
  const statuses = new Set([
    "converted",
    "already-published",
    "canonical-alias",
    "held",
    "failed",
    "missing",
  ]);
  const filed = (
    await Promise.all(
      (await fs.readdir("data/migration/filed")).map(async (f) =>
        JSON.parse(await fs.readFile("data/migration/filed/" + f, "utf8")),
      ),
    )
  ).flat();
  assert.equal(filed.length, report.records.length);
  assert.equal(new Set(filed.map((r) => r.url)).size, report.records.length);
  for (const row of report.records) {
    assert.ok(!urls.has(row.url), row.url);
    urls.add(row.url);
    assert.ok(statuses.has(row.status), row.url);
    assert.ok(row.category && row.type && row.reason, row.url);
    if (!["failed", "missing"].includes(row.status)) {
      assert.match(row.captureHash, /^[a-f0-9]{64}$/);
      assert.ok(row.captureFile?.startsWith(".import-cache/"));
    }
  }
});
test("converted catalog passes policy, has real releases and cannot replace existing slugs", async () => {
  const catalog = await catalogArticles();
  const slugs = new Set(existing.map((a) => a.slug)),
    ids = new Set(releases.map((r) => r.id));
  const oldSources = new Set(existing.map((a) => classifyURL(a.source).url));
  for (const a of catalog) {
    assert.deepEqual(issuesFor(a), [], a.slug);
    assert.ok(!slugs.has(a.slug), a.slug);
    slugs.add(a.slug);
    assert.ok(!oldSources.has(classifyURL(a.source).url), a.slug);
    assert.ok(a.type && a.classification?.reason, a.slug);
    assert.ok(
      a.releaseIds?.length && a.releaseIds.every((id) => ids.has(id)),
      a.slug,
    );
    const row = report.records.find(
      (r) => r.status === "converted" && r.canonical === a.source,
    );
    assert.ok(row?.parts.includes(a.slug), a.slug);
  }
});
test("filed articles use final source categories, including vendor identities and housing", async () => {
  const catalog = await catalogArticles();
  for (const slug of [
    "Apokolips_Logistics_Terminal_Vendor",
    "Blue_Beetle_Vendor",
  ]) {
    const a = catalog.find((a) => a.slug === slug);
    assert.deepEqual([a.category, a.type], ["Characters", "Vendors"]);
  }
  for (const slug of [
    "Amenity_R_D_Vendor",
    "Amenity_Soder_Vendor",
    "Amenity_Teleporter",
  ])
    assert.equal(catalog.find((a) => a.slug === slug).category, "Housing");
  const rows = new Map(
    report.records
      .filter((r) => r.status === "converted")
      .map((r) => [r.canonical, r]),
  );
  for (const a of catalog) {
    const row = rows.get(a.source);
    assert.deepEqual([a.category, a.type], [row.category, row.type], a.slug);
  }
});
