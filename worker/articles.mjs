import { releaseSearchText } from "../shared/releases.mjs";
import articles from "../src/data/articles.json" with { type: "json" };
import { articleParts, renderPart } from "../shared/article-content.mjs";
import { hash, HttpError } from "./security.mjs";
export function findArticle(slug) {
  const article = articles.find((a) => a.slug === slug);
  if (!article) throw new HttpError(404, "Article not found.");
  return article;
}
export async function liveParts(env, article) {
  const parts = articleParts(article);
  const rows = (
    await env.DB.prepare(
      "SELECT id,part,base_hash,content FROM article_revisions WHERE id IN (SELECT MAX(id) FROM article_revisions WHERE slug=? GROUP BY part,base_hash) ORDER BY id DESC",
    )
      .bind(article.slug)
      .all()
  ).results;
  return Promise.all(
    parts.map(async (part) => {
      const baseHash = await hash(part.text);
      const row = rows.find(
        (r) => r.part === part.id && r.base_hash === baseHash,
      );
      return {
        ...part,
        text: row?.content ?? part.text,
        baseHash,
        revision: row?.id || 0,
      };
    }),
  );
}
function assetRequest(request) {
  const headers = new Headers(request.headers);
  headers.delete("If-None-Match");
  headers.delete("If-Modified-Since");
  return new Request(request, { headers });
}
export async function serveArticle(request, env) {
  const slug = decodeURIComponent(
    new URL(request.url).pathname.split("/")[2] || "",
  );
  const article = articles.find((a) => a.slug === slug);
  const response = await env.ASSETS.fetch(assetRequest(request));
  if (!article || response.status !== 200 || !env.DB) return response;
  const parts = await liveParts(env, article);
  const changed = parts.filter((p) => p.revision);
  if (!changed.length) {
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store");
    headers.delete("ETag");
    headers.delete("Last-Modified");
    return new Response(response.body, { status: response.status, headers });
  }
  const rewriter = new HTMLRewriter();
  rewriter.on(".article-tools .badge", {
    element(el) {
      el.setInnerContent("Community edited - see page history");
    },
  });
  const summary = changed.find((p) => p.id === "summary");
  if (summary)
    rewriter.on('meta[name="description"]', {
      element(el) {
        el.setAttribute("content", summary.text);
      },
    });
  for (const part of changed) {
    rewriter.on(`[data-live-part="${part.id}"]`, {
      element(el) {
        el.setInnerContent(renderPart(part, part.text), { html: true });
      },
    });
  }
  const transformed = rewriter.transform(response);
  const headers = new Headers(transformed.headers);
  headers.set("Cache-Control", "no-store");
  headers.delete("ETag");
  headers.delete("Last-Modified");
  headers.delete("Content-Length");
  return new Response(transformed.body, {
    status: transformed.status,
    headers,
  });
}

export async function serveIndex(request, env) {
  const response = await env.ASSETS.fetch(assetRequest(request));
  if (!env.DB || response.status !== 200) return response;
  const slugs = (
    await env.DB.prepare("SELECT DISTINCT slug FROM article_revisions")
      .bind()
      .all()
  ).results;
  const rewriter = new HTMLRewriter();
  for (const { slug } of slugs) {
    const article = articles.find((a) => a.slug === slug);
    if (!article) continue;
    const parts = await liveParts(env, article);
    const selector = `.card[href="/wiki/${article.slug}/"]`;
    rewriter.on(selector, {
      element(el) {
        el.setAttribute(
          "data-search",
          [
            article.title,
            article.category,
            releaseSearchText(article.slug),
            ...parts.map((p) => p.text),
          ]
            .join(" ")
            .toLowerCase(),
        );
      },
    });
    rewriter.on(`${selector} p`, {
      element(el) {
        el.setInnerContent(parts.find((p) => p.id === "summary").text);
      },
    });
  }
  const result = rewriter.transform(response),
    headers = new Headers(result.headers);
  headers.set("Cache-Control", "no-store");
  headers.delete("ETag");
  headers.delete("Last-Modified");
  headers.delete("Content-Length");
  return new Response(result.body, { status: result.status, headers });
}
