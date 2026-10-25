type Profile = {
  id: string;
  character: { character_id: string; world_id: string };
};
type Item = { itemId: string; name: string; href?: string };
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
    if (node instanceof HTMLAnchorElement) node.href = item.href!;
    return node;
  }
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
          if (item.href) {
            id.textContent = `Census ID ${item.itemId}`;
            name.append(document.createElement("br"), id);
          }
          const parts = [];
          if (item.quantity !== null) parts.push(`Quantity: ${item.quantity}`);
          if (item.durability !== null)
            parts.push(`Durability: ${item.durability}`);
          details.textContent = parts.join(" · ");
          if (item.augments.length) {
            const augments = document.createElement("div");
            augments.append("Augments: ");
            item.augments.forEach((augment, index) => {
              if (index) augments.append(", ");
              augments.append(itemLabel(augment));
            });
            details.append(augments);
          }
          row.append(slot, name, details);
          return row;
        }),
      );
      el("equipment-table").hidden = data.items.length === 0;
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
      if (next === key) return;
      key = next;
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
