import { test } from "node:test";
import assert from "node:assert/strict";
import {
  canonicalCapture,
  convertCatalog,
} from "../scripts/catalog-convert.mjs";
import { catalogPlan } from "../scripts/catalog-plan.mjs";
const source = "https://dcuniverseonline.fandom.com/wiki/Weapons";
const intro =
  "Chosen during character creation, a character weapon defines their combat abilities. Each weapon offers both ranged and melee attacks with its own combo paths. Players can spend skill points to unlock weapon attacks and additional weapon trees after reaching the appropriate level.";
const capture = (markdown = intro) => ({
  url: source,
  retrieved: "2026-10-22",
  metadata: {
    statusCode: 200,
    url: "https://dcuniverseonline.fandom.com/wiki/Weapon_Types",
  },
  html: "<p>" + intro + "</p>",
  markdown,
});
test("canonical redirects produce one substantive article with canonical attribution", () => {
  const result = convertCatalog(capture(), { priority: 0, category: "Combat" });
  assert.equal(result.article.slug, "Weapon_Types");
  assert.equal(result.article.category, "Combat");
  assert.equal(
    result.article.source,
    "https://dcuniverseonline.fandom.com/wiki/Weapon_Types",
  );
  assert.deepEqual(result.article.sections[0].items, [intro]);
});
test("unclassified pages, disambiguation and incomplete artifact effects stay held", () => {
  assert.throws(
    () => convertCatalog(capture(), { priority: 1, category: "Quests" }),
    /classification/,
  );
  assert.throws(
    () =>
      convertCatalog(capture("This article is a disambiguation page"), {
        priority: 0,
        category: "Combat",
      }),
    /Disambiguation/,
  );
  assert.throws(
    () =>
      convertCatalog(
        capture(
          "The Item is an artifact recommended for any role.\n\n## Obtained from\n\nVendor.",
        ),
        { priority: 0, category: "Equipment" },
      ),
    /rank\/effect/,
  );
  assert.throws(
    () =>
      canonicalCapture({
        url: source,
        metadata: { ogUrl: "https://example.com/wiki/Test" },
      }),
    /outside/,
  );
});
test("maintenance text and empty table columns are omitted; useful references survive", () => {
  const result = convertCatalog(
    capture(
      "This article needs improvement in terms of information and/or appearance.\n\n" +
        intro +
        "\n\n## Attacks\n\n| Attack | Cost |\n| -- | -- |\n| [Combo](https://dcuniverseonline.fandom.com/wiki/Combo) | N/A |",
    ),
    { priority: 0, category: "Combat" },
  );
  assert.equal(result.article.summary, intro);
  assert.ok(
    result.article.sections.some((s) =>
      s.references?.some((r) => r.label === "Combo"),
    ),
  );
  assert.deepEqual(result.article.sections.find((s) => s.table).table.columns, [
    "Attack",
  ]);
  assert.ok(!JSON.stringify(result.article).includes("Source-listed entries"));
});
test("catalog planning prioritizes only inventory-backed foundations, excludes published sources and deduplicates references", () => {
  const url = (t) => "https://dcuniverseonline.fandom.com/wiki/" + t;
  const inventory = {
    entries: ["Weapons", "Gotham_City", "Other"].map((t) => ({
      url: url(t),
      kind: "article",
    })),
  };
  const articles = [
    {
      slug: "Gotham_City",
      source: url("Gotham_City"),
      category: "Locations",
      sections: [
        {
          title: "See also",
          references: [
            { url: url("Other") },
            { url: url("Other") },
            { url: url("Missing") },
          ],
        },
      ],
    },
  ];
  const plan = catalogPlan(articles, inventory);
  assert.deepEqual(
    plan.map((p) => p.title),
    ["Weapons", "Other"],
  );
  assert.deepEqual(
    plan.map((p) => p.priority),
    [0, 1],
  );
});

import {
  reusableCatalogCapture,
  resumableCatalogJob,
} from "../scripts/catalog-cache.mjs";
import { splitCatalogArticle } from "../scripts/catalog-convert.mjs";
import { baselineDocument } from "../shared/rich-article.mjs";
import { articleParts } from "../shared/article-content.mjs";
test("downloaded manifests cannot replace missing, truncated or changed captures", () => {
  assert.equal(reusableCatalogCapture(undefined, source), false);
  assert.equal(
    reusableCatalogCapture({ ...capture(), url: source }, source),
    true,
  );
  assert.equal(
    reusableCatalogCapture(
      { ...capture(), url: source },
      source,
      "different-hash",
    ),
    false,
  );
  assert.equal(
    reusableCatalogCapture({ ...capture(), url: source, html: "" }, source),
    false,
  );
  assert.equal(
    reusableCatalogCapture(
      { ...capture(), url: "https://example.com" },
      source,
    ),
    false,
  );
});
test("a completed batch with unread result pages remains resumable", () => {
  assert.equal(
    resumableCatalogJob({
      status: "completed",
      next: "https://api.firecrawl.dev/v2/batch/scrape/id?skip=50",
    }),
    true,
  );
  assert.equal(resumableCatalogJob({ status: "scraping" }), true);
  assert.equal(resumableCatalogJob({ status: "completed", next: null }), false);
  assert.equal(
    resumableCatalogJob({ status: "failed", next: "anything" }),
    false,
  );
});
test("large catalogs split into editable linked parts without dropping source sections", () => {
  const article = convertCatalog(capture(), {
    priority: 0,
    category: "Combat",
  }).article;
  article.sections = Array.from({ length: 170 }, (_, i) => ({
    title: "Entries " + i,
    items: [intro.repeat(12)],
  }));
  const parts = splitCatalogArticle(article);
  assert.ok(parts.length > 2);
  assert.deepEqual(
    parts.slice(1).flatMap((p) => p.sections),
    article.sections,
  );
  for (const a of parts)
    assert.doesNotThrow(() => baselineDocument(a, articleParts(a)));
  assert.equal(parts[0].related.length, parts.length - 1);
});
import { selectCatalogPublications } from "../scripts/catalog-convert.mjs";
test("publication retains every split part and skips the group only when its canonical source already exists", () => {
  const article = convertCatalog(capture(), {
    priority: 0,
    category: "Combat",
  }).article;
  article.sections = Array.from({ length: 170 }, (_, i) => ({
    title: "Entries " + i,
    items: [intro.repeat(12)],
  }));
  const entries = [{ article }, { article: { ...article, slug: "Redirect" } }];
  const selected = selectCatalogPublications(entries, []);
  assert.equal(selected.length, 1);
  assert.ok(selected[0].articles.length > 2);
  assert.deepEqual(
    selected[0].articles.slice(1).flatMap((a) => a.sections),
    article.sections,
  );
  assert.deepEqual(
    selectCatalogPublications(entries, [
      { source: article.source, slug: article.slug },
    ]),
    [],
  );
});
import { catalogReleaseIds } from "../scripts/catalog-publication.mjs";
test("generic foundation articles do not inherit releases from incidental examples", () => {
  const aliases = new Map([
    ["https://dcuniverseonline.fandom.com/wiki/Valentine", ["valentine"]],
    ["https://dcuniverseonline.fandom.com/wiki/Atlantis", ["episode-33"]],
  ]);
  assert.deepEqual(
    catalogReleaseIds(
      "Consumables include seasonal items from [Valentine](https://dcuniverseonline.fandom.com/wiki/Valentine).",
      "Equipment",
      aliases,
    ),
    ["game-systems"],
  );
  assert.deepEqual(
    catalogReleaseIds(
      "Atlantis is an open world zone for the episode [Atlantis](https://dcuniverseonline.fandom.com/wiki/Atlantis).",
      "Locations",
      aliases,
    ),
    ["episode-33"],
  );
  assert.deepEqual(
    catalogReleaseIds(
      "A city includes a portal to [Atlantis](https://dcuniverseonline.fandom.com/wiki/Atlantis).",
      "Locations",
      aliases,
    ),
    ["core-game"],
  );
});
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  recoverCatalogPublication,
  writeCatalogPublication,
} from "../scripts/catalog-publication.mjs";
test("publication recovers an interrupted multi-file write and refuses unrelated edits", async () => {
  const previous = process.cwd(),
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "dcuo-publication-"));
  try {
    process.chdir(directory);
    await fs.mkdir("src/data", { recursive: true });
    await fs.mkdir("data");
    const files = ["src/data/articles.json", "src/data/guide-releases.json"];
    await writeCatalogPublication(
      files.map((p) => [p, []]),
      "journal.json",
    );
    const hash = (s) => createHash("sha256").update(s).digest("hex");
    const rows = files.map((p) => ({
      path: p,
      before: hash("[]\n"),
      after: "[1]\n",
    }));
    await fs.writeFile("journal.json", JSON.stringify(rows));
    await fs.writeFile(files[0], "[1]\n");
    assert.equal(await recoverCatalogPublication("journal.json"), true);
    assert.equal(await fs.readFile(files[1], "utf8"), "[1]\n");
    assert.equal(await recoverCatalogPublication("journal.json"), false);
    await fs.writeFile("journal.json", JSON.stringify(rows));
    await fs.writeFile(files[1], "[2]\n");
    await assert.rejects(
      () => recoverCatalogPublication("journal.json"),
      /outside transaction/,
    );
    assert.equal(await fs.readFile(files[1], "utf8"), "[2]\n");
  } finally {
    process.chdir(previous);
    await fs.rm(directory, { recursive: true, force: true });
  }
});
import { localGuideLink } from "../shared/guide-links.mjs";
test("source-confirmed redirects link to canonical local guides without duplicate pages", () => {
  assert.equal(
    localGuideLink("https://dcuniverseonline.fandom.com/wiki/Abilities"),
    "/wiki/Powers/",
  );
  assert.equal(
    localGuideLink(
      "https://dcuniverseonline.fandom.com/wiki/Character_Customization",
    ),
    "/wiki/Styles/",
  );
  assert.equal(
    localGuideLink("https://dcuniverseonline.fandom.com/wiki/Weapons"),
    "/wiki/Weapon_Types/",
  );
  assert.equal(
    localGuideLink("https://dcuniverseonline.fandom.com/wiki/Base_Items"),
    "/wiki/Base_Items/",
  );
});
import {
  catalogProgress,
  omittedCatalogCaptures,
} from "../scripts/catalog-cache.mjs";
test("omitted batch targets are held and resumed progress retains prior failures", () => {
  const targets = [
    { url: source, priority: 0 },
    { url: "https://dcuniverseonline.fandom.com/wiki/Other", priority: 1 },
  ];
  const omitted = omittedCatalogCaptures(targets, [source], "2026-10-22");
  assert.deepEqual(
    omitted.map((r) => [r.url, r.status]),
    [[targets[1].url, "failed"]],
  );
  assert.deepEqual(
    catalogProgress({
      records: [{ url: source, status: "downloaded" }, ...omitted],
    }),
    { downloaded: 1, failedCaptures: 1 },
  );
});
import { acquireCatalogLock } from "../scripts/catalog-lock.mjs";
test("download writers exclude one another until the owning lock is released", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "dcuo-lock-"));
  const lock = path.join(dir, "writer.lock");
  try {
    const release = acquireCatalogLock(lock);
    assert.throws(() => acquireCatalogLock(lock), /lock exists/);
    release();
    release();
    const next = acquireCatalogLock(lock);
    await fs.writeFile(lock, "external owner");
    next();
    assert.equal(await fs.readFile(lock, "utf8"), "external owner");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
test("terminal failure holds survive an interrupted job checkpoint in the actual downloader", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "dcuo-checkpoint-"));
  try {
    await fs.mkdir(path.join(dir, "src/data"), { recursive: true });
    await fs.mkdir(path.join(dir, "data"));
    await fs.writeFile(path.join(dir, "src/data/articles.json"), "[]");
    await fs.writeFile(
      path.join(dir, "data/inventory.json"),
      JSON.stringify({
        entries: [
          {
            url: "https://dcuniverseonline.fandom.com/wiki/Stats",
            kind: "article",
          },
        ],
      }),
    );
    const fixture = path.join(dir, "simulate.mjs");
    await fs.writeFile(
      fixture,
      `import fs from 'node:fs/promises';
const rename=fs.rename.bind(fs);let writes=0;
fs.rename=async(a,b)=>{if(b.endsWith('background-job.json')&&++writes===2)throw Error('Simulated checkpoint interruption');return rename(a,b);};
globalThis.fetch=async(url,options)=>new Response(JSON.stringify(options.method==='POST'?{success:true,id:'test-job'}:{status:'completed',data:[],completed:1,total:1}),{status:200,headers:{'content-type':'application/json'}});`,
    );
    const cli = fileURLToPath(
      new URL("../scripts/download-catalog.mjs", import.meta.url),
    );
    const result = spawnSync(
      process.execPath,
      [
        "--import",
        fixture,
        cli,
        "--background-progress",
        "--write",
        "--limit",
        "1",
      ],
      {
        cwd: dir,
        encoding: "utf8",
        env: { ...process.env, FIRECRAWL_API_KEY: "test-key" },
      },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Simulated checkpoint interruption/);
    const manifest = JSON.parse(
      await fs.readFile(
        path.join(dir, ".import-cache/catalog/download-progress.json"),
        "utf8",
      ),
    );
    assert.equal(manifest.records[0].status, "failed");
    const job = JSON.parse(
      await fs.readFile(
        path.join(dir, ".import-cache/catalog/background-job.json"),
        "utf8",
      ),
    );
    assert.equal(job.status, "scraping");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
