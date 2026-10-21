import { parseFragment } from "parse5";
const content = (n) =>
  n.nodeName === "#text"
    ? n.value
    : n.tagName === "br"
      ? "; "
      : ["script", "style", "table"].includes(n.tagName)
        ? ""
        : (n.childNodes || []).map(content).join("");
const descendants = (node, tag) =>
  (node.childNodes || []).flatMap((n) =>
    n.tagName === tag ? [n] : n.tagName === "table" ? [] : descendants(n, tag),
  );
// Expand explicit HTML spans before converting merged combo tables to plain cells.
export function htmlTables(html) {
  const root = parseFragment(html),
    tables = [];
  const visit = (n) => {
    if (n.tagName === "table") {
      tables.push(n);
      return;
    }
    for (const c of n.childNodes || []) visit(c);
  };
  visit(root);
  return tables.map((table) => {
    const grid = [];
    let carry = new Map();
    for (const tr of descendants(table, "tr")) {
      const row = [],
        next = new Map();
      for (const [i, s] of carry) {
        row[i] = s.text;
        if (s.left > 1) next.set(i, { text: s.text, left: s.left - 1 });
      }
      let col = 0;
      for (const cell of (tr.childNodes || []).filter((n) =>
        ["td", "th"].includes(n.tagName),
      )) {
        while (row[col] !== undefined) col++;
        const attrs = Object.fromEntries(
          (cell.attrs || []).map((a) => [a.name, a.value]),
        );
        const span = Number(attrs.colspan || 1),
          height = Number(attrs.rowspan || 1);
        if (
          !Number.isInteger(span) ||
          !Number.isInteger(height) ||
          span < 1 ||
          height < 1 ||
          span > 100 ||
          height > 10000
        )
          throw Error("Unsupported table span");
        const text = content(cell).replace(/\s+/g, " ").trim();
        for (let i = 0; i < span; i++) {
          if (row[col] !== undefined) throw Error("Overlapping table spans");
          row[col] = text;
          if (height > 1) next.set(col, { text, left: height - 1 });
          col++;
        }
      }
      grid.push(row);
      carry = next;
    }
    if (carry.size) throw Error("Table rowspan exceeds row count");
    return grid;
  });
}
