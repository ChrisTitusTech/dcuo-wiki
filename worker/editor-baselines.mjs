import { HttpError } from "./security.mjs";
import { catalogRecord } from "./catalog-packs.mjs";
// A build-time source document is valid only while this article has no edits.
// Return its byte stream to keep large editor loads within the free CPU budget.
export async function pristineDocumentResponse(env, article) {
  if (!env.ASSETS?.fetch) return null;
  const revision = await env.DB.prepare(
    "SELECT id FROM article_revisions WHERE slug=? LIMIT 1",
  )
    .bind(article.slug)
    .first();
  if (revision) return null;
  const payload = await catalogRecord(env, article.slug, "editor");
  if (!payload)
    throw new HttpError(
      503,
      "This article's editor is temporarily unavailable. Please try again later.",
    );
  return new Response(payload, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}
