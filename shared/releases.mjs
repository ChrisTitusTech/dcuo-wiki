import catalog from "../src/data/releases.json" with { type: "json" };
import assignments from "../src/data/guide-releases.json" with { type: "json" };
export const releases = catalog;
const byId = new Map(catalog.map((release) => [release.id, release]));
export function releaseIdsFor(slug) {
  const direct = assignments[slug] || [];
  return [
    ...new Set(
      direct.flatMap((id) => {
        const release = byId.get(id);
        return release?.arc ? [id, release.arc] : [id];
      }),
    ),
  ];
}
/** @returns {Array<(typeof catalog)[number]>} */
export function releasesFor(slug) {
  return (assignments[slug] || []).map((id) => byId.get(id)).filter(Boolean);
}
export function releaseSearchText(slug) {
  return releaseIdsFor(slug)
    .map((id) => byId.get(id)?.label || "")
    .join(" ");
}
export function releaseHref(id) {
  return `/releases/${id}/`;
}
