// Compact lookup for published articles; never ship the full article catalog to editors.
import fs from "node:fs/promises";
import { sectionHasContent } from "../shared/import-text.mjs";
const articles = JSON.parse(
  await fs.readFile("src/data/articles.json", "utf8"),
);
let imported = { aliases: [] };
try {
  imported = JSON.parse(await fs.readFile("data/catalog-imports.json", "utf8"));
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const records = articles.map((a) => ({
  slug: a.slug,
  title: a.title,
  source: a.source,
  ...(imported.aliases.some((r) => r.slug === a.slug)
    ? {
        aliases: imported.aliases
          .filter((r) => r.slug === a.slug && r.canonical === a.source)
          .map((r) => r.source),
      }
    : {}),
  faction:
    /\((Heroes|Villains)\)$/i.exec(a.title)?.[1] ||
    (/\bhero missions?\b/i.test(a.summary + " " + a.title) &&
    !/\bvillain missions?\b/i.test(a.summary + " " + a.title)
      ? "Heroes"
      : /\bvillain missions?\b/i.test(a.summary + " " + a.title) &&
          !/\bhero missions?\b/i.test(a.summary + " " + a.title)
        ? "Villains"
        : ""),
  sections: a.sections.flatMap((s, i) =>
    sectionHasContent(s) ? [[s.title, "section-" + i]] : [],
  ),
}));
const output = JSON.stringify(records) + "\n";
let previous;
try {
  previous = await fs.readFile("src/data/guide-links.json", "utf8");
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
if (previous !== output)
  await fs.writeFile("src/data/guide-links.json", output);
