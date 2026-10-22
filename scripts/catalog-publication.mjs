import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";
import { introductory, links } from "./assign-guide-releases.mjs";
import { plain } from "./convert-reference.mjs";
const digest = (s) => createHash("sha256").update(s).digest("hex");
const paths = new Set([
  "src/data/articles.json",
  "src/data/guide-releases.json",
  "data/guide-release-assignments.json",
  "data/catalog-imports.json",
]);
export function catalogReleaseIds(markdown, category, aliases) {
  if (category !== "Locations") return ["game-systems"];
  const nodes = fromMarkdown(markdown, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  }).children;
  const intro = introductory(nodes);
  const badges = intro
    .flatMap(links)
    .filter((r) => r.badge && aliases.has(r.url))
    .flatMap((r) => aliases.get(r.url));
  if (badges.length) return [...new Set(badges)];
  const association = intro.find((n) =>
    /\b(?:zone|location|area|headquarters)\b.*\b(?:episode|event|chapter)\b/i.test(
      plain(n),
    ),
  );
  const ids = association
    ? links(association)
        .filter((r) => aliases.has(r.url))
        .flatMap((r) => aliases.get(r.url))
    : [];
  return ids.length ? [...new Set(ids)] : ["core-game"];
}
// A write-ahead journal makes the four-file publication resumable. Refuse to
// overwrite a file changed outside this transaction after an interrupted run.
export async function recoverCatalogPublication(journal) {
  let saved;
  try {
    saved = JSON.parse(await fs.readFile(journal, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return false;
    throw e;
  }
  for (const row of saved) {
    if (!paths.has(row.path)) throw Error("Unexpected publication path");
    const current = digest(
      await fs.readFile(row.path, "utf8").catch((e) => {
        if (e.code === "ENOENT") return "";
        throw e;
      }),
    );
    if (current !== row.before && current !== digest(row.after))
      throw Error("Publication file changed outside transaction: " + row.path);
  }
  for (const row of saved) {
    await fs.writeFile(row.path + ".tmp", row.after);
    await fs.rename(row.path + ".tmp", row.path);
  }
  await fs.unlink(journal);
  return true;
}
export async function writeCatalogPublication(entries, journal) {
  const rows = [];
  for (const [path, data] of entries) {
    if (!paths.has(path)) throw Error("Unexpected publication path");
    const prior = await fs.readFile(path, "utf8").catch((e) => {
      if (e.code === "ENOENT") return "";
      throw e;
    });
    rows.push({
      path,
      before: digest(prior),
      after: JSON.stringify(data, null, 2) + "\n",
    });
  }
  await fs.writeFile(journal + ".tmp", JSON.stringify(rows));
  await fs.rename(journal + ".tmp", journal);
  await recoverCatalogPublication(journal);
}
