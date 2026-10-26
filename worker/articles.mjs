import {
  findCompanionArticle,
  serveCompanionArticle,
  supplementCompanionArticle,
} from "./companion-catalog.mjs";
import { pristineDocumentResponse } from "./editor-baselines.mjs";
import { catalogRecord } from "./catalog-packs.mjs";
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
export async function findArticle(slug, env) {
  const article = articles.find((a) => a.slug === slug);
  if (article) return article;
  if (!/^[A-Za-z0-9_-]+$/.test(slug) || !env?.ASSETS)
    throw new HttpError(404, "Article not found.");
  const packed = await catalogRecord(env, slug, "article");
  if (!packed) {
    const companion = await findCompanionArticle(slug, env);
    if (companion) return companion;
    throw new HttpError(404, "Article not found.");
  }
  return JSON.parse(packed);
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
export async function getDocumentState(env, article, { prebuilt = true } = {}) {
  if (prebuilt) {
    const response = await pristineDocumentResponse(env, article);
    if (response) return response.json();
  }
  const state = await articleState(env, article);
  const document =
    state.document ||
    baselineDocument(article, state.parts, [
      ...articles.filter((a) => article.related?.includes(a.slug)),
      ...(await Promise.all(
        (article.related || [])
          .filter((slug) => !articles.some((a) => a.slug === slug))
          .map((slug) => findArticle(slug, env)),
      )),
    ]);
  return {
    document,
    revision: state.revision,
    baseHash: await hash(JSON.stringify(document)),
    ...renderDocument(document, { slug: article.slug }),
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
  let response = await env.ASSETS.fetch(assetRequest(request));
  if (
    response.status === 404 &&
    /^\/wiki\/[^/]+\/?$/.test(new URL(request.url).pathname) &&
    /^[A-Za-z0-9_-]+$/.test(slug)
  ) {
    const html = await catalogRecord(env, slug, "html");
    if (html) {
      const url = new URL(request.url);
      if (!url.pathname.endsWith("/"))
        return new Response(null, {
          status: 301,
          headers: { Location: url.pathname + "/" + url.search },
        });
      response = new Response(
        request.method === "HEAD" ? null : JSON.parse(html),
        {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "Referrer-Policy": "strict-origin-when-cross-origin",
          },
        },
      );
    }
  }
  if (response.status === 404 && /^Item_[1-9]\d{0,29}$/.test(slug)) {
    const article = await findCompanionArticle(slug, env);
    if (article) response = await serveCompanionArticle(request, env, article);
  }
  if (response.status !== 200 || !env.DB) return response;
  const revision = await env.DB.prepare(
    "SELECT id FROM article_revisions WHERE slug=? LIMIT 1",
  )
    .bind(slug)
    .first();
  if (!revision) {
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store");
    headers.delete("ETag");
    headers.delete("Last-Modified");
    return supplementCompanionArticle(
      new Response(response.body, { status: response.status, headers }),
      slug,
      env,
    );
  }
  const article = await findArticle(slug, env);
  const { parts, document } = await articleState(env, article);
  const changed = parts.filter((p) => p.revision);
  if (!changed.length && !document) {
    const headers = new Headers(response.headers);
    headers.set("Cache-Control", "no-store");
    headers.delete("ETag");
    headers.delete("Last-Modified");
    return supplementCompanionArticle(
      new Response(response.body, { status: response.status, headers }),
      slug,
      env,
    );
  }
  const rewriter = new HTMLRewriter();
  rewriter.on(".article-tools .badge", {
    element(el) {
      el.setInnerContent("Community edited - see page history");
    },
  });
  if (document) {
    const { html, toc } = renderDocument(document, {
      editLinks: true,
      slug: article.slug,
    });
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
          renderPart(part, part.text, {
            slug: article.slug,
            references:
              article.sections[Number(part.id.split("-")[1])]?.references,
          }),
          { html: true },
        );
      },
    });
  }
  const videos = changed.find((p) => p.id === "videos");
  if (!document && videos)
    rewriter.on("#video-walkthroughs", {
      element(el) {
        if (videos.text.trim()) el.removeAttribute("hidden");
        else el.setAttribute("hidden", "");
      },
    });
  // Empty imported sections retain their original revision keys. A later legacy
  // correction can populate one, so reveal both the section and its contents link.
  if (!document)
    for (const part of changed) {
      if (!/^section-\d+$/.test(part.id) || !part.text.trim()) continue;
      for (const selector of [
        `#${part.id}`,
        `#article-toc a[href="#${part.id}"]`,
      ])
        rewriter.on(selector, {
          element(el) {
            el.removeAttribute("hidden");
          },
        });
    }
  const transformed = rewriter.transform(response);
  const headers = new Headers(transformed.headers);
  headers.set("Cache-Control", "no-store");
  headers.delete("ETag");
  headers.delete("Last-Modified");
  headers.delete("Content-Length");
  return supplementCompanionArticle(
    new Response(transformed.body, {
      status: transformed.status,
      headers,
    }),
    slug,
    env,
  );
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
