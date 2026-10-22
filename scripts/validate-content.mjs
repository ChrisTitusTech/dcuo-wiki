import { readFile } from "node:fs/promises";
import { releases, releasesFor, releaseIdsFor } from "../shared/releases.mjs";
import { issuesFor } from "./content-policy.mjs";
const articles = JSON.parse(
  await readFile(new URL("../src/data/articles.json", import.meta.url)),
);
const releaseIds = new Set(releases.map((r) => r.id));
const seen = new Set();
let failures = 0;
for (const a of articles) {
  const errors = issuesFor(a);
  if (!releasesFor(a.slug).length)
    errors.push("missing content release assignment");
  for (const id of releaseIdsFor(a.slug))
    if (!releaseIds.has(id)) errors.push("unknown release " + id);
  if (seen.has(a.slug)) errors.push("duplicate slug");
  seen.add(a.slug);
  for (const slug of a.related || [])
    if (!articles.some((other) => other.slug === slug))
      errors.push(`missing related guide: ${slug}`);
  if (errors.length) {
    console.error(a.slug, errors);
    failures++;
  }
}
if (failures) process.exitCode = 1;
else console.log(`${articles.length} articles passed publication policy.`);
