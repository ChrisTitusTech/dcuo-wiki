import fs from "node:fs/promises";
import {
  cleanImportedArticle,
  cleanRewardContexts,
} from "../shared/import-text.mjs";
const path = "src/data/articles.json";
const articles = JSON.parse(await fs.readFile(path, "utf8"));
const cleaned = articles.map(cleanImportedArticle);
// The source has a broken opening character here. The overview and walkthrough
// both name Coast City, so repair the obvious transcription error explicitly.
const coast = cleaned.find((a) => a.slug === "Disturbance_on_the_Coast");
coast.sections.find((s) => s.title === "Objectives").items = coast.sections
  .find((s) => s.title === "Objectives")
  .items.map((t) =>
    t.replace("Restore Order in [oast City", "Restore Order in Coast City"),
  );
const changed = cleaned.filter(
  (a, i) => JSON.stringify(a) !== JSON.stringify(articles[i]),
);
console.log(
  JSON.stringify(
    {
      articles: articles.length,
      changed: changed.length,
      slugs: changed.map((a) => a.slug),
    },
    null,
    2,
  ),
);
if (process.argv.includes("--write")) {
  await fs.writeFile(path, JSON.stringify(cleaned, null, 2) + "\n");
  const rewards = JSON.parse(
    await fs.readFile("src/data/reward-context.json", "utf8"),
  );
  await fs.writeFile(
    "src/data/reward-context.json",
    JSON.stringify(cleanRewardContexts(rewards, cleaned), null, 2) + "\n",
  );
}
