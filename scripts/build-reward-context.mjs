import { cleanRewardContexts } from "../shared/import-text.mjs";
// Restore icon-only currency labels from source without changing editable article text.
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { fromMarkdown } from "mdast-util-from-markdown";
import { gfm } from "micromark-extension-gfm";
import { gfmFromMarkdown } from "mdast-util-gfm";
import { plain } from "./convert-reference.mjs";
import { classifyURL } from "./wiki-urls.mjs";
const parse = (s) =>
  fromMarkdown(s, { extensions: [gfm()], mdastExtensions: [gfmFromMarkdown()] })
    .children;
const clean = (s) =>
  s
    .replace(/\s+/g, " ")
    .replace(/\s*;\s*;/g, ";")
    .trim();
const heading = (n) =>
  plain(n)
    .replace(/\[\s*Edit section:[\s\S]*$/, "")
    .replace(/\\/g, "")
    .trim();
const walk = (n, f) => {
  f(n);
  for (const c of n.children || []) walk(c, f);
};
const imageName = (url) => {
  try {
    return decodeURIComponent(new URL(url).pathname.split("/")[5]);
  } catch {
    return "";
  }
};
const comparable = (s) =>
  s.toLowerCase().replace(/ies\b/g, "y").replace(/s\b/g, "");
const norm = (s) =>
  s
    .toLowerCase()
    .replace(/^icon[_ ]*/, "")
    .replace(/\.(png|jpg|webp)$/, "")
    .replace(/[^a-z0-9]/g, "");
export function rewardAtoms(markdown, byImage) {
  const nodes = parse(markdown),
    atoms = [],
    rows = [];
  const value = (node) => {
    const base = clean(plain(node));
    const images = [];
    walk(node, (n) => {
      if (n.type === "image" && byImage.has(imageName(n.url)))
        images.push(byImage.get(imageName(n.url)));
    });
    const labels = [...new Set(images)];
    // Explicit text takes precedence when an icon names a different currency.
    const namedCurrency = [...new Set(byImage.values())].some((name) =>
      comparable(base).includes(comparable(name)),
    );
    function enriched(n) {
      if (n.type === "image") {
        const name = byImage.get(imageName(n.url));
        return name && !namedCurrency ? " " + name + " " : "";
      }
      if (n.value !== undefined) return n.type === "html" ? plain(n) : n.value;
      return (n.children || [])
        .map(enriched)
        .join(n.type === "list" || n.type === "listItem" ? "; " : "");
    }
    return {
      base,
      restored:
        /^\d[\d.,]*$/.test(base) && labels.length === 1
          ? base + " " + labels[0]
          : clean(enriched(node)),
      currencies: labels,
    };
  };
  for (const node of nodes) {
    if (node.type === "heading") continue;
    if (node.type === "table") {
      for (const row of node.children) {
        const cells = row.children.map(value);
        rows.push({
          base: cells.map((c) => c.base),
          restored: cells.map((c) => c.restored),
        });
        for (const c of cells) atoms.push(c);
      }
    } else if (node.type === "list")
      for (const item of node.children) atoms.push(value(item));
    else if (["paragraph", "blockquote"].includes(node.type))
      atoms.push(value(node));
  }
  return { atoms, rows };
}
export async function build() {
  const source = JSON.parse(
    await readFile(".import-cache/release-guides/currency-source.json", "utf8"),
  );
  const nodes = parse(source.markdown),
    currencies = [];
  let retired = false;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    if (n.type !== "heading") continue;
    if (n.depth === 2) retired = /Retired/.test(heading(n));
    if (n.depth !== 3) continue;
    const name = heading(n);
    let image;
    const prev = nodes[i - 1];
    if (prev)
      walk(prev, (c) => {
        if (c.type === "image") image = c;
      });
    if (
      image &&
      norm(image.alt || imageName(image.url)) !== norm(name) &&
      name !== "Cash" &&
      clean(plain(prev)).replaceAll("\\", "").length > 0
    )
      image = undefined;
    const filename = image && imageName(image.url),
      id = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    const aliases = new Set([
      name,
      name
        .replace(/^Mark of /, "Marks of ")
        .replace(/^Grain of /, "Grains of ")
        .replace(/^Symbol of /, "Symbols of ")
        .replace(/^Coin of /, "Coins of "),
    ]);
    if (!/\(old\)|Points$|Hearts$|Pods$|Leaves$/i.test(name))
      aliases.add(
        name.endsWith("Berry") ? name.slice(0, -1) + "ies" : name + "s",
      );
    if (name === "Hearts") aliases.add("Heart");
    if (name === "Seed Pods") aliases.add("Seed Pod");
    if (name === "Holly Leaves") aliases.add("Holly Leaf");
    currencies.push({
      id,
      name,
      aliases: [...aliases],
      retired,
      source:
        "https://dcuniverseonline.fandom.com/wiki/Currency#" +
        name.replaceAll(" ", "_"),
      ...(filename
        ? {
            sourcePage:
              "https://dcuniverseonline.fandom.com/wiki/File:" + filename,
            originalUrl: image.url.replace(/\/scale-to-width-down\/\d+/, ""),
          }
        : {}),
    });
  }
  const titan = currencies.find((c) => c.name === "Titans Token");
  if (titan && !titan.sourcePage) {
    const record = JSON.parse(
      await readFile("data/release-guide-import.json", "utf8"),
    ).records.find((r) => r.title === "Wrath_of_the_Worldkillers");
    const chapter = JSON.parse(await readFile(record.cacheFile, "utf8"));
    for (const node of parse(chapter.markdown))
      walk(node, (n) => {
        if (
          n.type === "image" &&
          norm(n.alt || imageName(n.url)) === norm(titan.name)
        ) {
          titan.sourcePage =
            "https://dcuniverseonline.fandom.com/wiki/File:" + imageName(n.url);
          titan.originalUrl = n.url.replace(/\/scale-to-width-down\/\d+/, "");
          titan.iconSource = record.url;
        }
      });
  }
  const byImage = new Map(
    currencies
      .filter((c) => c.sourcePage)
      .map((c) => [
        c.sourcePage.slice(c.sourcePage.indexOf("File:") + 5),
        c.name,
      ]),
  );
  const sources = new Map(
    JSON.parse(await readFile("data/media-sources.json", "utf8")).map((s) => [
      s.sourcePage,
      s,
    ]),
  );
  for (const c of currencies.filter((c) => c.sourcePage))
    if (!sources.has(c.sourcePage))
      sources.set(c.sourcePage, {
        sourcePage: c.sourcePage,
        originalUrl: c.originalUrl,
        discoveredOn:
          c.iconSource || "https://dcuniverseonline.fandom.com/wiki/Currency",
        credit:
          "DC Universe Online Wiki contributors; game artwork belongs to its respective owners.",
        rights:
          "Currency icon from the source wiki; no separate reusable-image license is asserted.",
        retrieved: new Date().toISOString().slice(0, 10),
      });
  const articles = JSON.parse(await readFile("src/data/articles.json", "utf8")),
    context = {},
    audit = [];
  for (const a of articles) {
    let cache;
    try {
      cache = JSON.parse(
        await readFile(
          ".import-cache/" +
            createHash("sha256")
              .update(classifyURL(a.source).url)
              .digest("hex") +
            ".json",
          "utf8",
        ),
      );
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
      continue;
    }
    const articleIcons = new Map(byImage);
    for (const node of parse(cache.markdown))
      walk(node, (n) => {
        if (n.type === "image" && !articleIcons.has(imageName(n.url))) {
          const matching = currencies.filter(
            (c) =>
              comparable(norm(c.name)) ===
              comparable(norm(n.alt || imageName(n.url))),
          );
          if (matching.length === 1)
            articleIcons.set(imageName(n.url), matching[0].name);
        }
      });
    const data = rewardAtoms(cache.markdown, articleIcons);
    const parts = {};
    for (const [i, s] of a.sections.entries()) {
      if (
        !/reward|result|loot|drop|deprecated/i.test(s.title) &&
        !s.table?.columns.some((c) => /reward|currency|cash|marks/i.test(c))
      )
        continue;
      const itemBase = s.items.map((v) => "- " + v).join("\n");
      const restored = s.items.map((item) => {
        const found = [
          ...new Set(
            data.atoms
              .filter((x) => x.base === item && x.restored !== item)
              .map((x) => x.restored),
          ),
        ];
        return found.length === 1 ? found[0] : item;
      });
      parts["section-" + i] = { base: itemBase, items: restored };
      if (s.table) {
        const rowValues = s.table.rows.map((row) => {
          const candidates = data.rows.filter(
            (r) =>
              r.base.length === row.length &&
              r.base.every((v, i) => (v || "Not specified") === row[i]),
          );
          const options = [
            ...new Map(
              candidates.map((r) => [JSON.stringify(r.restored), r.restored]),
            ).values(),
          ];
          return options.length === 1
            ? options[0].map((v, j) => v || row[j])
            : row;
        });
        parts["table-" + i] = {
          base: s.table.rows.map((r) => r.join(" | ")).join("\n"),
          rows: rowValues,
        };
      }
    }
    if (Object.keys(parts).length) {
      context[a.slug] = parts;
      audit.push({
        slug: a.slug,
        source: a.source,
        parts: Object.keys(parts).length,
        restoredItems: Object.values(parts).reduce(
          (n, p) =>
            n +
            (p.items?.filter(
              (v, j) =>
                v !==
                a.sections[
                  Number(
                    Object.keys(parts)
                      .find((k) => parts[k] === p)
                      ?.split("-")[1],
                  )
                ]?.items[j],
            ).length || 0),
          0,
        ),
      });
    }
  }
  await writeFile(
    "src/data/currencies.json",
    JSON.stringify(currencies, null, 2) + "\n",
  );
  await writeFile(
    "src/data/reward-context.json",
    JSON.stringify(cleanRewardContexts(context, articles), null, 2) + "\n",
  );
  await writeFile(
    "data/reward-context-audit.json",
    JSON.stringify(
      {
        source: "https://dcuniverseonline.fandom.com/wiki/Currency",
        sourceSha256: createHash("sha256").update(source.html).digest("hex"),
        records: audit,
      },
      null,
      2,
    ) + "\n",
  );
  await writeFile(
    "data/media-sources.json",
    JSON.stringify([...sources.values()], null, 2) + "\n",
  );
  console.log({
    currencies: currencies.length,
    icons: currencies.filter((c) => c.sourcePage).length,
    guides: Object.keys(context).length,
    restoredItems: audit.reduce((n, r) => n + r.restoredItems, 0),
  });
}
if (process.argv[1]?.endsWith("build-reward-context.mjs")) await build();
