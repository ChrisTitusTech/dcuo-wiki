// Classify source bodies, never navigation templates or incidental See also links.
export function catalogBody(markdown) {
  const lines = markdown.split("\n");
  const kept = [];
  let navigation = false;
  for (const line of lines) {
    if (/^\|.*(?:\/wiki\/Template:|Expandv)/i.test(line)) navigation = true;
    if (navigation && !line.startsWith("|")) navigation = false;
    if (!navigation) kept.push(line);
  }
  return kept.join("\n");
}

export function classifyCatalog(capture, title) {
  const markdown = catalogBody(capture.markdown || "");
  const plain = markdown
    .replace(/!\[[^\]]*\]\([^\n]*?\)/g, "")
    .replace(/\[([^\]]*)\]\([^\n]*?\)/g, "$1")
    .replace(/[*_\\]/g, "");
  const intro = plain.split(/^##? /m)[0].replace(/\s+/g, " ").trim();
  const headings = [...plain.matchAll(/^#{2,6}\s+([^\n]+)/gm)].map((m) =>
    m[1].split("[ Edit section:")[0].trim(),
  );
  const evidence = intro.slice(0, 1500);
  const result = (category, type, reason) => ({
    category,
    type,
    reason,
    evidence: evidence.slice(0, 400),
  });
  if (
    /^(?:Hotfix[ _]|\d{4}_HotFixes|Game_Update_\d|GU\d)|(?:^|_)Update$/i.test(
      title,
    )
  )
    return result(
      "Updates",
      "Patch notes",
      "Source title identifies a dated hotfix or game update",
    );
  if (/^(?:Collections?|Briefings?|Investigations?):/i.test(title))
    return result(
      "Collectibles",
      /^([^:]+):/.exec(title)[1],
      "Explicit collectible source namespace",
    );
  if (/^Ally:|_\(Ally\)$/.test(title))
    return result(
      "Character",
      "Allies",
      "Source title identifies an ally unlock or ally abilities",
    );
  if (/^(?:Base_(?:Items|Theme)|Amenity):/i.test(title))
    return result(
      "Housing",
      /Theme:/.test(title) ? "Base themes" : "Base items",
      "Explicit housing source namespace",
    );
  if (/_Vendor$|_Vendors$|_\(Vendor\)$/.test(title))
    return result("Characters", "Vendors", "Source title identifies a vendor");
  if (
    /\b(?:is|was|are|were)\s+(?:(?:an?|the)\s+)?(?:seasonal\s+)?vendor\b/i.test(
      intro,
    )
  )
    return result(
      "Characters",
      "Vendors",
      "Source introduction identifies a vendor",
    );
  if (title === "Missions")
    return result(
      "Guides",
      "Mission systems",
      "Source page explains the mission system rather than one quest",
    );
  if (/Combat Statistics/i.test(headings.join(" ")))
    return result(
      "Characters",
      "NPCs & enemies",
      "Source contains character combat-statistics sections",
    );
  if (
    /\b(?:is|are)\s+(?:an?\s+)?(?:Tier\s+\d+\s+)?(?:solo (?:instance|challenge)|duo|raid|alert|operation)\b|\band an? Tier \d+ (?:duo|raid|alert)\b/i.test(
      intro,
    )
  )
    return result(
      "Instances",
      "On Duty",
      "Source explicitly identifies an On Duty instance",
    );
  if (/^Plans:/i.test(title))
    return result(
      "Equipment",
      "R&D plans",
      "Explicit R&D plan source namespace",
    );
  if (/_(?:Costume_List|Style_List)$/.test(title))
    return result(
      "Equipment",
      "Styles",
      "Source title identifies a costume/style directory",
    );
  if (
    /^(?:Trinket|Ring|Neck|Weapon|Accessory|Armor|Armour|Equipment)_List$/.test(
      title,
    )
  )
    return result(
      "Equipment",
      "Equipment directories",
      "Source title identifies an equipment directory",
    );
  if (/\((?:Briefings|Investigations|Collections)\)$/.test(title))
    return result(
      "Collectibles",
      "Collections & investigations",
      "Source title identifies a collectible guide",
    );
  if (
    /\b(?:reward for heroes and villains|costume class|equipment mods?|generator mods?)\b/i.test(
      intro,
    )
  )
    return result(
      "Equipment",
      "Items & gear",
      "Source introduction identifies an equipment reward, slot or mod",
    );
  if (
    /^(?:Arena_PvP|Block|Breakout|Counter|Lunge|Interrupt|Combat_Log)$/.test(
      title,
    )
  )
    return result(
      "Combat",
      "Combat mechanics",
      "Source title identifies a combat mechanic",
    );
  if (
    /^(?:Body_Types|Character_Creation|League_Management|The_DCUO_Ladder|Audio|Controls|User_Interface)$/.test(
      title,
    )
  )
    return result(
      "Character",
      "Character & game systems",
      "Source title identifies character or game settings",
    );
  if (
    /\b(?:is|are)\b[^.]{0,180}\b(?:foe|foes|god of|goddess|demon|members of|police officer|creature|race of)\b/i.test(
      intro,
    )
  )
    return result(
      "Characters",
      "NPCs & enemies",
      "Source introduction identifies an NPC, enemy or faction member",
    );
  if (/^Base_(?:Items|Theme):/i.test(title))
    return result(
      "Housing",
      /Theme:/.test(title) ? "Base themes" : "Base items",
      "Explicit housing source namespace",
    );
  if (/_(?:Aura|Material|Emblem)(?:_|$)|_Styles$/.test(title))
    return result(
      "Equipment",
      "Styles",
      "Source title identifies a cosmetic item or style directory",
    );
  if (
    /\b(?:is|are)\b[^.]{0,180}\b(?:collectible|collection piece)\b/i.test(intro)
  )
    return result(
      "Collectibles",
      "Collectible pieces",
      "Source introduction identifies a collectible piece",
    );
  if (
    /\b(?:is|are)\b[^.]{0,180}\b(?:chest|shoulders?|head|waist|legs?|feet|hands?|face|back) slot\b/i.test(
      intro,
    )
  )
    return result(
      "Equipment",
      "Items & gear",
      "Source introduction identifies an equipment slot",
    );
  if (
    /\b(?:is|are|was)\b[^.]{0,180}\b(?:mob|journalist|reporter|civilian|robot|bounty target|non-player character)\b/i.test(
      intro,
    )
  )
    return result(
      "Characters",
      "NPCs & enemies",
      "Source introduction identifies an NPC",
    );
  if (/_\(Exploration\)$/.test(title))
    return result(
      "Locations",
      "Exploration points",
      "Source title identifies an exploration point",
    );
  if (
    /This article is a disambiguation page|list of links to pages that might share/i.test(
      markdown,
    )
  )
    return result(
      "Reference",
      "Disambiguation",
      "Source explicitly identifies disambiguation",
    );
  if (
    /\b(?:is|are|was|were)\s+(?:(?:an?|the)\s+)?(?:(?!(?:of|in|from|with|for|and|or|who|which|that|vendor|npc|artifact|item|box|style|costume|location|collection|investigation|briefing|power|ability)\b)[\w-]+\s+){0,8}(?:mission|quest)\b(?!\s+(?:control|giver))/i.test(
      intro,
    )
  )
    return result(
      "Quests",
      "Missions",
      "Source introduction identifies a mission",
    );
  if (
    /\b(?:is|are)\b[^.]{0,180}\b(?:raid|duo|alert|solo instance|operation|4-player|8-player|2-player)\b/i.test(
      intro,
    )
  )
    return result(
      "Instances",
      "On Duty",
      "Source introduction identifies an instance",
    );
  if (
    /\b(?:is|are)\b[^.]{0,180}\b(?:costume style|style set|emblem|aura|material|accessory style)\b/i.test(
      intro,
    )
  )
    return result(
      "Equipment",
      "Styles",
      "Source introduction identifies a cosmetic style",
    );
  if (
    /\b(?:is|are)\b[^.]{0,180}\b(?:base item|base items|amenity|amenities|decoration)\b/i.test(
      intro,
    )
  )
    return result(
      "Housing",
      "Base items",
      "Source introduction identifies housing content",
    );
  if (
    /\b(?:is|are)\b[^.]{0,160}\b(?:power|superpower|supercharge|ability|abilities|weapon combo|weapon attack)\b/i.test(
      intro,
    )
  )
    return result(
      "Combat",
      "Powers & abilities",
      "Source introduction identifies a combat ability",
    );
  if (
    /\b(?:is|are)\b[^.]{0,160}\b(?:collection|briefing|investigation)\b/i.test(
      intro,
    )
  )
    return result(
      "Collectibles",
      "Collections & investigations",
      "Source introduction identifies a collectible",
    );
  if (
    /\b(?:is|are)\b[^.]{0,160}\b(?:artifact|augment|trinket|consumable|catalyst|currency|equipment|item|weapon|armor|armour|ring|necklace|utility belt|box|capsule|token|mark|marks)\b/i.test(
      intro,
    )
  )
    return result(
      "Equipment",
      /\bartifact\b(?![- ]level)/i.test(intro) ? "Artifacts" : "Items & gear",
      "Source introduction identifies an item",
    );
  if (
    /\b(?:is|are)\b[^.]{0,160}\b(?:head style|chest style|back style|hand style|waist style|leg style|feet style|shoulder style|face style)\b/i.test(
      intro,
    )
  )
    return result(
      "Equipment",
      "Styles",
      "Source introduction identifies a gear style",
    );
  if (
    /\b(?:is|are)\b[^.]{0,180}\b(?:zone|district|neighborhood|neighbourhood|area|location|headquarters|building|city|island|factory|warehouse|police station|nightclub)\b/i.test(
      intro,
    )
  )
    return result(
      "Locations",
      "World locations",
      "Source introduction identifies a world location",
    );
  if (
    /Combat Statistics/i.test(headings.join(" ")) ||
    /\b(?:is|are)\b[^.]{0,120}\b(?:vendor|bounty|enemy|boss|supervillain|superhero|hero|villain|npc|non-player character|member of|leader of)\b/i.test(
      intro,
    )
  )
    return result(
      "Characters",
      /\bvendor\b/i.test(intro) ? "Vendors" : "NPCs & enemies",
      "Source character sections or explicit NPC description",
    );
  if (
    /\b(?:is|are)\b[^.]{0,180}\b(?:feat|feats)\b/i.test(intro) ||
    /_Feats$/.test(title)
  )
    return result("Feats", "Feat references", "Source identifies feats");
  if (
    /\b(?:is|are)\b[^.]{0,180}\b(?:episode|downloadable content|DLC|chapter|seasonal event)\b/i.test(
      intro,
    )
  )
    return result(
      "Story",
      "Releases & events",
      "Source introduction identifies a content release",
    );
  if (
    /^\|.*(?:Item Level|Required Level|Item Type|Defense|Toughness|Style:|Equip:|Requires Level)/im.test(
      plain,
    ) ||
    /^(?:Item Level|Required Level|Item Type|Equip|Requires Level)\s*:/im.test(
      plain,
    )
  )
    return result(
      "Equipment",
      "Items & gear",
      "Source includes equipment attributes",
    );
  if (
    /\b(?:collection|briefing|investigation)\b/i.test(title) &&
    /\b(?:collect|obtain|reward|location)\b/i.test(plain)
  )
    return result(
      "Collectibles",
      "Collectible references",
      "Collectible title with acquisition or location details",
    );
  if (
    /^Objectives?$/i.test(
      headings.find((h) => /^Objectives?$/i.test(h)) || "",
    ) &&
    /^(?:Journal|Rewards|Walkthrough|Mission Information)$/i.test(
      headings.find((h) =>
        /^(?:Journal|Rewards|Walkthrough|Mission Information)$/i.test(h),
      ) || "",
    )
  )
    return result(
      "Quests",
      "Missions",
      "Source contains objective and mission/reward sections",
    );
  return result(
    "Reference",
    "Game reference",
    "General reference; no more specific source-backed type established",
  );
}
