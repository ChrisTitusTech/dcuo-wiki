import test from "node:test";
import assert from "node:assert/strict";
import articles from "../src/data/articles.json" with { type: "json" };
import media from "../data/media.json" with { type: "json" };
import { articleParts } from "../shared/article-content.mjs";
import {
  baselineDocument,
  validateDocument,
  renderDocument,
  documentText,
} from "../shared/rich-article.mjs";
const doc = (content) => ({
  version: 1,
  title: "Test guide",
  summary: "A complete guide summary.",
  content: { type: "doc", content },
});
const p = (text) => ({ type: "paragraph", content: [{ type: "text", text }] });
test("every published guide converts to a validated full article", () => {
  for (const article of articles) {
    const converted = baselineDocument(
      article,
      articleParts(article),
      articles.filter((a) => article.related?.includes(a.slug)),
    );
    assert.equal(converted.title, article.title, article.slug);
    assert.equal(converted.summary, article.summary.trim(), article.slug);
    assert.ok(documentText(converted.content).length >= 20, article.slug);
    assert.doesNotThrow(() => validateDocument(converted), article.slug);
  }
});
test("whole-document conversion includes existing corrections, maps, source references, tables, and videos", () => {
  const article = articles.find((a) => a.slug === "Return_to_the_Nexus");
  const parts = articleParts(article);
  parts[0].text = "A player's already published summary correction.";
  parts[1].text = "- A player's already published walkthrough correction.";
  const converted = baselineDocument(article, parts);
  assert.equal(converted.summary, parts[0].text);
  assert.match(
    documentText(converted.content),
    /already published walkthrough/,
  );
  const serialized = JSON.stringify(converted);
  assert.ok(serialized.includes('"type":"image"'));
  assert.ok(serialized.includes('"type":"youtube"'));
  assert.ok(serialized.includes("Location evidence"));
  const tabularArticle = articles.find((a) => a.sections.some((s) => s.table));
  const tabular = baselineDocument(
    tabularArticle,
    articleParts(tabularArticle),
  );
  assert.ok(JSON.stringify(tabular).includes('"type":"table"'));
});
test("full articles support long prose, formatting, R2 images, safe links, and YouTube", () => {
  const input = doc([
    {
      type: "heading",
      attrs: { level: 2, id: "section-0" },
      content: [{ type: "text", text: "Walkthrough" }],
    },
    p("Long walkthrough details. ".repeat(1200)),
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "<script>bad()</script>",
          marks: [
            { type: "bold" },
            { type: "link", attrs: { href: "/wiki/Powers/" } },
          ],
        },
      ],
    },
    { type: "image", attrs: { src: media[0].original, alt: "A sourced map" } },
    {
      type: "youtube",
      attrs: {
        url: "https://youtu.be/abcdefghijk?t=12",
        title: "A walkthrough",
      },
    },
  ]);
  const html = renderDocument(validateDocument(input));
  assert.ok(html.html.length > 20000);
  assert.match(html.html, /&lt;script&gt;/);
  assert.match(html.html, /data-image-viewer/);
  assert.match(html.html, /youtube-nocookie.com\/embed\/abcdefghijk\?start=12/);
  assert.match(html.toc, /#section-0/);
  assert.match(
    renderDocument(validateDocument(input), { editLinks: true }).html,
    /data-edit-part="section-0"/,
  );
  assert.ok(!html.html.includes("<script>"));
});
test("arbitrary HTML, unsafe URLs, external images, and malformed tables are rejected; copied headings get unique anchors", () => {
  const unsafe = [
    { type: "iframe", attrs: { src: "https://evil.example" } },
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "unsafe link",
          marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }],
        },
      ],
    },
    {
      type: "image",
      attrs: { src: "https://evil.example/tracker.png", alt: "bad" },
    },
    {
      type: "youtube",
      attrs: { url: "https://evil.example/watch?v=abcdefghijk" },
    },
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            {
              type: "tableCell",
              attrs: { rowspan: 3 },
              content: [p("A malformed row span.")],
            },
          ],
        },
      ],
    },
  ];
  for (const node of unsafe)
    assert.throws(() =>
      validateDocument(doc([p("A useful existing article body."), node])),
    );
  const heading = {
    type: "heading",
    attrs: { level: 2, id: "section-1" },
    content: [{ type: "text", text: "Duplicate heading" }],
  };
  const headings = renderDocument(
    validateDocument(doc([heading, heading])),
  ).toc;
  assert.equal((headings.match(/#section-1/g) || []).length, 1);
  assert.match(headings, /#doc-section-0/);
  assert.throws(() =>
    validateDocument(doc([p("Oversized content. ".repeat(50000))])),
  );
});

test("vertical cell merges may cover an empty row while uncovered empty rows are rejected", () => {
  const table = {
    type: "table",
    content: [
      {
        type: "tableRow",
        content: [
          {
            type: "tableCell",
            attrs: { colspan: 2, rowspan: 2 },
            content: [
              p("A merged table cell spanning the complete second row."),
            ],
          },
        ],
      },
      { type: "tableRow" },
    ],
  };
  const valid = validateDocument(doc([table]));
  assert.match(renderDocument(valid).html, /rowspan="2"/);
  assert.equal(valid.content.content[0].content.length, 2);
  table.content[0].content[0].attrs.rowspan = 1;
  assert.throws(() => validateDocument(doc([table])));
  assert.throws(() =>
    validateDocument(doc([{ type: "table", content: [{ type: "tableRow" }] }])),
  );
});

test("currency icons stay in reward content rather than decorating ordinary prose", () => {
  const h = (label, level = 2) => ({
    type: "heading",
    attrs: { level },
    content: [{ type: "text", text: label }],
  });
  const document = validateDocument(
    doc([
      h("Overview"),
      p("Their influence and prestige shaped this story."),
      h("Rewards"),
      p("1 Source Mark"),
      h("Vendor", 3),
      p("5 Cash"),
      h("Walkthrough"),
      p("The heroes paid tribute to their allies."),
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: ["Currency", "Amount"].map((value) => ({
              type: "tableHeader",
              content: [p(value)],
            })),
          },
          {
            type: "tableRow",
            content: ["Source Mark", "1"].map((value) => ({
              type: "tableCell",
              content: [p(value)],
            })),
          },
        ],
      },
    ]),
  );
  const html = renderDocument(document).html;
  assert.ok(
    html.includes("Their influence and prestige shaped this story.</p>"),
  );
  assert.ok(html.includes("The heroes paid tribute to their allies.</p>"));
  assert.equal((html.match(/class="reward-currency"/g) || []).length, 3);
});

test("nested reward headings decorate their own block containers without leaking into siblings", () => {
  const h = (label) => ({
    type: "heading",
    attrs: { level: 2 },
    content: [{ type: "text", text: label }],
  });
  const reward = [
    h("Rewards"),
    p("Complete the mission to earn 5 Cash."),
    h("Walkthrough"),
    p("Their influence shaped the story."),
  ];
  const containers = [
    { type: "blockquote", content: reward },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [p("A useful list item introduction."), ...reward],
        },
        { type: "listItem", content: [p("Their prestige shaped the story.")] },
      ],
    },
    {
      type: "table",
      content: [
        {
          type: "tableRow",
          content: [
            { type: "tableCell", content: reward },
            {
              type: "tableCell",
              content: [p("Their prestige shaped the story.")],
            },
          ],
        },
      ],
    },
  ];
  for (const container of containers) {
    const html = renderDocument(
      validateDocument(
        doc([container, p("Their influence and prestige shaped the ending.")]),
      ),
    ).html;
    assert.equal((html.match(/class="reward-currency"/g) || []).length, 1);
    assert.ok(html.includes("Their influence shaped the story.</p>"));
    assert.ok(
      html.includes("Their influence and prestige shaped the ending.</p>"),
    );
  }
});
