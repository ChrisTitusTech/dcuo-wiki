import media from "../data/media.json" with { type: "json" };
const assets = new Map(
  media.flatMap((m) =>
    [m.sourcePage, m.original, m.preview].map((url) => [url, m]),
  ),
);
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function renderMapLinks(rows) {
  return `<div class="map-gallery">${rows
    .map(([label, reference]) => {
      const url = new URL(reference);
      if (url.protocol !== "https:" || url.username || url.password)
        throw new Error("Links must be full HTTPS URLs without credentials.");
      const asset = assets.get(url.href);
      if (!asset)
        return `<p><a href="${escape(url.href)}" rel="noreferrer">${escape(label)}</a></p>`;
      return `<figure><a href="${escape(asset.original)}" aria-label="${escape(label)} - open full-size map"><img src="${escape(asset.preview)}" alt="${escape(label)}" width="${asset.previewWidth}" height="${asset.previewHeight}" loading="lazy" decoding="async"></a><figcaption><strong>${escape(label)}</strong><span><a href="${escape(asset.original)}">Full-size image</a> | <a href="${escape(asset.sourcePage)}" rel="noreferrer">Source</a></span><small>${escape(asset.credit)}</small></figcaption></figure>`;
    })
    .join("")}</div>`;
}
