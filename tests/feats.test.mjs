import { missingImportText } from "../shared/import-text.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import {
  parseFeats,
  parseProseFeats,
  estimateDifficulty,
  completionSteps,
  featReleaseIDs,
  guideMatchesFeat,
} from "../scripts/feat-content.mjs";
import { featURL, featLinks } from "../scripts/download-feats.mjs";
import { difficultyMeter, renderFeatText } from "../shared/feat-meter.mjs";
import { articleParts, renderPart } from "../shared/article-content.mjs";
import { baselineDocument, renderDocument } from "../shared/rich-article.mjs";
import articles from "../src/data/articles.json" with { type: "json" };
import catalog from "../src/data/feats.json" with { type: "json" };
const source = "https://dcuniverseonline.fandom.com/wiki/Example_Feats";
test("feat conversion retains lists, conditions, rewards, source links, and rowspans", () => {
  const html = `<h2><span id="Raid">Raid feats</span></h2><table><tr><th>Title</th><th>Description</th><th>Reward</th><th>Faction</th></tr><tr><td rowspan="2">No escape</td><td>Win without knockouts.<ul><li>Defeat A</li><li>Defeat B</li></ul><a href="/wiki/Boss">Boss</a></td><td>25 Points</td><td>Hero</td></tr><tr><td>Finish within 5 minutes.</td><td>50 Points</td><td>Villain</td></tr><tr><td>Empty</td><td>???</td><td>10 Points</td><td>Both</td></tr></table>`;
  const r = parseFeats(html, source);
  assert.equal(r.records.length, 2);
  assert.equal(r.rejected.length, 1);
  assert.equal(r.records[0].points, 25);
  assert.match(r.records[0].requirement, /Defeat A.*Defeat B/);
  assert.equal(
    r.records[0].links[0].url,
    "https://dcuniverseonline.fandom.com/wiki/Boss",
  );
  assert.equal(r.records[1].title, "No escape");
  assert.equal(r.records[1].extra[0], "Faction: Villain");
  assert.match(r.records[1].source, /#Raid$/);
});
test("difficulty is independent of points and its meter cannot inject HTML", () => {
  const f = {
    requirement: "Complete the Raid without anyone being knocked out.",
    context: "Raids",
    points: 10,
  };
  assert.deepEqual(
    estimateDifficulty(f),
    estimateDifficulty({ ...f, points: 100 }),
  );
  assert.equal(estimateDifficulty(f).level, 4);
  assert.equal(
    estimateDifficulty({
      requirement: "Defeat the Elite+ boss.",
      context: "Feats",
    }).level,
    5,
  );
  assert.equal(
    estimateDifficulty({
      requirement: "Collect 1 base item.",
      context: "Feats",
    }).level,
    1,
  );
  assert.equal(
    estimateDifficulty({
      requirement: "Collect 1 Base Item from the 2026 event vendor.",
      context: "Feats",
    }).level,
    1,
  );
  assert.equal(
    estimateDifficulty({
      requirement: "Create a Might of Krypton Weapon (Elite).",
      context: "Feats",
    }).level,
    2,
  );
  assert.equal(
    estimateDifficulty({
      requirement: "Defeat 1,000 enemies.",
      context: "Feats",
    }).level,
    3,
  );
  assert.match(difficultyMeter(3, "Demanding"), /aria-valuenow="3"/);
  assert.equal(
    (difficultyMeter(3, "Demanding").match(/class="filled"/g) || []).length,
    3,
  );
  assert.ok(!difficultyMeter(2, "<script>").includes("<script>"));
  assert.throws(() => difficultyMeter(9, "Bad"));
  assert.equal(renderFeatText("<script>"), "&lt;script&gt;");
});
test("source discovery includes singular feat pages and excludes redlinks, credentials and namespaces", () => {
  assert.equal(
    featURL("/wiki/Test_(Feat)"),
    "https://dcuniverseonline.fandom.com/wiki/Test_(Feat)",
  );
  assert.equal(featURL("/wiki/Category:Feats"), null);
  assert.equal(featURL("https://evil.example/wiki/Feats"), null);
  assert.deepEqual(
    featLinks(
      '<a href="/wiki/Test_Feats">Yes</a><a class="new" href="/wiki/Empty_Feats">No</a>',
    ),
    ["https://dcuniverseonline.fandom.com/wiki/Test_Feats"],
  );
});
test("completion plans retain the exact requirement and explain stated restrictions", () => {
  const f = {
    requirement: "Complete the raid without knockouts in under 5 minutes.",
  };
  const s = completionSteps(f);
  assert.equal(s[0], "Complete the stated objective: " + f.requirement);
  assert.ok(s.some((x) => x.includes("time limit")));
  assert.ok(s.some((x) => x.includes("failure condition")));
  assert.ok(s.at(-1).includes("not a verified encounter walkthrough"));
});
test("all catalog entries resolve to editable guides with independent accessible difficulty meters", () => {
  const ids = new Set();
  for (const f of catalog.feats) {
    assert.ok(!ids.has(f.id), f.id);
    ids.add(f.id);
    const a = articles.find((a) => a.slug === f.guide);
    assert.ok(a, f.guide);
    assert.equal(a.category, "Feats");
    const anchor = f.href.match(/section-(\d+)$/);
    if (anchor) {
      const idx = Number(anchor[1]);
      assert.equal(a.sections[idx].title, f.title);
      assert.ok(
        a.sections[idx].items.includes("Requirement: " + f.requirement),
      );
      assert.equal(
        a.sections[idx].items.includes("Feat reward: " + f.reward),
        !missingImportText(f.reward),
      );
    } else {
      assert.ok(
        a.sections.some((s) =>
          /^(?:Objectives?|Feat Description)/.test(s.title),
        ),
      );
    }
    assert.ok(f.difficulty.level >= 1 && f.difficulty.level <= 5);
  }
  const a = articles.find((a) => a.slug === catalog.feats[0].guide);
  const parts = articleParts(a);
  const body = parts
    .filter((p) => p.kind === "items")
    .map((p) => renderPart(p, p.text))
    .join("");
  assert.match(body, /role="meter"/);
  assert.match(renderDocument(baselineDocument(a, parts)).html, /role="meter"/);
  assert.equal(articles.filter((a) => a.category === "Progression").length, 0);
});

test("feat release association prefers exact releases and excludes generic event links", () => {
  const releases = [
    {
      id: "episode-20",
      kind: "episode",
      number: 20,
      title: "Blackest Night & Wastelands Wonderland",
      source: "https://dcuniverseonline.fandom.com/wiki/Episode_20",
    },
    {
      id: "winter",
      kind: "event",
      title: "Season's Greedings",
      source: "https://dcuniverseonline.fandom.com/wiki/Season's_Greedings",
    },
    {
      id: "gifts",
      kind: "event",
      title: "Gifts",
      source: "https://dcuniverseonline.fandom.com/wiki/Events",
    },
  ];
  assert.deepEqual(featReleaseIDs("Episode 20 Feats", [], releases), [
    "episode-20",
  ]);
  assert.deepEqual(
    featReleaseIDs(
      "Season's Greedings Feats",
      ["https://dcuniverseonline.fandom.com/wiki/Events"],
      releases,
    ),
    ["winter"],
  );
  assert.deepEqual(
    featReleaseIDs(
      "General Feats",
      ["https://dcuniverseonline.fandom.com/wiki/Events"],
      releases,
    ),
    [],
  );
});

test("difficulty follows the lowest permitted encounter variant and recognizes late Survival levels", () => {
  assert.equal(
    estimateDifficulty({
      requirement: "Defeat the boss in the Raid (Normal or Elite).",
    }).level,
    3,
  );
  assert.equal(
    estimateDifficulty({
      requirement: "Defeat the boss in the Raid (Elite or Elite Plus).",
    }).level,
    4,
  );
  assert.equal(
    estimateDifficulty({
      requirement:
        "Sixth Dimension Superman defeated in level 30 of Survival Mode.",
    }).level,
    5,
  );
});

test("feat titles containing literal punctuation remain part of the path", () => {
  assert.equal(
    featURL("/wiki/Bat-Men%3F_(Feat)"),
    "https://dcuniverseonline.fandom.com/wiki/Bat-Men%3F_(Feat)",
  );
});

test("gameplay feat titles may contain colons without becoming namespaces", () => {
  assert.equal(
    featURL("/wiki/Street_Art%3A_Bad_Seeds_Graffiti_(Feat)"),
    "https://dcuniverseonline.fandom.com/wiki/Street_Art%3A_Bad_Seeds_Graffiti_(Feat)",
  );
  assert.equal(featURL("/wiki/File:Feat_image.png"), null);
});

test("same-name feats cannot steal an unrelated walkthrough", () => {
  const f = {
    title: "Chillin' Like a Villain",
    requirement: "Defeat Penguin in the Iceberg Lounge.",
    links: [],
  };
  assert.equal(
    guideMatchesFeat(f, {
      title: "Chillin like a Villain",
      requirement: "Collect the seasonal hairstyles and helmets.",
      source,
    }),
    false,
  );
  assert.equal(
    guideMatchesFeat(
      { ...f, links: [{ url: source }] },
      { title: "A different source heading", requirement: "", source },
    ),
    true,
  );
  const req = "Collect all styles in the Celtic set";
  assert.equal(
    guideMatchesFeat(
      { title: "Fancy Lad", requirement: req, links: [] },
      {
        title: "Fancy Lad",
        requirement: req + "; Head; Waist; Shoulders",
        source,
      },
    ),
    true,
  );
});

test("quick-objective planning excludes cache rewards, repeat counters, groups and archived sources", async () => {
  const { featEffort, featSession } =
    await import("../shared/feat-planning.mjs");
  const base = {
    id: "a",
    title: "Find the landmark",
    requirement: "Visit the Bat-Signal.",
    context: "Exploration",
    group: "Exploration Feats",
    points: 10,
    difficulty: { level: 1 },
    href: "/wiki/Example/",
  };
  assert.equal(featEffort(base).quick, true);
  const instance = featEffort({
    ...base,
    requirement: "Explore the Batcave Outer Caverns",
    extra: ["Category: Alerts & Raids"],
  });
  assert.equal(instance.quick, false);
  assert.ok(instance.flags.includes("Group / instance conditions"));
  for (const requirement of [
    "Activate any compartment trinket sold by Quick Lee",
    "Find and disarm 50 Gang War bombs",
    "Find and close 42 time portals",
    "Open the Outsiders Ops 2024 - Skill Cache",
    "Collect all styles in the Celtic set",
    "Defeat the bounty 25 times",
    "Complete the Raid",
    "Fortify an artifact to rank 200",
  ])
    assert.equal(
      featEffort({ ...base, requirement }).quick,
      false,
      requirement,
    );
  assert.equal(
    featEffort({ ...base, group: "Exploration Feats (Old)" }).archived,
    true,
  );
  const duplicate = { ...base, id: "b" };
  const other = { ...base, id: "c", title: "Another feat", points: 100 };
  const session = featSession([base, duplicate, other]);
  assert.equal(session.points, 110);
  assert.equal(session.skillPoints, 1);
  assert.equal(session.remainder, 10);
  assert.equal(session.bundles.length, 1);
});

test("a high-point boss or barrel counter cannot enter the quick-travel queue", async () => {
  const { featEffort } = await import("../shared/feat-planning.mjs");
  const base = {
    context: "Feats",
    group: "Classic Game",
    points: 50,
    difficulty: { level: 2 },
  };
  for (const requirement of [
    "Break 1000 Restoration barrels",
    "Atlantis: Defeat the Giant Brine Hulk [25/50]",
    "Defeat all enemies from the classic wanted poster missions",
  ])
    assert.equal(featEffort({ ...base, requirement }).quick, false);
});

test("reward line breaks preserve explicit point amounts", () => {
  const result = parseFeats(
    "<table><tr><th>Title</th><th>Description</th><th>Reward</th></tr><tr><td>Assembly Line</td><td>Create 100 items.</td><td>50<br>Points</td></tr></table>",
    source,
  );
  assert.equal(result.records[0].points, 50);
});
test("prose source checklists retain pieces and historical context", () => {
  const result = parseProseFeats(
    "For the updated, current version of this section, please see General Feats.\n\n## General: Cult Classic\n\nCollect all Base Items in the Occult set\n\n- Occult Chair\n- Occult Table\n\n_Reward: 25 feat points_",
    source,
  );
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].points, 25);
  assert.match(result.records[0].context, /old/);
  assert.ok(result.records[0].extra.some((t) => t.includes("Occult Chair")));
});

test("published feat sections contain no empty image placeholders", () => {
  for (const a of articles.filter((a) => a.category === "Feats"))
    for (const s of a.sections)
      if (s.images) assert.ok(s.images.length, a.slug + ": " + s.title);
});

test("a shared category link cannot attach an unrelated prose checklist", () => {
  const feat = {
    title: "Night Rider",
    requirement: "Collect all styles in the Shim'Tar Regalia set",
    links: [{ url: source }],
  };
  assert.equal(
    guideMatchesFeat(feat, {
      title: "Steel Soldier",
      requirement: "Collect all styles in the STEELsuit MK-1 set",
      source,
      allowDirect: false,
    }),
    false,
  );
  assert.equal(
    guideMatchesFeat(feat, {
      title: "Night Rider",
      requirement: "Collect all styles in the Shim'Tar Regalia set",
      source,
      allowDirect: false,
    }),
    true,
  );
});
