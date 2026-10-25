import { guideReferenceLink, guideTextParts } from "./guide-links.mjs";
import { sectionHasContent, filledTable } from "./import-text.mjs";
import { renderFeatText } from "./feat-meter.mjs";
import { escapeHtml, parseTableRow } from "./article-content.mjs";
import { mediaAsset, renderMapLinks } from "./media.mjs";
import { rewardContext, renderCurrencyText } from "./rewards.mjs";

export const DOCUMENT_BYTES = 512 * 1024;
const fail = (message) => {
  throw new Error(message);
};
const text = (value, max = 2000) => {
  if (typeof value !== "string" || value.length > max)
    fail("Invalid or oversized text in the article.");
  return value;
};
export function articleLink(value) {
  text(value, 2048);
  if (
    /^#[a-zA-Z0-9_-]+$/.test(value) ||
    /^\/(?!\/)[a-zA-Z0-9_/?#%&=.'():+-]*$/.test(value)
  )
    return value;
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password)
    fail("Use a wiki link or a full HTTPS link without credentials.");
  return url.href;
}
export function youtubeVideo(value) {
  const url = new URL(text(value, 2048));
  if (url.protocol !== "https:" || url.username || url.password)
    fail("Use an HTTPS YouTube video link.");
  const host = url.hostname.replace(/^www\./, "");
  const id =
    host === "youtu.be"
      ? url.pathname.slice(1)
      : ["youtube.com", "m.youtube.com"].includes(host) &&
          url.pathname === "/watch"
        ? url.searchParams.get("v")
        : "";
  if (!/^[a-zA-Z0-9_-]{11}$/.test(id || ""))
    fail("Use a YouTube watch or youtu.be video link.");
  const raw = url.searchParams.get("t") || url.searchParams.get("start") || "0";
  const time = /^(\d+)s?$/.exec(raw);
  if (!time || Number(time[1]) > 86400)
    fail("Use a video start time in seconds, up to 86,400.");
  return {
    id,
    start: Number(time[1]),
    url: `https://www.youtube.com/watch?v=${id}${Number(time[1]) ? `&t=${Number(time[1])}s` : ""}`,
  };
}
const integer = (v, min, max, fallback) => {
  if (v == null) return fallback;
  if (!Number.isInteger(v) || v < min || v > max)
    fail("Invalid heading, list, or table dimensions.");
  return v;
};
const inlineTypes = new Set(["text", "hardBreak"]);
const blockTypes = new Set([
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "blockquote",
  "codeBlock",
  "horizontalRule",
  "image",
  "table",
  "youtube",
]);

// Persist a small, explicit document schema. Never store/render arbitrary HTML.
export function validateDocument(input) {
  if (!input || typeof input !== "object" || input.version !== 1)
    fail("Unsupported article document. Reload the editor.");
  if (
    new TextEncoder().encode(JSON.stringify(input)).length >
    DOCUMENT_BYTES * 2
  )
    fail("The article exceeds the 512 KB document limit.");
  const title = text(input.title, 160).trim(),
    summary = text(input.summary, 7000).trim();
  if (!title || !summary) fail("Enter an article title and summary.");
  let count = 0,
    characters = 0;
  const headings = new Set();
  function node(n, parent, depth = 0) {
    if (!n || typeof n !== "object" || ++count > 12000 || depth > 24)
      fail("The article is too complex. Simplify nested content.");
    const type = n.type,
      attrs = n.attrs || {};
    if (
      (type === "doc" && parent !== null) ||
      (type !== "doc" && parent === null)
    )
      fail("Invalid article document.");
    if (["paragraph", "heading"].includes(parent) && !inlineTypes.has(type))
      fail("A paragraph or heading contains unsupported content.");
    if (
      ["doc", "blockquote", "listItem", "tableCell", "tableHeader"].includes(
        parent,
      ) &&
      !blockTypes.has(type)
    )
      fail("Unsupported article block.");
    if (["bulletList", "orderedList"].includes(parent) && type !== "listItem")
      fail("A list must contain list items.");
    if (
      (parent === "table" && type !== "tableRow") ||
      (parent === "tableRow" && !["tableCell", "tableHeader"].includes(type))
    )
      fail("Invalid table structure.");
    if (parent === "codeBlock" && type !== "text")
      fail("Code blocks contain only text.");
    if (type === "text") {
      const value = text(n.text, 250000);
      characters += value.length;
      if (!value) fail("Empty text node.");
      const marks = (n.marks || []).map((m) => {
        if (
          !["bold", "italic", "strike", "underline", "code", "link"].includes(
            m?.type,
          )
        )
          fail("Unsupported text formatting.");
        if (m.type === "link")
          return { type: "link", attrs: { href: articleLink(m.attrs?.href) } };
        return { type: m.type };
      });
      if (marks.length > 8 || (parent === "codeBlock" && marks.length))
        fail("Invalid text formatting.");
      return { type, text: value, ...(marks.length ? { marks } : {}) };
    }
    if (type === "image") {
      let asset;
      try {
        asset = mediaAsset(attrs.src);
      } catch {}
      if (!asset) fail("Choose an image from the wiki's R2 media library.");
      return {
        type,
        attrs: {
          src: asset.preview,
          alt: text(attrs.alt || "Image", 2000),
          title: text(attrs.title || "", 2000),
        },
      };
    }
    if (type === "youtube")
      return {
        type,
        attrs: {
          url: youtubeVideo(attrs.url).url,
          title: text(attrs.title || "Video walkthrough", 2000),
        },
      };
    if (["hardBreak", "horizontalRule"].includes(type)) return { type };
    if (
      ![
        "doc",
        "paragraph",
        "heading",
        "bulletList",
        "orderedList",
        "listItem",
        "blockquote",
        "codeBlock",
        "table",
        "tableRow",
        "tableCell",
        "tableHeader",
      ].includes(type)
    )
      fail("Unsupported article content.");
    if (n.content !== undefined && !Array.isArray(n.content))
      fail("Invalid article content.");
    const content = (n.content || []).map((c) => node(c, type, depth + 1));
    let cleanAttrs;
    if (type === "heading") {
      // Copied headings need fresh anchors, not a publishing error about hidden IDs.
      const id =
        typeof attrs.id === "string" &&
        /^(?:section-\d+|location|doc-section-\d+)$/.test(attrs.id) &&
        !headings.has(attrs.id)
          ? attrs.id
          : undefined;
      if (id) headings.add(id);
      cleanAttrs = {
        level: integer(attrs.level, 2, 4, 2),
        ...(id ? { id } : {}),
      };
    }
    if (type === "orderedList")
      cleanAttrs = { start: integer(attrs.start, 1, 1000000, 1) };
    if (["tableCell", "tableHeader"].includes(type))
      cleanAttrs = {
        colspan: integer(attrs.colspan, 1, 50, 1),
        rowspan: integer(attrs.rowspan, 1, 500, 1),
        colwidth: null,
      };
    if (
      [
        "doc",
        "bulletList",
        "orderedList",
        "listItem",
        "blockquote",
        "table",
        "tableCell",
        "tableHeader",
      ].includes(type) &&
      !content.length
    )
      fail("Lists, tables, and the article cannot be empty.");
    if (type === "listItem" && content[0]?.type !== "paragraph")
      fail("Start each list item with a paragraph.");
    const result = {
      type,
      ...(cleanAttrs ? { attrs: cleanAttrs } : {}),
      ...(content.length ? { content } : {}),
    };
    if (type === "table") validateTable(result);
    return result;
  }
  const content = node(input.content, null);
  for (const entry of documentHeadings({ content }))
    entry.node.attrs.id = entry.id;
  if (characters > 250000) fail("The article exceeds 250,000 text characters.");
  if (documentText(content).trim().length < 20)
    fail("Keep at least 20 characters of article content.");
  const result = { version: 1, title, summary, content };
  if (new TextEncoder().encode(JSON.stringify(result)).length > DOCUMENT_BYTES)
    fail("The article exceeds the 512 KB document limit.");
  return result;
}
function validateTable(table) {
  if (table.content.length > 500) fail("A table may contain up to 500 rows.");
  const grid = [];
  for (let r = 0; r < table.content.length; r++) {
    grid[r] ||= [];
    let col = 0;
    for (const cell of table.content[r].content || []) {
      while (grid[r][col]) col++;
      const { colspan, rowspan } = cell.attrs;
      if (col + colspan > 50 || r + rowspan > table.content.length)
        fail("Invalid table cell span.");
      for (let y = r; y < r + rowspan; y++) {
        grid[y] ||= [];
        for (let x = col; x < col + colspan; x++) {
          if (grid[y][x]) fail("Overlapping table cells.");
          grid[y][x] = true;
        }
      }
      col += colspan;
    }
  }
  const width = grid[0].length;
  if (!width) fail("A table must contain at least one cell.");
  if (
    grid.some(
      (row) =>
        row.length !== width ||
        Array.from({ length: width }, (_, i) => !row[i]).some(Boolean),
    )
  )
    fail("Each table row must have the same number of columns.");
}
export function documentText(node) {
  return node.type === "text"
    ? node.text
    : node.type === "image"
      ? node.attrs.alt
      : node.type === "youtube"
        ? node.attrs.title
        : (node.content || []).map(documentText).join(" ");
}
export function documentHeadings(doc) {
  const reserved = new Set();
  const scan = (n) => {
    if (n.type === "heading" && n.attrs?.id) reserved.add(n.attrs.id);
    (n.content || []).forEach(scan);
  };
  scan(doc.content);
  let index = 0;
  const entries = [];
  const walk = (n) => {
    if (n.type === "heading") {
      let id = n.attrs?.id;
      if (!id) {
        do {
          id = `doc-section-${index++}`;
        } while (reserved.has(id));
        reserved.add(id);
      }
      entries.push({
        node: n,
        id,
        label: documentText(n),
        level: n.attrs.level,
      });
    }
    (n.content || []).forEach(walk);
  };
  walk(doc.content);
  return entries;
}
export function renderDocument(doc, { editLinks = false, slug } = {}) {
  const headings = documentHeadings(doc);
  const headingIds = new Map(headings.map((h) => [h.node, h.id]));
  function blocks(
    children = [],
    inherited = false,
    inheritedLinks = false,
    inheritedEvidence = false,
  ) {
    let rewardLevels = [],
      linkLevels = [],
      evidenceLevels = [];
    return children
      .map((block) => {
        if (block.type === "heading") {
          evidenceLevels = evidenceLevels.filter(
            (level) => level < block.attrs.level,
          );
          if (block.attrs.id === "location")
            evidenceLevels.push(block.attrs.level);
          linkLevels = linkLevels.filter((level) => level < block.attrs.level);
          if (/^See also$/i.test(documentText(block)))
            linkLevels.push(block.attrs.level);
          rewardLevels = rewardLevels.filter(
            (level) => level < block.attrs.level,
          );
          if (
            /\b(?:rewards?|results?|loot|drops?)\b/i.test(documentText(block))
          )
            rewardLevels.push(block.attrs.level);
        }
        return render(
          block,
          inherited || rewardLevels.length > 0,
          inheritedLinks || linkLevels.length > 0,
          inheritedEvidence || evidenceLevels.length > 0,
        );
      })
      .join("");
  }
  function render(n, decorate = false, crosslink = false, evidence = false) {
    const content = () =>
      (n.content || [])
        .map((c) => render(c, decorate, crosslink, evidence))
        .join("");
    switch (n.type) {
      case "doc":
        return blocks(n.content);
      case "text": {
        const decorateText =
          decorate && !n.marks?.some((m) => m.type === "code")
            ? renderCurrencyText
            : renderFeatText;
        const canLink =
          crosslink && !n.marks?.some((m) => ["link", "code"].includes(m.type));
        let html = guideTextParts(n.text, [], { slug, seeAlso: canLink })
          .map((p) =>
            p.href
              ? `<a href="${escapeHtml(p.href)}">${decorateText(p.text)}</a>`
              : decorateText(p.text),
          )
          .join("");
        for (const mark of n.marks || []) {
          const tag = {
            bold: "strong",
            italic: "em",
            strike: "s",
            underline: "u",
            code: "code",
          }[mark.type];
          html =
            mark.type === "link"
              ? `<a href="${escapeHtml(evidence ? mark.attrs.href : guideReferenceLink(mark.attrs.href, { slug }))}" rel="noreferrer">${html}</a>`
              : `<${tag}>${html}</${tag}>`;
        }
        return html;
      }
      case "paragraph": {
        const rewards =
          decorate ||
          /^(?:rewards?|results?|loot|drops?)\s*:/i.test(documentText(n));
        return `<p>${(n.content || []).map((c) => render(c, rewards, crosslink, evidence || /\bLocation\s+evidence\b/i.test(documentText(n)))).join("")}</p>`;
      }
      case "heading":
        return `${editLinks ? `<a class="section-edit" href="#article-editor" data-edit-part="${headingIds.get(n)}" aria-label="Edit ${escapeHtml(documentText(n))}">Edit section</a>` : ""}<h${n.attrs.level} id="${headingIds.get(n)}">${(n.content || []).map((c) => render(c, false)).join("")}</h${n.attrs.level}>`;
      case "hardBreak":
        return "<br>";
      case "horizontalRule":
        return "<hr>";
      case "bulletList":
        return `<ul>${content()}</ul>`;
      case "orderedList":
        return `<ol start="${n.attrs.start}">${content()}</ol>`;
      case "listItem":
        return `<li>${blocks(n.content, decorate, crosslink, evidence)}</li>`;
      case "blockquote":
        return `<blockquote>${blocks(n.content, decorate, crosslink, evidence)}</blockquote>`;
      case "codeBlock":
        return `<pre><code>${(n.content || []).map((c) => render(c, false)).join("")}</code></pre>`;
      case "image":
        return renderMapLinks([[n.attrs.alt, n.attrs.src]]);
      case "table": {
        const labels = (n.content[0]?.content || [])
          .filter((cell) => cell.type === "tableHeader")
          .map(documentText)
          .join(" ");
        const rewards =
          decorate ||
          /rewards?|currency|cash|marks|loot|drops?|cost|price/i.test(labels);
        return `<div class="table-scroll" tabindex="0" role="region" aria-label="Article table"><table><tbody>${(n.content || []).map((row) => render(row, rewards, crosslink, evidence)).join("")}</tbody></table></div>`;
      }
      case "tableRow":
        return `<tr>${content()}</tr>`;
      case "tableCell":
      case "tableHeader": {
        const tag = n.type === "tableHeader" ? "th" : "td";
        return `<${tag} colspan="${n.attrs.colspan}" rowspan="${n.attrs.rowspan}">${blocks(n.content, decorate, crosslink, evidence)}</${tag}>`;
      }
      case "youtube": {
        const video = youtubeVideo(n.attrs.url);
        return `<figure class="wiki-video"><iframe src="https://www.youtube-nocookie.com/embed/${video.id}?start=${video.start}" title="${escapeHtml(n.attrs.title)}" loading="lazy" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe><figcaption><a href="${escapeHtml(video.url)}" rel="noreferrer">${escapeHtml(n.attrs.title)}</a></figcaption></figure>`;
      }
      default:
        fail("Unsupported article content.");
    }
  }
  return {
    html: render(doc.content),
    toc: headings
      .map(
        (h) =>
          `<a href="#${h.id}"${h.level > 2 ? ' class="toc-subheading"' : ""}>${escapeHtml(h.label)}</a>`,
      )
      .join(""),
  };
}

const textNodes = (value) =>
  String(value)
    .split("\n")
    .flatMap((line, i) => [
      ...(i ? [{ type: "hardBreak" }] : []),
      ...(line ? [{ type: "text", text: line }] : []),
    ]);
const paragraph = (value) => ({ type: "paragraph", content: textNodes(value) });
const heading = (label, id) => ({
  type: "heading",
  attrs: { level: 2, ...(id ? { id } : {}) },
  content: textNodes(label),
});
const linked = (label, href, context) => ({
  type: "text",
  text: label || href,
  marks: [
    {
      type: "link",
      attrs: {
        href: articleLink(context ? guideReferenceLink(href, context) : href),
      },
    },
  ],
});

// Convert effective live section revisions, not just the original imported article.
export function baselineDocument(article, parts, related = []) {
  const values = new Map(parts.map((p) => [p.id, p]));
  const get = (id) => values.get(id)?.text || "";
  const content = [];
  function referenceParagraph(value, section) {
    return {
      type: "paragraph",
      content: guideTextParts(value, section.references, {
        slug: article.slug,
        seeAlso: /^See also$/i.test(section.title),
      }).map((p) =>
        p.href ? linked(p.text, p.href) : { type: "text", text: p.text },
      ),
    };
  }
  function images(id) {
    for (const line of get(id).split("\n").filter(Boolean)) {
      const [label, reference] = line.split(" | ");
      let asset;
      try {
        asset = mediaAsset(reference);
      } catch {}
      content.push(
        asset
          ? {
              type: "image",
              attrs: { src: asset.preview, alt: label, title: "" },
            }
          : { type: "paragraph", content: [linked(label, reference)] },
      );
    }
  }
  for (const [i, section] of article.sections.entries()) {
    const part = values.get(`section-${i}`),
      restoration = part && rewardContext(article.slug, part, part.text);
    const items =
      restoration?.items ||
      get(`section-${i}`)
        .split("\n")
        .filter(Boolean)
        .map((v) => v.replace(/^[-*]\s*/, ""));
    if (!sectionHasContent({ ...section, items })) continue;
    content.push(heading(section.title, `section-${i}`));
    if (items.length)
      content.push({
        type: "bulletList",
        content: items.map((item) => ({
          type: "listItem",
          content: [referenceParagraph(item, section)],
        })),
      });
    if (section.images) images(`images-${i}`);
    if (section.references?.length)
      content.push({
        type: "paragraph",
        content: [
          { type: "text", text: "Related articles: " },
          ...section.references.flatMap((r, j) => [
            ...(j ? [{ type: "text", text: " | " }] : []),
            linked(r.label, r.url, { slug: article.slug }),
          ]),
        ],
      });
    if (section.table) {
      content.push(paragraph(section.table.caption));
      const part = values.get(`table-${i}`),
        restore = rewardContext(article.slug, part, part.text);
      const rows =
        restore?.rows ||
        get(`table-${i}`).split("\n").filter(Boolean).map(parseTableRow);
      const display = filledTable(section.table.columns, rows);
      if (!display.columns.length) continue;
      content.push({
        type: "table",
        content: [display.columns, ...display.rows].map((row, index) => ({
          type: "tableRow",
          content: row.map((cell) => ({
            type: index === 0 ? "tableHeader" : "tableCell",
            content: [referenceParagraph(cell, section)],
          })),
        })),
      });
    }
  }
  if (article.location) {
    content.push(
      heading(get("location-label"), "location"),
      paragraph(get("location-precision")),
      {
        type: "paragraph",
        content: [linked("Location evidence", article.location.source)],
      },
    );
    images("location-maps");
  }
  if (article.locationLimitation)
    content.push(
      heading("Location research"),
      paragraph(get("location-research")),
    );
  if (article.videoReview && get("videos").trim()) {
    content.push(heading("Video walkthroughs"));
    const videos = get("videos").split("\n").filter(Boolean);
    for (const line of videos) {
      const [title, url, evidence] = line.split(" | ");
      try {
        content.push({
          type: "youtube",
          attrs: { url: youtubeVideo(url).url, title },
        });
      } catch {
        content.push({ type: "paragraph", content: [linked(title, url)] });
      }
      content.push(paragraph(evidence || ""));
    }
  }
  if (related.length)
    content.push(heading("Related guides"), {
      type: "bulletList",
      content: related.map((a) => ({
        type: "listItem",
        content: [
          { type: "paragraph", content: [linked(a.title, `/wiki/${a.slug}/`)] },
        ],
      })),
    });
  return validateDocument({
    version: 1,
    title: article.title,
    summary: get("summary"),
    content: { type: "doc", content },
  });
}
