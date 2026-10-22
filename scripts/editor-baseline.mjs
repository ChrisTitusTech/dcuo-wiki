import { createHash } from "node:crypto";
import { articleParts } from "../shared/article-content.mjs";
import { baselineDocument, renderDocument } from "../shared/rich-article.mjs";
export function editorBaseline(article, related = []) {
  const document = baselineDocument(article, articleParts(article), related);
  return {
    document,
    revision: 0,
    baseHash: createHash("sha256")
      .update(JSON.stringify(document))
      .digest("hex"),
    ...renderDocument(document, { slug: article.slug }),
  };
}

export function catalogEditorBaseline(article, catalog) {
  return editorBaseline(
    article,
    catalog.filter((a) => article.related?.includes(a.slug)),
  );
}
