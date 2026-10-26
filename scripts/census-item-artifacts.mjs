import { parseFragment } from "parse5";
export function infoboxArtifactDetails(html) {
  const doc = parseFragment(html),
    descriptions = [];
  const text = (node) =>
    node.nodeName === "#text"
      ? node.value
      : node.nodeName === "br"
        ? "\n"
        : (node.childNodes || []).map(text).join("") +
          (["p", "li"].includes(node.nodeName) ? "\n" : "");
  const visit = (node) => {
    if (
      node.attrs?.some(
        (a) => a.name === "data-source" && a.value === "description",
      )
    )
      descriptions.push(text(node));
    for (const child of node.childNodes || []) visit(child);
  };
  visit(doc);
  const description = descriptions.join("\n");
  const lines = description
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const boundary = lines.findIndex((line) =>
    /Upcoming Rank Bonuses/i.test(line),
  );
  const ranks = lines.flatMap((line) => {
    const m = /^\((\d{1,3})\)\s*(.+)$/.exec(line);
    return m ? [[m[1], m[2]]] : [];
  });
  if (boundary < 0 || ranks.length < 3)
    throw new Error("Infobox lacks structured artifact rank bonuses");
  const effects = lines
    .slice(0, boundary)
    .filter((l) => l !== "Unique Equip")
    .join("\n\n");
  if (effects.length < 50 || /\.\.\.|…/.test(effects))
    throw new Error("Infobox lacks substantive effects");
  return {
    effects,
    ranks,
    markdown: `\n\n## Artifact effects\n\n${effects}\n\n## Rank bonuses\n\n| Rank | Source-listed bonus |\n| --- | --- |\n${ranks.map((row) => "| " + row.map((v) => v.replaceAll("|", " / ")).join(" | ") + " |").join("\n")}\n`,
  };
}
