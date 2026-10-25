import currencies from "../src/data/currencies.json" with { type: "json" };
const normal = (s) =>
  s
    .toLowerCase()
    .replace(/^icon[_ ]*/, "")
    .replace(/\.(png|jpg|webp|gif)$/i, "")
    .replace(/[^a-z0-9]/g, "")
    .replace(/ies$/, "y")
    .replace(/s$/, "");
const files = new Map(
  currencies
    .filter((c) => c.sourcePage)
    .map((c) => [decodeURIComponent(c.sourcePage.split("File:")[1]), c.name]),
);
export function currencyImageName(node) {
  if (node.type !== "image") return null;
  let filename;
  try {
    const u = new URL(node.url);
    if (
      u.hostname !== "static.wikia.nocookie.net" ||
      !u.pathname.startsWith("/dcuo/images/")
    )
      return null;
    filename = decodeURIComponent(u.pathname.split("/")[5]);
  } catch {
    return null;
  }
  if (files.has(filename)) return files.get(filename);
  const matches = currencies.filter((c) =>
    c.aliases.some((a) => normal(a) === normal(node.alt || filename)),
  );
  return matches.length === 1 ? matches[0].name : null;
}
// Only suppress an icon when its own amount already has a written label.
// A currency mentioned elsewhere in prose or a nested list is unrelated.
const aliasPattern = currencies
  .flatMap((c) => c.aliases)
  .sort((a, b) => b.length - a.length)
  .map((a) => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  .join("|");
const beforeLabel = new RegExp(
  "(?:^|\\b)(?:" + aliasPattern + ")(?:\\s+[\\d.,]+)?\\s*$",
  "i",
);
const afterLabel = new RegExp(
  "^\\s*(?:[\\d.,]+\\s+)?(?:" + aliasPattern + ")(?:\\b|$)",
  "i",
);
export function currencyPlain(node, plain) {
  const tokens = [];
  function flatten(n) {
    if (n.type === "image") {
      const name = currencyImageName(n);
      tokens.push({ name });
    } else if (n.type === "html") tokens.push({ text: plain(n) });
    else if (n.value !== undefined) tokens.push({ text: n.value });
    else
      (n.children || []).forEach((child, i) => {
        if (i && (n.type === "list" || n.type === "listItem"))
          tokens.push({ text: "; " });
        flatten(child);
      });
  }
  flatten(node);
  const labels = new Set();
  const value = tokens
    .map((token, i) => {
      if (token.text !== undefined) return token.text;
      if (!token.name) return "";
      labels.add(token.name);
      let before = "",
        after = "";
      for (let j = i - 1; j >= 0 && tokens[j].text !== undefined; j--)
        before = tokens[j].text + before;
      for (
        let j = i + 1;
        j < tokens.length && tokens[j].text !== undefined;
        j++
      )
        after += tokens[j].text;
      return beforeLabel.test(before) || afterLabel.test(after)
        ? ""
        : " " + token.name + " ";
    })
    .join("");
  const base = plain(node);
  return /^\s*\d[\d.,]*\s*$/.test(base) && labels.size === 1
    ? base.trim() + " " + [...labels][0]
    : value;
}
