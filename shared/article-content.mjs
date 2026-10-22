import { cleanImportText, missingImportText } from "./import-text.mjs";
import { renderFeatText } from "./feat-meter.mjs";
import { renderCurrencyText, rewardContext, isRewardPart } from "./rewards.mjs";
import { renderMapLinks } from "./media.mjs";
// Plain-text editing formats shared by static pages, the editor, and the Worker.
export const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function articleParts(article) {
  return [
    { id: "summary", title: "Summary", kind: "text", text: article.summary },
    ...article.sections.flatMap((s, i) => [
      {
        id: `section-${i}`,
        title: s.title,
        kind: "items",
        text: s.items.map((v) => `- ${v}`).join("\n"),
      },
      ...(s.images
        ? [
            {
              id: `images-${i}`,
              title: `${s.title}: images (label | URL)`,
              kind: "links",
              text: s.images.map((m) => `${m.label} | ${m.url}`).join("\n"),
            },
          ]
        : []),
      ...(s.table
        ? [
            {
              id: `table-${i}`,
              title: `${s.title}: table`,
              kind: "table",
              columns: s.table.columns,
              caption: s.table.caption,
              text: s.table.rows.map((r) => r.join(" | ")).join("\n"),
            },
          ]
        : []),
    ]),
    ...(article.location
      ? [
          {
            id: "location-label",
            title: "Location name",
            kind: "text",
            text: article.location.label,
          },
          {
            id: "location-precision",
            title: "Location precision",
            kind: "text",
            text: article.location.precision,
          },
          {
            id: "location-maps",
            title: "Map links (label | URL)",
            kind: "links",
            text: article.location.maps
              .map((m) => `${m.label} | ${m.url}`)
              .join("\n"),
          },
        ]
      : []),
    ...(article.locationLimitation
      ? [
          {
            id: "location-research",
            title: "Location research",
            kind: "text",
            text: article.locationLimitation,
          },
        ]
      : []),
    ...(article.videoReview
      ? [
          {
            id: "videos",
            title: "Video walkthroughs (title | URL | evidence)",
            kind: "videos",
            text:
              article.videos
                ?.map(
                  (v) =>
                    `${v.title} | ${v.url}${v.startSeconds ? `&t=${v.startSeconds}s` : ""} | ${v.evidence}`,
                )
                .join("\n") || "",
          },
        ]
      : []),
  ];
}
function url(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Links must be full HTTPS URLs.");
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password)
    throw new Error("Links must be full HTTPS URLs without credentials.");
  return escapeHtml(parsed.href);
}
export function renderPart(part, value, { slug } = {}) {
  const rewards = isRewardPart(part, slug);
  const restored = rewards ? rewardContext(slug, part, value) : null;
  const renderText = rewards ? renderCurrencyText : renderFeatText;
  if (part.kind === "videos" && value === "") return "";
  if (typeof value !== "string" || value.length > 7000 || !value.trim())
    throw new Error("Enter between 1 and 7,000 characters.");
  if (part.kind === "text") return escapeHtml(value);
  const lines = value
    .trim()
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  if (part.kind === "items")
    return `<ul>${lines.map((s, i) => `<li>${renderText(restored?.items?.[i] ?? s.replace(/^[-*]\s*/, ""))}</li>`).join("")}</ul>`;
  const rows = lines.map((s) =>
    (part.kind === "table" ? s.split(/\s*\|\s*/) : s.split(" | ")).map((v) =>
      v.trim(),
    ),
  );
  const count =
    part.kind === "table"
      ? part.columns.length
      : part.kind === "videos"
        ? 3
        : 2;
  if (
    rows.some(
      (r) => r.length !== count || (part.kind !== "table" && r.some((v) => !v)),
    )
  )
    throw new Error(
      `Use ${count} nonempty fields per line, separated by " | ".`,
    );
  if (part.kind === "table") {
    const values = rows.map((r, i) =>
      r.map((c, j) => {
        const value = restored?.rows?.[i]?.[j] ?? c;
        return missingImportText(value) ? "" : cleanImportText(value);
      }),
    );
    const columns = part.columns
      .map((_, i) => i)
      .filter((i) => values.some((r) => r[i]));
    if (!columns.length) return "";
    return `<table><caption>${escapeHtml(part.caption)}</caption><thead><tr>${columns.map((i) => `<th scope="col">${escapeHtml(part.columns[i])}</th>`).join("")}</tr></thead><tbody>${values
      .filter((r) => r.some(Boolean))
      .map(
        (r) =>
          `<tr>${columns.map((i) => `<td>${renderText(r[i])}</td>`).join("")}</tr>`,
      )
      .join("")}</tbody></table>`;
  }
  if (part.kind === "links") return renderMapLinks(rows);
  return `<ul>${rows.map((r) => `<li><a href="${url(r[1])}" rel="noreferrer">${escapeHtml(r[0])}</a>${part.kind === "videos" ? `<p>${escapeHtml(r[2])}</p>` : ""}</li>`).join("")}</ul>`;
}
