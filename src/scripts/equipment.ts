type Profile = {
  id: string;
  character: {
    character_id: string;
    world_id: string;
    name?: string;
    level?: string;
    combat_rating?: string;
    skill_points?: string;
  };
  screenshot?: string | null;
};
type SourceDetails = {
  description?: string;
  style?: string;
  itemType?: string;
  requirements?: string;
  requiredLevel?: number | string;
  requiredCombatRating?: number | string;
  icon?: string;
  source?: string;
  sections?: {
    heading: string;
    items?: string[];
    table?: { caption?: string; columns: string[]; rows: string[][] };
  }[];
};
type Item = {
  itemId: string;
  name: string;
  href?: string;
  identified?: boolean;
  icon?: string;
  details?: SourceDetails & {
    iconResource?: string;
    qualityId?: number;
    categoryId?: number;
  };
  equipped?: {
    itemLevel?: number;
    effects?: string[];
    stats?: { name: string; value: number }[];
    baseStats?: { name: string; value: number }[];
    capturedAt: number;
  };
  notes?: string;
};
type Snapshot = {
  characterId: string;
  worldId: string;
  items:
    | (Item & {
        slot: string;
        quantity: number | null;
        durability: number | null;
        augments: Item[];
      })[]
    | null;
  syncedAt: number | null;
  stale: boolean;
  unavailable: boolean;
  refreshing: boolean;
  refreshAfter: number;
};
export function equipmentPanel() {
  const el = <T extends HTMLElement = HTMLElement>(id: string) =>
    document.getElementById(id) as T;
  const panel = el("equipment-panel"),
    status = el("equipment-status"),
    button = el<HTMLButtonElement>("equipment-refresh");
  let profile: Profile | null = null,
    key = "",
    owner = false,
    generation = 0,
    controller: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cooldown: ReturnType<typeof setTimeout> | undefined;
  function itemLabel(item: Item) {
    // Only accept local article links; never insert upstream HTML.
    const node = document.createElement(
      item.href && /^\/wiki\/[A-Za-z0-9_%-]+\/$/.test(item.href) ? "a" : "span",
    );
    node.textContent = item.name;
    if (item.identified === false) {
      const wrap = document.createElement("span"),
        link = document.createElement("a");
      link.href = `/equipment-identification/?item=${encodeURIComponent(item.itemId)}`;
      link.textContent = "Identify this item";
      link.className = "identify-item";
      wrap.append(node, document.createElement("br"), link);
      return wrap;
    }
    if (node instanceof HTMLAnchorElement) node.href = item.href!;
    return node;
  }
  el<HTMLImageElement>("player-screenshot").addEventListener("error", () => {
    el("player-screenshot").hidden = true;
  });
  let selectedSlot: string | null = null;
  let currentItems: NonNullable<Snapshot["items"]> = [];
  let artwork: Record<string, string> = {};
  let sourceDetails: Record<string, SourceDetails> = {};
  const slugFor = (item: Item) =>
    item.href?.match(/^\/wiki\/([A-Za-z0-9_%-]+)\/$/)?.[1];
  const sourceFor = (item: Item) => sourceDetails[slugFor(item) || ""];
  const nativeIcon = (path?: string) =>
    path && /^\/api\/item-icons\/[a-f0-9]{64}$/.test(path) ? path : null;
  const sourceIcon = (path?: string) =>
    path && /^\/api\/catalog-media\/[a-f0-9]{64}$/.test(path) ? path : null;
  function artworkImage(item: Item) {
    const paths = [
      ...new Set(
        [
          nativeIcon(item.icon),
          nativeIcon(item.details?.icon),
          sourceIcon(sourceFor(item)?.icon),
          sourceIcon(artwork[slugFor(item) || ""]),
        ].filter((p): p is string => !!p),
      ),
    ];
    if (!paths.length) return null;
    const image = document.createElement("img");
    image.src = paths.shift()!;
    image.alt = "";
    image.loading = "lazy";
    image.addEventListener("error", () => {
      const next = paths.shift();
      if (next) image.src = next;
      else image.remove();
    });
    return image;
  }
  function appendDefinition(
    target: HTMLElement,
    details: SourceDetails,
    sourced: boolean,
  ) {
    const title = document.createElement("h4");
    title.textContent = sourced
      ? "Source-listed item details"
      : "Captured item details";
    target.append(title);
    if (details.description) {
      const p = document.createElement("p");
      p.textContent = details.description;
      target.append(p);
    }
    const facts = document.createElement("dl");
    for (const [label, value] of [
      ["Type", details.itemType],
      ["Style", details.style],
      ["Required level", details.requiredLevel],
      ["Required combat rating", details.requiredCombatRating],
      ["Requires", details.requirements],
    ] as const) {
      if (value === undefined || value === "") continue;
      if (
        (label === "Required level" || label === "Required combat rating") &&
        !(Number(value) > 0)
      )
        continue;
      const dt = document.createElement("dt"),
        dd = document.createElement("dd");
      dt.textContent = label;
      dd.textContent = String(value);
      facts.append(dt, dd);
    }
    if (facts.childElementCount) target.append(facts);
    if (sourced) {
      for (const section of details.sections || []) {
        const heading = document.createElement("h4");
        heading.textContent = section.heading;
        target.append(heading);
        for (const text of section.items || []) {
          const p = document.createElement("p");
          p.textContent = text;
          target.append(p);
        }
        if (section.table) {
          const scroll = document.createElement("div"),
            table = document.createElement("table");
          scroll.className = "table-scroll";
          const head = document.createElement("thead"),
            header = document.createElement("tr"),
            body = document.createElement("tbody");
          for (const text of section.table.columns) {
            const th = document.createElement("th");
            th.scope = "col";
            th.textContent = text;
            header.append(th);
          }
          head.append(header);
          for (const values of section.table.rows) {
            const tr = document.createElement("tr");
            for (const text of values) {
              const td = document.createElement("td");
              td.textContent = text;
              tr.append(td);
            }
            body.append(tr);
          }
          table.append(head, body);
          scroll.append(table);
          target.append(scroll);
        }
      }
      const note = document.createElement("p");
      note.className = "equipment-source-note";
      note.textContent =
        "Source-listed effects and rank bonuses describe the item definition. They are not this character's current scaled stats.";
      target.append(note);
      if (
        details.source &&
        /^https:\/\/dcuniverseonline\.fandom\.com\/wiki\//.test(details.source)
      ) {
        const link = document.createElement("a");
        link.href = details.source;
        link.textContent = "Item source";
        link.rel = "noopener noreferrer";
        target.append(link);
      }
    }
  }
  function closeDetails(focus = false) {
    el("equipment-item-detail").hidden = true;
    const selected = panel.querySelector<HTMLButtonElement>(
      '.equipment-slot[aria-pressed="true"]',
    );
    selected?.setAttribute("aria-pressed", "false");
    selectedSlot = null;
    if (focus) selected?.focus();
  }
  function appendEquipped(
    target: HTMLElement,
    equipped: NonNullable<Item["equipped"]>,
  ) {
    const section = document.createElement("section");
    section.className = "equipment-captured-values";
    const heading = document.createElement("h4");
    heading.textContent = "Captured equipped values";
    section.append(heading);
    const date = new Date(equipped.capturedAt * 1000);
    if (Number.isFinite(equipped.capturedAt) && !Number.isNaN(date.getTime())) {
      const p = document.createElement("p"),
        time = document.createElement("time");
      time.dateTime = date.toISOString();
      time.textContent = date.toLocaleString();
      p.append("Captured ", time, ". These values describe the saved capture.");
      section.append(p);
    }
    const facts = document.createElement("dl");
    const entries: [string, number][] = [];
    if (
      typeof equipped.itemLevel === "number" &&
      Number.isFinite(equipped.itemLevel) &&
      equipped.itemLevel > 0
    )
      entries.push(["Item level", equipped.itemLevel]);
    for (const stat of equipped.baseStats || equipped.stats || []) {
      if (
        stat.name &&
        typeof stat.value === "number" &&
        Number.isFinite(stat.value)
      )
        entries.push([stat.name, stat.value]);
    }
    for (const [name, value] of entries) {
      const dt = document.createElement("dt"),
        dd = document.createElement("dd");
      dt.textContent = name;
      dd.textContent = String(value);
      facts.append(dt, dd);
    }
    if (facts.childElementCount) section.append(facts);
    if (equipped.baseStats?.length) {
      const note = document.createElement("p");
      note.textContent =
        "Base item stats; socket and conditional bonuses are separate.";
      section.append(note);
    }
    for (const effect of equipped.effects || []) {
      if (!effect) continue;
      const p = document.createElement("p");
      p.textContent = effect;
      section.append(p);
    }
    target.append(section);
  }
  function showDetails(item: NonNullable<Snapshot["items"]>[number]) {
    selectedSlot = item.slot;
    panel
      .querySelectorAll<HTMLButtonElement>(".equipment-slot")
      .forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset.slot === item.slot)),
      );
    const target = el("equipment-selected-content");
    target.replaceChildren();
    const image = artworkImage(item);
    if (image) target.append(image);
    const heading = document.createElement("h3");
    heading.append(itemLabel(item));
    target.append(heading);
    const identity = document.createElement("p");
    identity.className = "equipment-item-id";
    identity.textContent = `Census ID ${item.itemId}`;
    target.append(identity);
    const facts = document.createElement("dl");
    for (const [label, value] of [
      ["Quantity", item.quantity],
      ["Durability", item.durability],
    ] as const) {
      if (value !== null) {
        const dt = document.createElement("dt"),
          dd = document.createElement("dd");
        dt.textContent = label;
        dd.textContent = String(value);
        facts.append(dt, dd);
      }
    }
    target.append(facts);
    if (item.equipped) appendEquipped(target, item.equipped);
    if (item.details) appendDefinition(target, item.details, false);
    const sourced = sourceFor(item);
    if (sourced) appendDefinition(target, sourced, true);
    if (item.notes) {
      const label = document.createElement("h4"),
        notes = document.createElement("p");
      label.textContent = "Verified item details";
      notes.textContent = item.notes;
      target.append(label, notes);
    }
    if (item.identified === false) {
      const note = document.createElement("p");
      note.textContent = "Name and item details are awaiting verification.";
      target.append(note);
    }
    if (item.augments.length) {
      const h = document.createElement("h4");
      h.textContent = "Augments";
      target.append(h);
      for (const augment of item.augments) {
        const row = document.createElement("p");
        row.append(itemLabel(augment));
        if (augment.notes) {
          const note = document.createElement("small");
          note.textContent = augment.notes;
          row.append(document.createElement("br"), note);
        }
        target.append(row);
      }
    }
    el("equipment-item-detail").hidden = false;
  }
  function renderSheet(items: NonNullable<Snapshot["items"]>) {
    const focused =
      document.activeElement instanceof HTMLButtonElement &&
      document.activeElement.classList.contains("equipment-slot") &&
      panel.contains(document.activeElement)
        ? document.activeElement.dataset.slot
        : null;
    currentItems = items;
    const main = items.filter((item) => Number(item.slot) <= 15),
      extra = items.filter((item) => Number(item.slot) > 15),
      mid = Math.ceil(main.length / 2);
    for (const [id, group] of [
      ["equipment-left", main.slice(0, mid)],
      ["equipment-right", main.slice(mid)],
      ["equipment-extra", extra],
    ] as const) {
      const target = el(id);
      target.replaceChildren();
      for (const item of group) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "equipment-slot";
        b.dataset.slot = item.slot;
        b.dataset.itemId = item.itemId;
        b.setAttribute("aria-label", `Slot ${item.slot}: ${item.name}`);
        b.setAttribute("aria-pressed", String(selectedSlot === item.slot));
        b.setAttribute("aria-controls", "equipment-item-detail");
        b.title = item.name;
        const glyph = document.createElement("span");
        glyph.className = "equipment-slot-glyph";
        glyph.setAttribute("aria-hidden", "true");
        const svg = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "svg",
          ),
          path = document.createElementNS(svg.namespaceURI, "path");
        svg.setAttribute("viewBox", "0 0 32 32");
        path.setAttribute(
          "d",
          "M10 3h12l7 7v12l-7 7H10l-7-7V10Z M11 10h10v12H11Z M3 16h7m12 0h7M16 3v7m0 12v7",
        );
        svg.append(path);
        glyph.append(svg);
        b.append(glyph);
        const image = artworkImage(item);
        if (image) b.append(image);
        const name = document.createElement("span");
        name.className = "equipment-slot-name";
        name.textContent = item.name;
        b.append(name);
        if (item.quantity !== null && item.quantity > 1) {
          const quantity = document.createElement("span");
          quantity.className = "equipment-slot-quantity";
          quantity.textContent = String(item.quantity);
          b.append(quantity);
        }
        b.addEventListener("click", () => {
          if (selectedSlot === item.slot) closeDetails();
          else showDetails(item);
        });
        target.append(b);
      }
    }
    el("equipment-sheet").hidden = !profile;
    el("equipment-extra").hidden = !extra.length;
    (panel.querySelector(".equipment-extra-label") as HTMLElement).hidden =
      !extra.length;
    const selected = items.find((item) => item.slot === selectedSlot);
    if (selected) showDetails(selected);
    else closeDetails();
    if (focused)
      [...panel.querySelectorAll<HTMLButtonElement>(".equipment-slot")]
        .find((b) => b.dataset.slot === focused)
        ?.focus();
  }
  el("equipment-detail-close").addEventListener("click", () =>
    closeDetails(true),
  );
  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && selectedSlot !== null) {
      event.preventDefault();
      closeDetails(true);
    }
  });
  void fetch("/equipment-art.json")
    .then(async (r) => {
      if (!r.ok) return;
      const value = await r.json();
      if (value && typeof value === "object" && !Array.isArray(value)) {
        artwork = value;
        if (currentItems.length) renderSheet(currentItems);
      }
    })
    .catch(() => {});
  void fetch("/equipment-details.json")
    .then(async (r) => {
      if (!r.ok) return;
      const value = await r.json();
      if (value && typeof value === "object" && !Array.isArray(value)) {
        sourceDetails = value;
        if (currentItems.length) renderSheet(currentItems);
      }
    })
    .catch(() => {});
  function render(data: Snapshot) {
    const rows = el("equipment-items");
    if (data.items !== null) {
      rows.replaceChildren(
        ...data.items.map((item) => {
          const row = document.createElement("tr");
          const name = document.createElement("td"),
            details = document.createElement("td");
          name.append(itemLabel(item));
          const id = document.createElement("small");
          if (item.name !== `Census item ${item.itemId}`) {
            id.textContent = `Census ID ${item.itemId}`;
            name.append(document.createElement("br"), id);
          }
          const parts = [];
          if (item.quantity !== null) parts.push(`Quantity: ${item.quantity}`);
          if (item.durability !== null)
            parts.push(`Durability: ${item.durability}`);
          details.textContent = parts.join(" · ");
          if (item.notes) {
            const note = document.createElement("p");
            note.textContent = item.notes;
            details.append(note);
          }
          if (item.augments.length) {
            const augments = document.createElement("div");
            augments.append("Augments: ");
            item.augments.forEach((augment) => {
              const entry = document.createElement("div");
              entry.append(itemLabel(augment));
              if (augment.notes) {
                const note = document.createElement("small");
                note.textContent = augment.notes;
                entry.append(document.createElement("br"), note);
              }
              augments.append(entry);
            });
            details.append(augments);
          }
          row.append(name, details);
          return row;
        }),
      );
      el("equipment-table").hidden = data.items.length === 0;
      renderSheet(data.items);
    }
    el("equipment-time").textContent = data.syncedAt
      ? `Last synced from Census: ${new Date(data.syncedAt * 1000).toLocaleString()}`
      : "No successful equipment sync yet.";
    status.textContent = data.refreshing
      ? "Updating equipment from Census..."
      : data.unavailable
        ? "Census equipment is temporarily unavailable. Any saved loadout remains visible. Retry in a few minutes."
        : data.items?.length === 0
          ? "Census returned no equipped items for this character."
          : data.items === null
            ? "Equipment has not synced yet."
            : data.stale
              ? "Showing the last saved loadout. A newer snapshot is not available yet."
              : `${data.items.length} equipped items reported by Census.`;
    clearTimeout(cooldown);
    const wait = Math.max(0, data.refreshAfter * 1000 - Date.now());
    button.disabled = data.refreshing || wait > 0;
    button.title =
      wait > 0
        ? `Next refresh available ${new Date(data.refreshAfter * 1000).toLocaleTimeString()}`
        : "Refresh your linked character";
    if (wait > 0)
      cooldown = setTimeout(() => {
        button.disabled = false;
        button.title = "Refresh your linked character";
      }, wait + 100);
  }
  async function load(manual = false, polls = 0) {
    if (!profile) return;
    const current = generation;
    controller?.abort();
    controller = new AbortController();
    button.disabled = true;
    if (manual) status.textContent = "Updating equipment from Census...";
    try {
      const response = await fetch(
        manual
          ? "/api/profile/equipment/refresh"
          : `/api/profiles/${profile.id}/equipment`,
        {
          credentials: "same-origin",
          signal: controller.signal,
          ...(manual
            ? {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: "{}",
              }
            : {}),
        },
      );
      const data = await response.json();
      if (current !== generation) return;
      if (!response.ok)
        throw new Error(data.error || "Equipment is temporarily unavailable.");
      if (
        data.characterId !== profile.character.character_id ||
        data.worldId !== profile.character.world_id
      )
        throw new Error(
          "Your linked character changed. Reload this page to see its equipment.",
        );
      render(data);
      if (data.refreshing && polls < 5)
        timer = setTimeout(() => {
          void load(false, polls + 1);
        }, 3000);
      else if (data.refreshing)
        status.textContent =
          "Equipment is still updating. Reload this page in a few minutes; any saved loadout remains visible.";
    } catch (error) {
      if (current !== generation || (error as Error).name === "AbortError")
        return;
      status.textContent =
        (error as Error).message ||
        "Equipment is temporarily unavailable. Any saved loadout remains visible.";
      button.disabled = false;
    }
  }
  button.addEventListener("click", () => {
    if (owner) {
      clearTimeout(timer);
      void load(true);
    }
  });
  window.addEventListener("pagehide", () => {
    generation++;
    controller?.abort();
    clearTimeout(timer);
    clearTimeout(cooldown);
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted && profile) {
      clearTimeout(timer);
      clearTimeout(cooldown);
      void load();
    }
  });
  return {
    setProfile(p: Profile | null, canRefresh = false) {
      owner = canRefresh;
      button.hidden = !owner;
      panel.hidden = !p;
      const next = p
        ? `${p.id}:${p.character.character_id}:${p.character.world_id}`
        : "";
      profile = p;
      el("equipment-character-name").textContent =
        p?.character.name || "Character";
      el("equipment-character-level").textContent = p?.character.level
        ? `Level ${p.character.level}`
        : "";
      el("equipment-character-stats").textContent = p
        ? [
            p.character.combat_rating ? `CR ${p.character.combat_rating}` : "",
            p.character.skill_points
              ? `${p.character.skill_points} skill points`
              : "",
          ]
            .filter(Boolean)
            .join(" / ")
        : "";
      const portrait = el<HTMLImageElement>("player-screenshot");
      const safePortrait =
        !!p && p.screenshot === `/api/profiles/${p.id}/screenshot`;
      portrait.hidden = !safePortrait;
      if (safePortrait) portrait.src = p!.screenshot!;
      else portrait.removeAttribute("src");
      if (next === key) return;
      key = next;
      currentItems = [];
      closeDetails();
      renderSheet([]);
      generation++;
      controller?.abort();
      clearTimeout(timer);
      clearTimeout(cooldown);
      el("equipment-items").replaceChildren();
      el("equipment-table").hidden = true;
      el("equipment-time").textContent = "";
      status.textContent = "Loading equipment...";
      if (p) void load();
    },
  };
}
