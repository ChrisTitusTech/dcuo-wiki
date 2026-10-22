import { releaseSearchText } from "../shared/releases.mjs";
import articles from "../src/data/articles.json" with { type: "json" };
import { articleParts, renderPart } from "../shared/article-content.mjs";
import { hash, HttpError } from "./security.mjs";
import {
  baselineDocument,
  validateDocument,
  renderDocument,
  documentText,
} from "../shared/rich-article.mjs";
export function findArticle(slug) {
  const article = articles.find((a) => a.slug === slug);
  if (!article) throw new HttpError(404, "Article not found.");
  return article;
}
export async function articleState(env, article) {
  const parts = articleParts(article);
  const rows = (
    await env.DB.prepare(
      "SELECT id,part,base_hash,content FROM article_revisions WHERE (part<>'document' AND id IN (SELECT MAX(id) FROM article_revisions WHERE slug=? AND part<>'document' GROUP BY part,base_hash)) OR id=(SELECT MAX(id) FROM article_revisions WHERE slug=? AND part='document') ORDER BY id DESC",
    )
      .bind(article.slug, article.slug)
      .all()
  ).results;
  const effective = await Promise.all(
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
  const row = rows.find((r) => r.part === "document");
  const document = row ? validateDocument(JSON.parse(row.content)) : null;
  if (document) {
    const summary = effective.find((p) => p.id === "summary");
    summary.text = document.summary;
    summary.revision = row.id;
  }
  return { parts: effective, document, revision: rows[0]?.id || 0 };
}
export async function liveParts(env, article) {
  return (await articleState(env, article)).parts;
}
export async function getDocumentState(env, article) {
  const state = await articleState(env, article);
  const document =
    state.document ||
    baselineDocument(
      article,
      state.parts,
      articles.filter((a) => article.related?.includes(a.slug)),
    );
  return {
    document,
    revision: state.revision,
    baseHash: await hash(JSON.stringify(document)),
    ...renderDocument(document),
  };
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
  const { parts, document } = await articleState(env, article);
  const changed = parts.filter((p) => p.revision);
  if (!changed.length && !document) {
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
  if (document) {
    const { html, toc } = renderDocument(document, { editLinks: true });
    rewriter.on("#article-body", {
      element(el) {
        el.setInnerContent(html, { html: true });
      },
    });
    rewriter.on("#article-toc", {
      element(el) {
        el.setInnerContent(toc, { html: true });
      },
    });
    rewriter.on(".article-top h1", {
      element(el) {
        el.setInnerContent(document.title);
      },
    });
    rewriter.on("title", {
      element(el) {
        el.setInnerContent(document.title + " | DCUO Wiki");
      },
    });
  }
  const summary = changed.find((p) => p.id === "summary");
  if (summary)
    rewriter.on('meta[name="description"]', {
      element(el) {
        el.setAttribute("content", summary.text);
      },
    });
  for (const part of changed) {
    if (document && part.id !== "summary") continue;
    rewriter.on(`[data-live-part="${part.id}"]`, {
      element(el) {
        el.setInnerContent(
          renderPart(part, part.text, { slug: article.slug }),
          { html: true },
        );
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
    const { parts, document } = await articleState(env, article);
    const selector = `.card[href="/wiki/${article.slug}/"]`;
    rewriter.on(selector, {
      element(el) {
        el.setAttribute(
          "data-search",
          [
            document?.title || article.title,
            article.category,
            releaseSearchText(article.slug),
            ...(document
              ? [document.summary, documentText(document.content)]
              : parts.map((p) => p.text)),
          ]
            .join(" ")
            .toLowerCase(),
        );
      },
    });
    if (document)
      rewriter.on(`${selector} h3`, {
        element(el) {
          el.setInnerContent(document.title);
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
