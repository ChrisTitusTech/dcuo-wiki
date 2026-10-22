import { classifyURL } from "./wiki-urls.mjs";
export const rootGroups = {
  Instances: ["Instances", "Duos", "Alerts", "Raids", "On_Duty"],
  Guides: ["Leveling", "Races", "Combat_Rating", "Stats_Revamp_(2017)"],
  Character: [
    "Stats",
    "Character_Creation",
    "Character_Customization",
    "Movement_Modes",
    "Movement_Increasing_Skills",
    "Movement_Styles",
    "Combat_Role",
    "Damage_Role",
    "Tank_Role",
    "Healer_Role",
    "Controller_Role",
    "Skill_Points",
    "Statistics",
    "Allies",
    "Iconic_Powers",
    "Loadouts",
    "Traits",
    "Abilities",
    "Renown",
    "Factions",
  ],
  Combat: [
    "Combat",
    "Damage",
    "Damage_over_Time",
    "Damage_Absorption",
    "Counter",
    "PvP",
    "PvE",
    "Tactical_Mods",
    "Weapon_Attacks",
    "Weapons",
    "Supercharge",
    "Critical_Attack_Chance",
    "Critical_Attack_Damage",
  ],
  Equipment: [
    "Accessory",
    "Items",
    "Item_Level",
    "Nth_Metal_(Artifacts)",
    "R&D_Station",
    "Exobyte_(Augments)",
    "Exobyte_(Pre-Augments)",
    "Currency",
    "Gear",
    "Styles",
    "Equipment_Mods",
    "Augments",
    "Artifacts",
    "Fortify",
    "Omnipotence",
    "Accessories",
    "Base_Items",
    "Trinkets",
    "Consumables",
    "Soder_Cola",
    "Exobytes",
    "Exobits",
    "R&D",
    "R&D_Stations",
    "Plans",
    "Vendors",
    "The_Strategist_Card",
    "Page_of_Destiny",
  ],
  Locations: [
    "Metropolis_Battlezone",
    "Gotham_City",
    "Metropolis",
    "Central_City",
    "Watchtower",
    "Hall_of_Doom",
    "House_of_Legends",
    "Gotham_Wastelands",
    "Battlezone_Metropolis",
    "Atlantis_(Location)",
    "New_Genesis",
    "Gotham_Under_Siege",
    "Bottled_D.C.",
    "Infernal_Kahndaq",
    "Washington,_D.C.",
    "Kahndaq",
    "Bases",
    "Lairs",
    "League_Halls",
  ],
  Collectibles: [
    "Briefings",
    "Player_Briefings",
    "Investigations",
    "Collections",
    "Collection",
    "Investigations_(Briefings)",
    "Investigations_(Collections)",
  ],
};
const normalize = (url) => {
  try {
    const u = new URL(url);
    return (
      u.origin +
      decodeURIComponent(u.pathname).normalize("NFC").replaceAll(" ", "_")
    );
  } catch {
    return null;
  }
};
export function catalogPlan(articles, inventory) {
  const published = new Set(articles.map((a) => normalize(a.source)));
  const entries = new Map(
    inventory.entries
      .filter((e) => e.kind === "article")
      .map((e) => [normalize(e.url), e]),
  );
  const queue = new Map();
  const add = (url, category, priority, reason) => {
    const c = classifyURL(url);
    if (
      c.kind !== "article" ||
      published.has(normalize(c.url)) ||
      !entries.has(normalize(c.url))
    )
      return;
    const key = normalize(c.url),
      old = queue.get(key);
    if (!old || priority < old.priority)
      queue.set(key, {
        url: c.url,
        title: c.title,
        category,
        priority,
        reasons: [reason],
      });
    else if (!old.reasons.includes(reason)) old.reasons.push(reason);
  };
  for (const [category, titles] of Object.entries(rootGroups))
    for (const title of titles)
      add(
        "https://dcuniverseonline.fandom.com/wiki/" + title,
        category,
        0,
        "Missing category foundation",
      );
  for (const a of articles)
    for (const s of a.sections)
      for (const ref of s.references || []) {
        if (!ref.url.startsWith("https://dcuniverseonline.fandom.com/wiki/"))
          continue;
        const core = [
          "Equipment",
          "Locations",
          "Combat",
          "Character",
          "Collectibles",
        ].includes(a.category);
        add(
          ref.url,
          a.category,
          /^See also$/i.test(s.title) ? 1 : core ? 2 : 3,
          `${a.slug}: ${s.title}`,
        );
      }
  for (const e of inventory.entries)
    if (e.kind === "article")
      add(e.url, "", 4, "Remaining main-namespace inventory");
  return [...queue.values()].sort(
    (a, b) =>
      a.priority - b.priority ||
      a.category.localeCompare(b.category) ||
      a.title.localeCompare(b.title),
  );
}
