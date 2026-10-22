import test from "node:test";
import assert from "node:assert/strict";
import articles from "../src/data/articles.json" with { type: "json" };
import {
  localGuideLink,
  guideReferenceLink,
  guideTitleLink,
  guideTextParts,
} from "../shared/guide-links.mjs";
import { articleParts, renderPart } from "../shared/article-content.mjs";
import {
  baselineDocument,
  renderDocument,
  validateDocument,
} from "../shared/rich-article.mjs";
const base = "https://dcuniverseonline.fandom.com/wiki/";
test("source links resolve published pages, encoding and real section anchors", () => {
  assert.equal(
    localGuideLink(base + "Alert_T1%3A_STAR_Labs_Research_Facility"),
    "/wiki/Alert_T1_STAR_Labs_Research_Facility/",
  );
  assert.equal(
    localGuideLink(base + "Disturbance_on_the_Coast#Objectives"),
    "/wiki/Disturbance_on_the_Coast/#section-2",
  );
  assert.equal(
    localGuideLink(base + "Disturbance_on_the_Coast#Missing_heading"),
    "/wiki/Disturbance_on_the_Coast/",
  );
  for (const value of [
    base + "Not_Published",
    base + "Powers?action=history",
    "https://evil.example/wiki/Powers",
    "javascript:alert(1)",
  ])
    assert.equal(localGuideLink(value), null);
  assert.equal(
    guideReferenceLink(base + "Powers?action=history"),
    base + "Powers?action=history",
  );
});
test("generic faction mission names require a known faction and preserve explicit variants", () => {
  assert.equal(
    guideTitleLink("Duo T1: Ferris Aircraft"),
    "/wiki/Duo_T1_Ferris_Aircraft/",
  );
  const link = base + "Alert_T1:_Oan_Sciencells";
  assert.equal(
    localGuideLink(link, { slug: "Disturbance_on_the_Coast" }),
    "/wiki/Alert_T1_Oan_Sciencells_Heroes/",
  );
  assert.equal(
    localGuideLink(link, { faction: "Villains" }),
    "/wiki/Alert_T1_Oan_Sciencells_Villains/",
  );
  assert.equal(localGuideLink(link), null);
  assert.equal(
    localGuideLink(link + "_(Villains)", { faction: "Heroes" }),
    "/wiki/Alert_T1_Oan_Sciencells_Villains/",
  );
});
test("source fragments choose the correct continuation rather than always part one", () => {
  const page = articles.find((a) => a.slug === "Allies_Feats_3");
  const section = page.sections.find(
    (s) =>
      !articles
        .find((a) => a.slug === "Allies_Feats_1")
        .sections.some((t) => t.title === s.title),
  );
  assert.ok(section);
  assert.equal(
    localGuideLink(
      page.source +
        "#" +
        encodeURIComponent(section.title.replaceAll(" ", "_")),
    ),
    "/wiki/" + page.slug + "/#section-" + page.sections.indexOf(section),
  );
});
test("plain See also entries become safe local links, with source labels taking precedence", () => {
  const a = articles.find((a) => a.slug === "Disturbance_on_the_Coast");
  const s = a.sections.find((s) => s.title === "See also");
  const p = articleParts(a).find((p) => p.title === "See also");
  const html = renderPart(p, p.text, {
    slug: a.slug,
    references: s.references,
  });
  for (const slug of [
    "Duo_T1_Ferris_Aircraft",
    "Alert_T1_STAR_Labs_Research_Facility",
    "Alert_T1_Oan_Sciencells_Heroes",
  ])
    assert.ok(html.includes('href="/wiki/' + slug + '/"'));
  assert.ok(!html.includes("fandom.com"));
  assert.deepEqual(
    guideTextParts(
      "Powers",
      [{ label: "Powers", url: base + "Disturbance_on_the_Coast" }],
      { seeAlso: true },
    ),
    [{ text: "Powers", href: "/wiki/Disturbance_on_the_Coast/" }],
  );
  assert.deepEqual(
    guideTextParts(
      "Powers",
      [{ label: "Powers", url: base + "Unpublished_Disambiguation" }],
      { seeAlso: true },
    ),
    [{ text: "Powers" }],
  );
  const attack = renderPart(
    { kind: "items", title: "See also" },
    "- <script>bad()</script>",
  );
  assert.ok(!attack.includes("<script>"));
  const sentence = guideTextParts("Firefighter Powers, Powers.", [
    { label: "Powers", url: base + "Powers" },
  ]);
  assert.equal(sentence.filter((p) => p.href).length, 2);
});
test("editor baselines and existing published documents both display local links without rewriting stored data", () => {
  const a = articles.find((a) => a.slug === "Disturbance_on_the_Coast");
  const baseline = baselineDocument(a, articleParts(a));
  assert.ok(
    renderDocument(baseline, { slug: a.slug }).html.includes(
      `href="${a.source}" rel="noreferrer">Location evidence</a>`,
    ),
  );
  assert.match(
    JSON.stringify(baseline),
    /\/wiki\/Alert_T1_Oan_Sciencells_Heroes\//,
  );
  const doc = validateDocument({
    version: 1,
    title: "Test",
    summary: "Summary",
    content: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "See also" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Duo T1: Ferris Aircraft" }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Power guide",
              marks: [{ type: "link", attrs: { href: base + "Powers" } }],
            },
          ],
        },
        { type: "codeBlock", content: [{ type: "text", text: "Powers" }] },
      ],
    },
  });
  const before = JSON.stringify(doc);
  const html = renderDocument(doc, { slug: a.slug }).html;
  assert.match(html, /href="\/wiki\/Duo_T1_Ferris_Aircraft\/"/);
  assert.match(html, /href="\/wiki\/Powers\/"/);
  assert.match(html, /<pre><code>Powers<\/code><\/pre>/);
  assert.equal(JSON.stringify(doc), before);
});
test("every resolved catalog reference links to an existing local article", () => {
  let count = 0;
  const slugs = new Set(articles.map((a) => a.slug));
  for (const a of articles)
    for (const s of a.sections)
      for (const r of s.references || []) {
        const link = localGuideLink(r.url, { slug: a.slug });
        if (link) {
          assert.ok(slugs.has(link.split("/")[2]), r.url);
          count++;
        }
      }
  assert.ok(count > 3000, count);
});

test("repeated source labels never choose an arbitrary faction", () => {
  assert.deepEqual(guideTextParts(""), []);
  const refs = [
    { label: "Oan", url: base + "Alert_T1:_Oan_Sciencells_(Heroes)" },
    { label: "Oan", url: base + "Alert_T1:_Oan_Sciencells_(Villains)" },
  ];
  assert.deepEqual(guideTextParts("Oan", refs), [{ text: "Oan" }]);
  assert.deepEqual(guideTextParts("Oan", refs, { faction: "Villains" }), [
    { text: "Oan", href: "/wiki/Alert_T1_Oan_Sciencells_Villains/" },
  ]);
});

test("unpublished alternatives still make identical labels ambiguous", () => {
  const a = articles.find((a) => a.slug === "Assist_Atlanteans");
  const s = a.sections.find(
    (s) => s.references?.filter((r) => r.label === "Atlantis").length > 1,
  );
  assert.ok(s);
  assert.deepEqual(
    guideTextParts("in Atlantis", s.references, { slug: a.slug }),
    [{ text: "in Atlantis" }],
  );
  assert.equal(localGuideLink(base + "Buzz_Kill", { faction: "Heroes" }), null);
  assert.equal(guideTitleLink("Buzz Kill"), null);
  assert.equal(
    guideTitleLink("Buzz Kill", { faction: "Villains" }),
    "/wiki/Buzz_Kill_Villains/",
  );
});

test("table cross-links remain in full-document baselines and preview after an unrelated edit", () => {
  const a = articles.find((a) => a.slug === "Bounties");
  const doc = baselineDocument(a, articleParts(a));
  const tables = doc.content.content.filter((n) => n.type === "table");
  assert.equal(tables.length, 2);
  for (const table of tables) {
    const html = renderDocument(
      {
        ...doc,
        summary: "Unrelated edited summary",
        content: { type: "doc", content: [table] },
      },
      { slug: a.slug },
    ).html;
    assert.match(html, /<td[^>]*><p><a href="\/wiki\//);
  }
});

test("formatting evidence labels retains provenance throughout the location section", () => {
  const a = articles.find((a) => a.slug === "Disturbance_on_the_Coast");
  const doc = baselineDocument(a, articleParts(a));
  const p = doc.content.content.find(
    (n) =>
      n.type === "paragraph" &&
      n.content?.some((c) => c.text === "Location evidence"),
  );
  const text = p.content[0];
  p.content = [
    { ...text, text: "Location " },
    { ...text, text: "evidence", marks: [...text.marks, { type: "bold" }] },
  ];
  let html = renderDocument(doc, { slug: a.slug }).html;
  assert.ok(
    html.includes(
      `href="${a.source}" rel="noreferrer">evidence</a>`,
    ),
  );
  p.content = [{ ...text, text: "Original map source" }];
  html = renderDocument(doc, { slug: a.slug }).html;
  assert.ok(
    html.includes(
      `href="${a.source}" rel="noreferrer">Original map source</a>`,
    ),
  );
});
