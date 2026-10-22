// Convert cached missions into a review queue with source and omission evidence.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { parse } from "parse5";
import { convertReference } from "./convert-reference.mjs";
import { htmlTables } from "./html-tables.mjs";
import { classifyURL } from "./wiki-urls.mjs";
export const normalizeTitle = (s) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const cleanTitle = (s) =>
  s.replace(/\\?\[\s*\[?Edit section:[\s\S]*$/, "").trim();
const maintenance =
  /this article (?:or section )?(?:needs|is currently)|please (?:refer|help)|manual of style|you can help|^Expandv|^v · e|^Source details and references for /i;
export function convertMission(cache, record) {
  let markdown = cache.markdown;
  const fixes = [];
  if (["Chicken_of_the_Sea", "The_Ninth_Triage"].includes(record.title)) {
    if (htmlTables(cache.html).some((t) => t.flat().some(Boolean)))
      throw Error("Expected only empty source table");
    markdown = markdown.replace(/^\|\s*\n\|\s*$/gm, "");
    fixes.push("Omitted source HTML table with no cells or content");
  }
  const converted = convertReference(markdown, record.url);
  const imageNames = new Set();
  function walk(n) {
    if (n.tagName === "img") {
      const a = Object.fromEntries(
        (n.attrs || []).map((a) => [a.name, a.value]),
      );
      if (Number(a.width) >= 100 || /map/i.test(a["data-image-name"] || "")) {
        if (a["data-image-name"]) imageNames.add(a["data-image-name"]);
        const src = a["data-src"] || a.src;
        if (src)
          try {
            imageNames.add(
              decodeURIComponent(new URL(src).pathname.split("/")[5]),
            );
          } catch {}
      }
    }
    for (const c of n.childNodes || []) walk(c);
  }
  walk(parse(cache.html));
  let sections = converted.sections
    .map((s) => ({
      ...s,
      title: cleanTitle(s.title),
      items: s.items.filter(
        (x) =>
          !maintenance.test(x) &&
          !/^n\/a$/i.test(x) &&
          !/^Source-listed entries\./.test(x),
      ),
    }))
    .filter(
      (s) =>
        !/^Contents$/i.test(s.title) &&
        (s.items.length || s.images?.length || s.references?.length || s.table),
    );
  const images = converted.images.filter(
    (i) =>
      imageNames.has(
        decodeURIComponent(
          new URL(i.sourcePage).pathname.slice("/wiki/File:".length),
        ),
      ) &&
      !/AddLevitz|Site-logo|Bat-Signal.s_Light|Briefings.png|Investigations.png/.test(
        i.sourcePage,
      ),
  );
  const imagePages = new Set(images.map((i) => i.sourcePage));
  for (const s of sections) {
    if (s.references)
      s.references = s.references.filter(
        (r) =>
          !/[?&](?:action|veaction)=edit|[?&]redlink=1|\/Category:Article_stubs|\/Manual_of_Style|\/Help:Editing/i.test(
            r.url,
          ) &&
          !/^(?:stub|expanding it with additional information|Manual of Style)$/i.test(
            r.label,
          ),
      );
    if (s.images) s.images = s.images.filter((i) => imagePages.has(i.url));
    if (!s.images?.length) delete s.images;
  }
  sections = sections.filter(
    (s) =>
      s.items.length || s.images?.length || s.references?.length || s.table,
  );
  const intro =
    sections.find((s) => s.title === "Source overview") || sections[0];
  const summary = (
    intro?.items.find(
      (x) =>
        x.length > 30 &&
        !x.startsWith('"') &&
        !/^This subject has|^This article/i.test(x),
    ) ||
    intro?.items[0] ||
    ""
  ).slice(0, 420);
  const title = record.title.replaceAll("_", " ");
  const slug = record.title
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
  const objectiveSections = sections.filter((s) =>
    /^(?:objectives?|walkthrough)$/i.test(s.title),
  );
  const objectiveText = objectiveSections.flatMap((s) => s.items).join(" ");
  // Location labels are exact excerpts from source prose, never invented coordinates.
  const areas =
    /\b(?:Kaznia City|Kaznian Necropolis|Laughing Hound Pub|Desecrated Mausoleum|The Reckoning.s Hideout|Blüdhaven|Bludhaven|Smallville|Metrodome|Typhon.s Monster Invasion|Knights Dome|Gotham Mercy Hospital|University Warehouse|The Vault|Gotham sewers|Sentinel base|S\.T\.A\.R\. Labs Research Facility|STAR Labs Facility|Downtown Metropolis|Metal Gotham City|Death Metal Washington, D\.C\.|Arkham Island|Downtown Metropolis Battlezone|31st Century: New Earth|Earth 3 Gotham|Metropolis Anti-Matter Invasion Zone|Apokoliptic Gotham City|Old Gotham Subway|Main Observation Deck|Monitor Womb|Glenmorgan Square|8th Precinct|Oblivion Bar|Gotham Mercy General Hospital|Mogo|Ranx.s Command Center|Command and Control Center|Frozen Mogo|HIVE Base|Centennial Park|Water Treatment Facility|Earth 3: The Panopticon|Lair of the Spectre|Lust.s Territory|East End Regal Hotel|Shadowlands|Monarch Playing Card Company|Bottled D\.C\.|Titans Island|Titans Tower|War-Torn Village|War-Torn Area 51|Doomed Washington, D\.C\.|Botanical Gardens|Knightsdome|Ace Chemicals|Steelworks|Arkham Asylum|Coast City|Gorilla Island|H\.I\.V\.E\. Moon Base|Oan Sciencells|Oolong Island|Stryker.s Island Penitentiary|League of Assassins Stronghold|Cursed Gotham City|Chaos Gotham|Central City(?: Starro Deluge Zone)?|(?:East End|Little Bohemia|Midtown|Diamond District|North Burnley|South Gotham|Otisburg|Chinatown|Historic District|Tomorrow District|Suicide Slums|Old Gotham|Gotham Wastelands|Gotham Under Siege|New Genesis|Patchwork Themyscira|Flashpoint Gotham City|Infernal Kahndaq|Dakota City|Doomed Metropolis|Amusement Mile|Cape Carmine|Robinson Park|Tricorner.s Yard|Crime Alley|University of Metropolis|Science Spire|Gotham University)|(?:East End|Little Bohemia|Midtown|Diamond District|North Burnley|Chinatown|Burnley) (?:Police Station|MPD|Nightclub)|(?:Gotham City|Metropolis|Atlantis|Themyscira|Washington D\.C\.|Kahndaq|Thanagar|Apokolips|House of Legends|Hall of Doom|Watchtower|Area 51|Royal Hideout))(?=\W|$)/gi;
  const objectiveLocations = sections
    .filter((s) =>
      /^(?:Objectives?|Background|Location|Locations)$/i.test(s.title),
    )
    .flatMap((s) => s.items);
  const routeLocations = sections
    .filter((s) => /^Walkthrough$/i.test(s.title))
    .flatMap((s) => s.items)
    .filter((x) =>
      /\b(?:go|travel|head|located|queue|enter|return|find|speak|talk|run|locate|visit|break|battle|step)\b/i.test(
        x,
      ),
    );
  const overviewLocations = sections
    .filter((s) => /^(?:Source overview|Intro)$/i.test(s.title))
    .flatMap((s) => s.items)
    .filter(
      (x) =>
        /\b(?:is|are|takes place|located|given by|meet|speak|talk|visit|travel|go|head|find|last spotted|last seen)\b.*\b(?:in|on|at|inside|near|outside|within)\b/i.test(
          x,
        ) ||
        /^(?:Return|Travel|Go|Head|Meet|Speak|Talk|Join|Enter|Infiltrate|Break|Battle|Locate|Free|Shatter|Step|Report|Location\s*:)/i.test(
          x,
        ),
    );
  const locationItems = [
    ...objectiveLocations,
    ...routeLocations,
    ...overviewLocations,
  ].filter((x) => !/^"|^Batman:|^Oracle:|^Calculator:/i.test(x));
  const matched = locationItems
    .map((item) => ({
      item,
      labels: [...item.matchAll(areas)].map((m) => m[0]),
    }))
    .filter((x) => x.labels.length);
  const quoteItems = sections
    .filter((s) =>
      /^(?:Source overview|Intro|Objectives?|Walkthrough)$/i.test(s.title),
    )
    .flatMap((s) => s.items)
    .filter((x) => x.startsWith('"'));
  for (const item of quoteItems) {
    const route = item.match(
      /\b(?:head(?: over)? to|go (?:inside|to)|return to|inside|located (?:in|at)|last spotted (?:in|at))\b/i,
    );
    if (!route) continue;
    const found = [...item.slice(route.index).matchAll(areas)][0];
    if (found) matched.push({ item, labels: [found[0]] });
  }
  const selected = matched[0];
  const unique = selected
    ? [...new Set(selected.labels)].map((label) => ({
        label,
        item: selected.item,
      }))
    : [];
  if (
    !selected &&
    sections
      .flatMap((s) => s.items)
      .join(" ")
      .split(/\s+/).length <= 50
  ) {
    const context = sections
      .filter((s) => /^(?:Source overview|Intro)$/i.test(s.title))
      .flatMap((s) => s.items)
      .find((x) => !x.startsWith('"') && [...x.matchAll(areas)].length);
    if (context) {
      for (const match of context.matchAll(areas))
        unique.push({ label: match[0], item: context });
    }
  }
  const mapSections = new Set(
    sections
      .filter((s) => /^(?:Maps?|Locations?)$/i.test(s.title))
      .flatMap((s) => (s.images || []).map((i) => i.url)),
  );
  const maps = images
    .filter(
      (i) =>
        mapSections.has(i.sourcePage) ||
        /\bmap\b|[_ ]map[._ ]|map\.(?:jpg|png)/i.test(i.sourcePage),
    )
    .map((i) => ({
      label: decodeURIComponent(i.sourcePage.split("File:")[1]).replaceAll(
        "_",
        " ",
      ),
      url: i.sourcePage,
    }));
  const article = {
    slug,
    title,
    category: new Set([
      "Missions/Heroes",
      "Missions/Villains",
      "Arcane_Edict",
      "Attack_Brainiac!",
      "Bounties",
      "Daily_Mission",
      "Journal",
      "Mentor-based_Missions",
      "Mission_collections",
      "Mission_Set",
      "Story_Arcs_(Classic_Game)",
      "Story_Missions",
      "Weekly_Mission",
    ]).has(record.title)
      ? "Guides"
      : "Quests",
    summary,
    sections,
    source: record.url,
    history: record.url + "?action=history",
    retrieved: cache.retrieved.slice(0, 10),
    reviewed: false,
    license: "CC-BY-SA; see source for exceptions",
  };
  if (unique.length)
    article.location = {
      label: unique.map((m) => m.label).join(" / "),
      precision:
        "Source objective, route or mission introduction: " + unique[0].item,
      source: record.url,
      maps,
    };
  if (!article.location) {
    const directions = sections.find(
      (s) =>
        /^Locations?$/i.test(s.title) && s.items.some((x) => x.length > 10),
    );
    if (directions)
      article.location = {
        label: directions.items[0],
        precision:
          "Location directions transcribed from the source; all listed spawn positions appear in the Location section",
        source: record.url,
        maps,
      };
  }
  if (!article.location && maps.length)
    article.location = {
      label: title + " - source map",
      precision:
        "Map supplied by the mission source; use its labels and the objectives above",
      source: record.url,
      maps,
    };
  if (!article.location) {
    const instance = [
      ...objectiveSections,
      ...sections.filter((s) => s.title === "Intro"),
    ]
      .flatMap((s) => s.items)
      .find((x) =>
        /\b(?:queue for|queue up|queue and run|on duty|run the .*?(?:alert|raid|duo|challenge|operation)|enter the .*?(?:alert|raid|duo|challenge|operation))\b/i.test(
          x,
        ),
      );
    if (instance)
      article.location = {
        label: instance,
        precision:
          "Source-listed instance entry instruction; enter through the On Duty queue where specified",
        source: record.url,
        maps: [],
      };
  }
  if (!article.location) {
    const uiObjective = objectiveSections
      .flatMap((s) => s.items)
      .find((x) =>
        /\b(?:inventory|style menu|style tab|claim|collect your|open your|journal)\b/i.test(
          x,
        ),
      );
    if (
      uiObjective &&
      /automatically|auto-completed|gift|collect your|inventory|style menu|style tab/i.test(
        summary + " " + uiObjective,
      )
    )
      article.location = {
        label: "Journal / player menus",
        precision:
          "This source describes a claim or menu objective: " + uiObjective,
        source: record.url,
        maps: [],
      };
  }
  if (
    !article.location &&
    /automatically (?:appeared|appearing).*journal/i.test(
      sections.flatMap((s) => s.items).join(" "),
    ) &&
    /gift|reward/i.test(sections.flatMap((s) => s.items).join(" "))
  )
    article.location = {
      label: "Journal reward mission",
      precision:
        "The source describes an automatically added Journal gift mission, without a world destination",
      source: record.url,
      maps: [],
    };
  if (!article.location) {
    const journal = objectiveSections
      .flatMap((s) => s.items)
      .find((x) => /\b(?:complete|open|check).*\bjournal\b/i.test(x));
    if (journal)
      article.location = {
        label: "Journal",
        precision: "Source instruction: " + journal,
        source: record.url,
        maps: [],
      };
  }
  if (
    !article.location &&
    /(?:player.s base|your Hideout or Lair)/i.test(
      sections.flatMap((s) => s.items).join(" "),
    )
  )
    article.location = {
      label: "Your player base / lair",
      precision:
        "The source places the mission inside the player-owned base, rather than a shared world coordinate",
      source: record.url,
      maps: [],
    };
  const words = sections
    .flatMap((s) => [...s.items, ...(s.table?.rows.flat() || [])])
    .join(" ")
    .split(/\s+/).length;
  const reasons = [];
  if (record.title === "Bane\'s_Back_(hero_mission)")
    reasons.push(
      "Source contradicts itself about level 6 versus level 8; confirm the current prerequisite before publication",
    );
  if (words < 40) reasons.push("Insufficient source detail");
  if (!objectiveText && article.category === "Quests" && words < 40)
    reasons.push("Missing objectives");
  if (/TODO|TBD|coming soon/i.test(sections.flatMap((s) => s.items).join(" ")))
    reasons.push("Source contains unresolved placeholder");
  return {
    article,
    images,
    audit: converted.audit,
    fixes,
    words,
    objectiveWords: objectiveText.split(/\s+/).filter(Boolean).length,
    locationExcerpts: unique,
    canonical: classifyURL(
      cache.metadata?.ogUrl ||
        cache.metadata?.["og:url"] ||
        cache.metadata?.url ||
        record.url,
    ).url,
    reasons,
  };
}
if (
  process.argv[1] &&
  import.meta.url === new URL("file:" + process.argv[1]).href
) {
  const manifest = JSON.parse(
    await readFile("data/mission-downloads.json", "utf8"),
  );
  await mkdir(".import-cache/converted-missions", { recursive: true });
  const records = [];
  for (const r of manifest.records) {
    try {
      const c = JSON.parse(await readFile(r.cacheFile, "utf8"));
      const result = convertMission(c, r);
      await writeFile(
        ".import-cache/converted-missions/" + result.article.slug + ".json",
        JSON.stringify(result, null, 2) + "\n",
      );
      records.push({
        source: r.url,
        slug: result.article.slug,
        canonical: result.canonical,
        words: result.words,
        objectiveWords: result.objectiveWords,
        location: result.article.location?.label,
        maps: result.article.location?.maps.length || 0,
        images: result.images.length,
        reasons: result.reasons,
      });
    } catch (e) {
      records.push({ source: r.url, error: e.message });
    }
  }
  await writeFile(
    "data/mission-conversion.json",
    JSON.stringify({ createdAt: new Date().toISOString(), records }, null, 2) +
      "\n",
  );
  console.log(
    JSON.stringify({
      total: records.length,
      errors: records.filter((r) => r.error),
      flagged: records.filter((r) => r.reasons?.length).length,
      withLocation: records.filter((r) => r.location).length,
      withMaps: records.filter((r) => r.maps).length,
      images: records.reduce((n, r) => n + (r.images || 0), 0),
    }),
  );
}
