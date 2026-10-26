import known from "../data/census-item-index.json" with { type: "json" };
import { articleParts, escapeHtml } from "../shared/article-content.mjs";
import { baselineDocument, renderDocument } from "../shared/rich-article.mjs";
import { HttpError } from "./security.mjs";
const sources = new Map(known.map(([id, slug, name]) => [id, { slug, name }]));
const validId = (id) => typeof id === "string" && /^[1-9]\d{0,29}$/.test(id);
const text = (value, max) =>
  typeof value === "string" &&
  value.trim() &&
  value.length <= max &&
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)
    ? value.trim()
    : undefined;
function definition(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const result = {};
  for (const [key, max] of [
    ["description", 4096],
    ["style", 512],
  ]) {
    const value = text(data[key], max);
    if (value) result[key] = value;
  }
  for (const key of ["requiredLevel", "requiredCombatRating"])
    if (Number.isSafeInteger(data[key]) && data[key] > 0 && data[key] <= 65535)
      result[key] = data[key];
  if (
    typeof data.icon === "string" &&
    /^\/api\/item-icons\/[a-f0-9]{64}$/.test(data.icon)
  )
    result.icon = data.icon;
  return Object.keys(result).length ? result : null;
}
function identity(row) {
  const source = sources.get(row.item_id);
  const name = text(source?.name || row.name, 160);
  const slug = source?.slug || row.slug;
  return {
    name,
    slug:
      typeof slug === "string" && /^[A-Za-z0-9_-]+$/.test(slug) ? slug : null,
  };
}
function articleFrom(row) {
  if (!validId(row.item_id)) return null;
  const { name, slug } = identity(row),
    details = definition(row.details_json);
  if (!name || slug || !details) return null;
  const facts = [];
  if (details.style) facts.push("Style: " + details.style);
  if (details.requiredLevel)
    facts.push("Required level: " + details.requiredLevel);
  if (details.requiredCombatRating)
    facts.push("Required combat rating: " + details.requiredCombatRating);
  const sections = [
    {
      title: "Item definition",
      items: details.description ? [details.description] : [],
    },
  ];
  if (details.icon)
    sections[0].images = [
      {
        label: name + " item icon",
        url: "https://dcuo-wiki.com" + details.icon,
      },
    ];
  if (facts.length)
    sections.push({ title: "Requirements and style", items: facts });
  sections.push({
    title: "Identification",
    items: [
      "Item ID: " + row.item_id,
      "Captured from a loaded DC Universe Online item definition through DCUO Companion. Character-specific equipped values are not part of this definition.",
    ],
  });
  const date =
    Number.isSafeInteger(row.captured_at) && row.captured_at > 0
      ? new Date(row.captured_at * 1000)
      : null;
  return {
    companion: true,
    slug: "Item_" + row.item_id,
    title: name,
    category: "Equipment",
    type: "Companion item definition",
    summary:
      details.description?.slice(0, 300) ||
      "Captured item definition for " + name + ".",
    sections,
    related: [],
    source: "https://github.com/ChrisTitusTech/dcuo-overlay",
    history: "https://github.com/ChrisTitusTech/dcuo-overlay",
    retrieved:
      date && !Number.isNaN(date.getTime())
        ? date.toISOString().slice(0, 10)
        : "",
    reviewed: false,
    license:
      "DC Universe Online game text and artwork; rights belong to their respective owners.",
  };
}
const select =
  "SELECT d.item_id,d.details_json,d.captured_at,d.updated_at,i.name,i.slug FROM item_details d LEFT JOIN item_identifications i ON i.item_id=d.item_id";
export async function findCompanionArticle(slug, env) {
  const match = /^Item_([1-9]\d{0,29})$/.exec(slug);
  if (!match || !env?.DB) return null;
  const row = await env.DB.prepare(select + " WHERE d.item_id=?")
    .bind(match[1])
    .first();
  return row ? articleFrom(row) : null;
}
export async function listCompanionItems(url, env) {
  const cursor = url.searchParams.get("cursor") || "";
  if (cursor && !validId(cursor))
    throw new HttpError(400, "Invalid item cursor.");
  const rows = (
    await env.DB.prepare(
      select + " WHERE d.item_id>? ORDER BY d.item_id LIMIT 51",
    )
      .bind(cursor)
      .all()
  ).results;
  const items = [];
  for (const row of rows.slice(0, 50)) {
    const { name, slug } = identity(row),
      details = definition(row.details_json);
    if (!validId(row.item_id) || !name || !details) continue;
    items.push({
      itemId: row.item_id,
      name,
      href: "/wiki/" + (slug || "Item_" + row.item_id) + "/",
      ...(details.icon ? { icon: details.icon } : {}),
      updatedAt: row.updated_at,
    });
  }
  return { items, nextCursor: rows.length > 50 ? rows[49].item_id : null };
}
export async function serveCompanionArticle(request, env, article) {
  const url = new URL(request.url);
  if (!url.pathname.endsWith("/"))
    return new Response(null, {
      status: 301,
      headers: { Location: url.pathname + "/" + url.search },
    });
  const template = new URL("/companion-item-template/", url);
  const response = await env.ASSETS.fetch(
    new Request(template, { method: "GET" }),
  );
  if (response.status !== 200) return response;
  const rendered = renderDocument(
    baselineDocument(article, articleParts(article)),
    { editLinks: true, slug: article.slug },
  );
  const rewriter = new HTMLRewriter();
  for (const [selector, value, html] of [
    [".article-top h1", article.title, false],
    ["title", article.title + " | DCUO Wiki", false],
    ['[data-live-part="summary"]', article.summary, false],
    ["#article-body", rendered.html, true],
    ["#article-toc", rendered.toc, true],
    [
      ".article-tools .badge",
      "Companion item definition - " + article.retrieved,
      false,
    ],
    ["#editor-heading", "Editing: " + article.title, false],
  ])
    rewriter.on(selector, {
      element(el) {
        el.setInnerContent(value, { html });
      },
    });
  rewriter.on('link[rel="canonical"]', {
    element(el) {
      el.setAttribute(
        "href",
        "https://dcuo-wiki.com/wiki/" + article.slug + "/",
      );
    },
  });
  rewriter.on('meta[name="description"]', {
    element(el) {
      el.setAttribute("content", article.summary);
    },
  });
  rewriter.on("#article-editor", {
    element(el) {
      el.setAttribute("data-page", article.title);
      el.setAttribute("data-slug", article.slug);
    },
  });
  rewriter.on("#edit-account a", {
    element(el) {
      el.setAttribute(
        "href",
        "/account/?page=" + encodeURIComponent(article.title),
      );
    },
  });
  const transformed = rewriter.transform(response),
    headers = new Headers(transformed.headers);
  headers.set("Cache-Control", "no-store");
  headers.delete("ETag");
  headers.delete("Content-Length");
  headers.delete("Last-Modified");
  return new Response(request.method === "HEAD" ? null : transformed.body, {
    status: 200,
    headers,
  });
}

// Resolve captured definitions only through exact source IDs or approved slug mappings.
export async function companionArticleDetails(slug, env) {
  if (
    !env?.DB ||
    !/^[A-Za-z0-9_-]+$/.test(slug) ||
    /^Item_[1-9]\d{0,29}$/.test(slug)
  )
    return [];
  const ids = [...sources]
    .filter(([, value]) => value.slug === slug)
    .map(([id]) => id)
    .slice(0, 80);
  const condition = ids.length
    ? `d.item_id IN (${ids.map(() => "?").join(",")}) OR i.slug=?`
    : "i.slug=?";
  const rows = (
    await env.DB.prepare(
      select + " WHERE (" + condition + ") ORDER BY d.item_id LIMIT 50",
    )
      .bind(...ids, slug)
      .all()
  ).results;
  return rows.flatMap((row) => {
    const details = definition(row.details_json),
      item = identity(row);
    // A source-index mapping wins over a conflicting dynamic mapping.
    return details && item.name && item.slug === slug
      ? [{ itemId: row.item_id, name: item.name, details }]
      : [];
  });
}
export function renderCompanionArticleDetails(rows) {
  if (!rows.length) return "";
  const escape = escapeHtml;
  return (
    '<section id="companion-item-definition"><h2>Companion item definition</h2><p>Captured global item definitions. Character-specific equipped values are separate.</p>' +
    rows
      .map((row) => {
        const d = row.details;
        return (
          "<section><h3>" +
          escape(row.name) +
          "</h3><p>Item ID: " +
          escape(row.itemId) +
          "</p>" +
          (d.icon
            ? '<img src="' +
              escape(d.icon) +
              '" alt="' +
              escape(row.name) +
              ' item icon" width="69" height="69" loading="lazy">'
            : "") +
          (d.description
            ? "<p>" + escape(d.description).replaceAll("\n", "<br>") + "</p>"
            : "") +
          "<dl>" +
          [
            ["Style", d.style],
            ["Required level", d.requiredLevel],
            ["Required combat rating", d.requiredCombatRating],
          ]
            .filter(([, value]) => value !== undefined)
            .map(
              ([label, value]) =>
                "<dt>" + label + "</dt><dd>" + escape(value) + "</dd>",
            )
            .join("") +
          "</dl></section>"
        );
      })
      .join("") +
    "</section>"
  );
}
export async function supplementCompanionArticle(response, slug, env) {
  const html = renderCompanionArticleDetails(
    await companionArticleDetails(slug, env),
  );
  if (!html) return response;
  return new HTMLRewriter()
    .on("#article-body", {
      element(el) {
        el.append(html, { html: true });
      },
    })
    .transform(response);
}
