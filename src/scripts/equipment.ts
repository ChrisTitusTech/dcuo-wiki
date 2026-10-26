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
type Item = {
  itemId: string;
  name: string;
  href?: string;
  identified?: boolean;
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
  const safeArtwork = (item: Item) => {
    const slug = item.href?.match(/^\/wiki\/([A-Za-z0-9_%-]+)\/$/)?.[1];
    const path = slug ? artwork[slug] : null;
    return path && /^\/api\/catalog-media\/[a-f0-9]{64}$/.test(path)
      ? path
      : null;
  };
  function artworkImage(item: Item) {
    const path = safeArtwork(item);
    if (!path) return null;
    const image = document.createElement("img");
    image.src = path;
    image.alt = "";
    image.loading = "lazy";
    image.addEventListener("error", () => image.remove(), { once: true });
    return image;
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
    identity.textContent = `Slot ${item.slot} / Census ID ${item.itemId}`;
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
        const label = document.createElement("span");
        label.className = "equipment-slot-number";
        label.textContent = `Slot ${item.slot}`;
        b.append(label);
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
  function render(data: Snapshot) {
    const rows = el("equipment-items");
    if (data.items !== null) {
      rows.replaceChildren(
        ...data.items.map((item) => {
          const row = document.createElement("tr");
          const slot = document.createElement("td"),
            name = document.createElement("td"),
            details = document.createElement("td");
          slot.textContent = `Slot ${item.slot}`;
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
          row.append(slot, name, details);
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
