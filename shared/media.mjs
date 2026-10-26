import media from "../data/media.json" with { type: "json" };
import { catalogMediaAsset } from "./catalog-media.mjs";
const assets = new Map(
  media.flatMap((m) =>
    [m.sourcePage, m.original, m.preview].map((url) => [new URL(url).href, m]),
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
export function mediaAsset(reference) {
  const url = new URL(reference);
  if (
    url.origin === "https://dcuo-wiki.com" &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash &&
    /^\/api\/item-icons\/[a-f0-9]{64}$/.test(url.pathname)
  ) {
    return {
      preview: url.href,
      original: url.href,
      sourcePage: "https://dcuo-wiki.com/companion-items/",
      credit:
        "DC Universe Online game artwork; rights belong to their respective owners.",
    };
  }
  return assets.get(url.href) || catalogMediaAsset(reference);
}
export function renderMapLinks(rows) {
  return `<div class="map-gallery">${rows
    .map(([label, reference]) => {
      const url = new URL(reference);
      if (url.protocol !== "https:" || url.username || url.password)
        throw new Error("Links must be full HTTPS URLs without credentials.");
      const asset = mediaAsset(url.href);
      if (!asset)
        return `<p><a href="${escape(url.href)}" rel="noreferrer">${escape(label)}</a></p>`;
      return `<figure><a data-image-viewer href="${escape(asset.original)}" aria-label="${escape(label)} - enlarge image"><img src="${escape(asset.preview)}" alt="${escape(label)}"${asset.previewWidth ? ` width="${asset.previewWidth}" height="${asset.previewHeight}"` : ""} loading="lazy" decoding="async"></a><figcaption><strong>${escape(label)}</strong><span><a data-image-viewer href="${escape(asset.original)}">Full-size image</a> | <a href="${escape(asset.sourcePage)}" rel="noreferrer">Source</a></span><small>${escape(asset.credit)}</small></figcaption></figure>`;
    })
    .join("")}</div>`;
}
