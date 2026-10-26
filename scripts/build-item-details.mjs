// Offline, reviewed source definitions. Rank bonuses are source text, never equipped stats.
import fs from "node:fs/promises";
import { catalogArticles } from "./catalog-files.mjs";
const read = async (p) => JSON.parse(await fs.readFile(p, "utf8"));
const articles = [
  ...(await read("src/data/articles.json")),
  ...(await catalogArticles()),
];
const approved = new Map(
  (await read("data/migration/catalog-media.json")).map((m) => [
    m.sourcePage,
    m,
  ]),
);
const output = {};
for (const row of (await read("data/census-item-details.json")).records) {
  const article = articles.find((a) => a.slug === row.slug);
  if (!article) throw Error("Missing source article: " + row.slug);
  const fields = row.fields;
  const sections = row.effects
    ? [
        { heading: "Artifact effects", items: row.effects },
        {
          heading: "Rank bonuses",
          table: { columns: ["Rank", "Source-listed bonus"], rows: row.ranks },
        },
      ]
    : fields["on use"]
      ? [{ heading: "On use", items: [fields["on use"]] }]
      : [];
  const media = approved.get(row.iconSource?.sourcePage);
  output[row.slug] = {
    description: article.summary,
    itemType: fields["item type"],
    ...(fields.style ? { style: fields.style } : {}),
    ...(fields["requires level"]
      ? { requiredLevel: fields["requires level"] }
      : {}),
    ...(fields["requires cr"]
      ? { requiredCombatRating: fields["requires cr"] }
      : {}),
    ...(fields.requires
      ? { requirements: fields.requires.replace(/\[\[|\]\]/g, "") }
      : {}),
    source: row.source,
    sections,
    ...(media && /^[a-f0-9]{64}$/.test(media.id)
      ? { icon: "/api/catalog-media/" + media.id }
      : {}),
  };
}
const detector = articles.find((a) => a.slug === "Nth_Metal_Detector");
if (detector)
  output[detector.slug] = {
    description: detector.summary,
    source: detector.source,
    sections: [
      {
        heading: "Effects",
        items: detector.sections
          .find((s) => s.title === "Overview")
          .items.slice(1),
      },
    ],
  };
await fs.writeFile(
  "public/equipment-details.json",
  JSON.stringify(output) + "\n",
);
console.log(
  JSON.stringify({
    sourceItemDetails: Object.keys(output).length,
    pendingIcons: (await read("data/census-item-details.json")).records
      .filter((r) => !approved.has(r.iconSource?.sourcePage))
      .map((r) => r.iconSource),
  }),
);
