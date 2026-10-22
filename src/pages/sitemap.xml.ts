import articles from "../data/articles";
import {
  releases,
  releaseIdsFor,
  releaseHref,
} from "../../shared/releases.mjs";
export function GET() {
  const paths = [
    "/",
    "/about/",
    "/guides/",
    "/releases/",
    ...releases
      .filter((r) => articles.some((a) => releaseIdsFor(a.slug).includes(r.id)))
      .map((r) => releaseHref(r.id)),
    ...articles.map((a) => `/wiki/${a.slug}/`),
  ];
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((p) => `<url><loc>https://dcuo-wiki.com${p}</loc></url>`).join("")}</urlset>`,
    { headers: { "Content-Type": "application/xml" } },
  );
}
