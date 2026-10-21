import { readFile } from "node:fs/promises";
import { issuesFor } from "./content-policy.mjs";
const articles = JSON.parse(
  await readFile(new URL("../src/data/articles.json", import.meta.url)),
);
const seen = new Set();
let failures = 0;
for (const a of articles) {
  const errors = issuesFor(a);
  if (seen.has(a.slug)) errors.push("duplicate slug");
  seen.add(a.slug);
  if (errors.length) {
    console.error(a.slug, errors);
    failures++;
  }
}
if (failures) process.exitCode = 1;
else console.log(`${articles.length} articles passed publication policy.`);
