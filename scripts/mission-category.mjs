import { parse } from "parse5";
import { classifyURL, origin } from "./wiki-urls.mjs";
export const missionCategory = origin + "/wiki/Category:Missions";
export function parseMissionCategory(html) {
  const entries = new Map();
  let nextUrl = null,
    total = null;
  function walk(node) {
    const attrs = Object.fromEntries(
      (node.attrs || []).map((a) => [a.name, a.value]),
    );
    const classes = (attrs.class || "").split(/\s+/);
    if (classes.includes("category-page__member-link")) {
      const entry = classifyURL(attrs.href);
      if (entry.kind === "excluded")
        throw new Error("Unexpected category member");
      entries.set(entry.url, entry);
    }
    if (classes.includes("category-page__pagination-next")) {
      const u = new URL(attrs.href, origin);
      if (
        u.origin + u.pathname !== missionCategory ||
        u.username ||
        u.password ||
        !u.searchParams.has("from")
      )
        throw new Error("Unexpected mission category continuation");
      nextUrl = u.href;
    }
    if (classes.includes("category-page__total-number")) {
      const text = (n) => n.value || (n.childNodes || []).map(text).join("");
      const match = text(node).match(/All items \(([\d,]+)\)/);
      if (match) total = Number(match[1].replaceAll(",", ""));
    }
    for (const child of node.childNodes || []) walk(child);
  }
  walk(parse(html));
  if (!entries.size || total === null)
    throw new Error("Missing mission category members or total");
  return { entries: [...entries.values()], nextUrl, total };
}
