// Stage structured content from a cached Firecrawl capture. Publication is separate.
import { readFile, writeFile } from "node:fs/promises";
import {
  cleanImportText,
  cleanImportItems,
  missingImportText,
} from "../shared/import-text.mjs";
import { createHash } from "node:crypto";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { gfm } from "micromark-extension-gfm";
import { currencyPlain, currencyImageName } from "./catalog-currency.mjs";

export function plain(node) {
  if (node.type === "image") return "";
  if (node.type === "html") {
    if (/^<br\s*\/?\s*>$/i.test(node.value)) return "; ";
    throw new Error(`Unsupported embedded HTML: ${node.value.slice(0, 60)}`);
  }
  if (node.value !== undefined) return node.value;
  return (node.children || [])
    .map(plain)
    .join(node.type === "list" || node.type === "listItem" ? "; " : "");
}
const walk = (node, fn, parent) => {
  fn(node, parent);
  for (const child of node.children || []) walk(child, fn, node);
};
const clean = (value) =>
  cleanImportText(
    value
      .replace(/\s+/g, " ")
      .replace(/\s*;\s*;/g, ";")
      .trim(),
  );
const safe = (value) => {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && !u.username && !u.password;
  } catch {
    return false;
  }
};
/** @param {string} markdown @param {string} source @param {{headingTitle?: (title:string, depth:number)=>string, currencies?:boolean}} [options] */
export function convertReference(markdown, source, options = {}) {
  const contentPlain = options.currencies
    ? (node) => currencyPlain(node, plain)
    : plain;
  const tree = fromMarkdown(markdown, {
    extensions: [gfm()],
    mdastExtensions: [gfmFromMarkdown()],
  });
  const sections = [],
    images = [],
    audit = [];
  let title = "Source overview",
    nodes = [];
  function flush() {
    const items = [],
      references = [],
      sectionImages = [],
      tables = [];
    for (const node of nodes) {
      if (node.type === "table" && /^Expandv/.test(plain(node.children[0]))) {
        audit.push({ title, omitted: "Navigation template" });
        continue;
      }
      walk(node, (n, parent) => {
        if (n.type === "image") {
          if (options.currencies && currencyImageName(n)) {
            audit.push({
              title,
              omitted: "Currency icon represented inline with its source label",
            });
            return;
          }
          const u = (
            parent?.type === "link" &&
            parent.url.startsWith("https://static.wikia.nocookie.net/")
              ? parent.url
              : n.url
          ).replace(/\/scale-to-width-down\/\d+/, "");
          if (!u.startsWith("https://static.wikia.nocookie.net/dcuo/images/"))
            return;
          const filename = decodeURIComponent(
            new URL(u).pathname.split("/")[5],
          );
          if (!/\.(png|jpe?g|webp)$/i.test(filename)) {
            audit.push({
              title,
              omitted:
                "Embedded video or unsupported media; requires separate verification",
              image: filename,
            });
            return;
          }
          // Tiny repeated UI badges convey no article detail. Preserve their omission in the audit.
          if (
            /^(MiscItem\d+|Collection_Icon|Mail_icon|Feats_Icon_clean|Investigation_Icon|InvestigationRadioIntercept|InvestigationSatellite|InvestigationTelevisionBroadcast)|^(Icon_|Star_|Feat_Star)/i.test(
              filename,
            )
          ) {
            audit.push({
              title,
              omitted: "Decorative UI icon",
              image: filename,
            });
            return;
          }
          const sourcePage =
            "https://dcuniverseonline.fandom.com/wiki/File:" + filename;
          if (!images.some((x) => x.sourcePage === sourcePage))
            images.push({
              sourcePage,
              originalUrl: u,
              discoveredOn: source,
              credit:
                "DC Universe Online Wiki contributors; game artwork belongs to its respective owners.",
              rights:
                "Game artwork. No separate reusable-image license was stated in the retrieved article; no CC-BY-SA image license is asserted.",
              retrieved: "2026-10-21",
            });
          if (!sectionImages.some((x) => x.url === sourcePage))
            sectionImages.push({
              label: n.alt || filename.replaceAll("_", " "),
              url: sourcePage,
            });
        }
        if (
          n.type === "link" &&
          safe(n.url) &&
          new URL(n.url).hostname === "dcuniverseonline.fandom.com" &&
          !n.url.includes("veaction=") &&
          !n.children?.some((c) => c.type === "image")
        ) {
          const label = clean(plain(n));
          if (label && !references.some((r) => r.url === n.url))
            references.push({ label, url: n.url });
        }
      });
      if (node.type === "table") {
        const raw = node.children.map((r) =>
          r.children.map((c) => clean(contentPlain(c))),
        );
        if (!raw.flat().some(Boolean)) continue;
        // Some Fandom tables have an empty Markdown header before the actual labels.
        const replacementLabels = new Set([
          "Star Rating|Difficulty|Points Awarded",
          "Feat Level|Replay Badges Cost|Cost per Skill Point",
        ]);
        if (
          raw.length > 2 &&
          raw[0].every((c) => !c) &&
          replacementLabels.has(raw[1].join("|"))
        )
          raw.shift();
        if (raw[0].every((c) => !c)) {
          for (const row of raw.slice(1))
            for (const cell of row)
              for (const item of cell.split(/;\s*(?:-\s*)?/)) {
                const value = item.replace(/^-\s*/, "").trim();
                if (value) items.push(value);
              }
        } else {
          const cols = raw[0]
            .map((_, i) => i)
            .filter((i) => raw.slice(1).some((r) => r[i]));
          if (cols.length < raw[0].length)
            audit.push({
              title,
              omitted:
                "Empty or image-only table columns; substantive images handled separately",
            });
          tables.push({
            caption: title,
            columns: cols.map((i) => raw[0][i] || "Details"),
            rows: raw
              .slice(1)
              .map((r) =>
                cols.map((i) => (missingImportText(r[i] || "") ? "" : r[i])),
              ),
          });
        }
      } else if (node.type === "list") {
        for (const li of node.children) {
          const value = clean(contentPlain(li));
          if (value) items.push(value);
        }
      } else if (["paragraph", "blockquote"].includes(node.type)) {
        const value = clean(contentPlain(node));
        if (/^\|.*\|$/.test(value))
          throw new Error(
            `Malformed Markdown table in ${title}; inspect the source HTML`,
          );
        if (value && !/^\d+\/\d+$/.test(value)) items.push(value);
      } else
        throw new Error(
          "Unsupported source node " + node.type + " in " + title,
        );
    }
    const chunks = [];
    let chunk = [];
    for (const item of cleanImportItems(items)) {
      if (item.length > 6500)
        throw new Error("Oversized paragraph in " + title);
      if (chunk.join("\n").length + item.length > 6500) {
        chunks.push(chunk);
        chunk = [];
      }
      chunk.push(item);
    }
    if (chunk.length) chunks.push(chunk);
    if (!chunks.length && (sectionImages.length || references.length))
      chunks.push(["Source details and references for " + title + "."]);
    chunks.forEach((items, i) =>
      sections.push({
        title: title + (i ? " (continued " + (i + 1) + ")" : ""),
        items,
        ...(i === 0 && sectionImages.length ? { images: sectionImages } : {}),
        ...(i === 0 && references.length ? { references } : {}),
      }),
    );
    for (const table of tables) {
      let rows = [],
        size = 0,
        part = 1;
      const emit = () => {
        if (rows.length)
          sections.push({
            title: table.caption + " - table " + part++,
            items: [
              "Source-listed entries. Follow the source references above for unconverted detail pages.",
            ],
            table: { ...table, rows },
          });
        rows = [];
        size = 0;
      };
      for (const row of table.rows) {
        const len = row.join(" | ").length + 1;
        if (len > 6500) throw new Error("Oversized table row");
        if (size + len > 6500) emit();
        rows.push(row);
        size += len;
      }
      emit();
    }
    audit.push({
      title,
      paragraphs: items.length,
      tableRows: tables.reduce((n, t) => n + t.rows.length, 0),
      images: sectionImages.length,
      references: references.length,
    });
    nodes = [];
  }
  for (const node of tree.children) {
    if (node.type === "heading") {
      flush();
      const heading = plain(node).split("[ Edit section:")[0].trim();
      title = options.headingTitle
        ? options.headingTitle(heading, node.depth)
        : heading;
    } else {
      if (title === "Contents" && node.type === "list") continue;
      if (title === "Contents") title = "Source details";
      nodes.push(node);
    }
  }
  flush();
  return {
    source,
    sourceMarkdownSha256: createHash("sha256").update(markdown).digest("hex"),
    reviewed: false,
    sections,
    images,
    audit,
  };
}
if (
  process.argv[1] &&
  import.meta.url === new URL("file:" + process.argv[1]).href
) {
  for (const slug of process.argv.slice(2)) {
    if (!/^[A-Za-z0-9_-]+$/.test(slug)) throw new Error("Invalid source slug");
    const source = "https://dcuniverseonline.fandom.com/wiki/" + slug;
    const cache = JSON.parse(
      await readFile(
        ".import-cache/" +
          createHash("sha256").update(source).digest("hex") +
          ".json",
        "utf8",
      ),
    );
    const result = convertReference(cache.markdown, source);
    await writeFile(
      ".import-cache/reference-" + slug + ".json",
      JSON.stringify(result, null, 2) + "\n",
    );
    console.log(slug, JSON.stringify(result.audit));
  }
}
