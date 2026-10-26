const list = document.getElementById("companion-items")!;
const status = document.getElementById("companion-items-status")!;
const button = document.getElementById(
  "companion-items-more",
) as HTMLButtonElement;
let cursor: string | null = null,
  busy = false,
  count = 0;
const seen = new Set<string>();
async function load() {
  if (busy) return;
  busy = true;
  button.disabled = true;
  try {
    const response = await fetch(
      "/api/companion/items" +
        (cursor ? "?cursor=" + encodeURIComponent(cursor) : ""),
    );
    if (!response.ok)
      throw Error("Item catalog is temporarily unavailable. Please retry.");
    const data = await response.json();
    if (!Array.isArray(data.items))
      throw Error("Item catalog is temporarily unavailable. Please retry.");
    for (const item of data.items) {
      if (
        typeof item.itemId !== "string" ||
        seen.has(item.itemId) ||
        typeof item.name !== "string" ||
        typeof item.href !== "string" ||
        !/^\/wiki\/[A-Za-z0-9_-]+\/$/.test(item.href)
      )
        continue;
      seen.add(item.itemId);
      count++;
      const row = document.createElement("li"),
        link = document.createElement("a");
      link.href = item.href;
      link.textContent = item.name;
      if (
        typeof item.icon === "string" &&
        /^\/api\/item-icons\/[a-f0-9]{64}$/.test(item.icon)
      ) {
        const image = document.createElement("img");
        image.src = item.icon;
        image.alt = "";
        image.width = 48;
        image.height = 48;
        image.loading = "lazy";
        image.addEventListener("error", () => image.remove(), { once: true });
        row.append(image);
      }
      row.append(link, document.createTextNode(" - Item " + item.itemId));
      if (Number.isSafeInteger(item.updatedAt) && item.updatedAt > 0) {
        const time = document.createElement("time"),
          date = new Date(item.updatedAt * 1000);
        if (!Number.isNaN(date.getTime())) {
          time.dateTime = date.toISOString();
          time.textContent = " Updated " + date.toLocaleDateString();
          row.append(time);
        }
      }
      list.append(row);
    }
    cursor =
      typeof data.nextCursor === "string" &&
      /^[1-9]\d{0,29}$/.test(data.nextCursor)
        ? data.nextCursor
        : null;
    button.hidden = !cursor;
    status.textContent = count
      ? `${count} contributed items shown.`
      : "No item definitions have been contributed yet.";
  } catch (error) {
    status.textContent = (error as Error).message;
    button.hidden = false;
    button.textContent = "Retry loading items";
  } finally {
    busy = false;
    button.disabled = false;
  }
}
button.addEventListener("click", () => void load());
void load();

export {};
