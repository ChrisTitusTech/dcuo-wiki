// Compact lookup for published articles; never ship the full article catalog to editors.
import fs from "node:fs/promises";
import { sectionHasContent } from "../shared/import-text.mjs";
const articles = JSON.parse(
  await fs.readFile("src/data/articles.json", "utf8"),
);
const records = articles.map((a) => ({
  slug: a.slug,
  title: a.title,
  source: a.source,
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
