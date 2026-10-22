import { HttpError } from "./security.mjs";
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
  const asset = await env.ASSETS.fetch(
    new Request("https://dcuo-wiki.com/_editor/" + article.slug + ".json"),
  );
  if (
    asset.status !== 200 ||
    !asset.headers.get("content-type")?.includes("application/json")
  )
    throw new HttpError(
      503,
      "This article's editor is temporarily unavailable. Please try again later.",
    );
  const headers = new Headers(asset.headers);
  headers.set("Cache-Control", "no-store");
  headers.delete("ETag");
  headers.delete("Last-Modified");
  return new Response(asset.body, { status: 200, headers });
}
