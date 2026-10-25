const root = document.querySelector<HTMLElement>("#library")!;
const input = document.querySelector<HTMLInputElement>("#search")!;
const releaseSelect =
  document.querySelector<HTMLSelectElement>("#release-filter");
const params = new URLSearchParams(location.search);
if (params.get("category") === "Progression") params.set("category", "Feats");
const categoryButtons = [
  ...root.querySelectorAll<HTMLButtonElement>("[data-category]"),
];
const allowed = categoryButtons.map((button) => button.dataset.category);
let category = allowed.includes(params.get("category") || "")
  ? params.get("category")!
  : "All";
input.value = params.get("q") || "";
if (releaseSelect) {
  const selected = [...releaseSelect.options].find(
    (option) => option.value === params.get("release") && !option.disabled,
  );
  releaseSelect.value = selected?.value || "";
}
const cards = [...root.querySelectorAll<HTMLAnchorElement>(".card")];
type CatalogEntry = {
  slug: string;
  title: string;
  category: string;
  type: string;
  summary: string;
  releaseIds: string[];
  releaseText?: string;
};
let catalog: CatalogEntry[] = [];
const catalogCards: HTMLElement[] = [];
const pageSize = 48;
let currentPage = 1;
const previous = root.querySelector<HTMLButtonElement>("#previous-guides")!;
const next = root.querySelector<HTMLButtonElement>("#next-guides")!;
function filter(resetPage = true, updateUrl = true) {
  if (resetPage) currentPage = 1;
  const release = root.dataset.fixedRelease || releaseSelect?.value || "";
  const matching = cards.filter(
    (card) =>
      (category === "All" || card.dataset.type === category) &&
      (!release || card.dataset.releases?.split(" ").includes(release)) &&
      (card.dataset.search || "").includes(input.value.trim().toLowerCase()),
  );
  const query = input.value.trim().toLowerCase();
  const additional = catalog.filter(
    (entry) =>
      (category === "All" || entry.category === category) &&
      (!release || entry.releaseIds.includes(release)) &&
      [
        entry.title,
        entry.summary,
        entry.category,
        entry.type,
        entry.releaseText || "",
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
  );
  const total = matching.length + additional.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  currentPage = Math.min(currentPage, pages);
  cards.forEach((card) => (card.hidden = true));
  const start = (currentPage - 1) * pageSize;
  catalogCards.splice(0).forEach((card) => card.remove());
  matching
    .slice(start, start + pageSize)
    .forEach((card) => (card.hidden = false));
  const extraStart = Math.max(0, start - matching.length);
  const extraEnd = Math.max(0, start + pageSize - matching.length);
  additional.slice(extraStart, extraEnd).forEach((entry) => {
    const card = document.createElement("a");
    card.className = "card";
    card.href = `/wiki/${entry.slug}/`;
    for (const [tag, className, text] of [
      ["div", "eyebrow", `${entry.category} / ${entry.type}`],
      ["h3", "", entry.title],
      ["p", "", entry.summary],
      ["span", "card-link", "Read article →"],
    ]) {
      const element = document.createElement(tag);
      element.className = className;
      element.textContent = text;
      card.append(element);
    }
    root.querySelector(".cards")!.append(card);
    catalogCards.push(card);
  });
  root.querySelector("#count")!.textContent =
    total > pageSize
      ? `${start + 1}-${Math.min(start + pageSize, total)} of ${total} guides`
      : `${total} ${total === 1 ? "guide" : "guides"}`;
  root.querySelector<HTMLElement>(".library-pagination")!.hidden = pages <= 1;
  root.querySelector("#guide-page")!.textContent =
    `Page ${currentPage} of ${pages}`;
  previous.disabled = currentPage === 1;
  next.disabled = currentPage === pages;
  root.querySelector<HTMLElement>("#empty")!.hidden = total !== 0;
  categoryButtons.forEach((button) =>
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.category === category),
    ),
  );
  if (updateUrl) {
    const url = new URL(location.href);
    const set = (key: string, value: string) =>
      value ? url.searchParams.set(key, value) : url.searchParams.delete(key);
    set("q", input.value.trim());
    set("category", category === "All" ? "" : category);
    set("release", root.dataset.fixedRelease ? "" : release);
    history.replaceState(null, "", url);
  }
}
filter(false, false);
input.addEventListener("input", () => filter());
releaseSelect?.addEventListener("change", () => filter());
categoryButtons.forEach((button) =>
  button.addEventListener("click", () => {
    category = button.dataset.category!;
    filter();
  }),
);
for (const [button, direction] of [
  [previous, -1],
  [next, 1],
] as const)
  button.addEventListener("click", () => {
    currentPage += direction;
    filter(false);
    root.scrollIntoView({ block: "start" });
  });
document
  .querySelector(".global-search")
  ?.addEventListener("submit", (event) => {
    event.preventDefault();
    filter();
    root.scrollIntoView({ block: "start" });
  });

fetch("/catalog-index.json")
  .then((response) => {
    if (!response.ok) throw Error("Reference index unavailable");
    return response.json();
  })
  .then(async (entries: CatalogEntry[]) => {
    try {
      const response = await fetch("/api/catalog-corrections");
      if (response.ok) {
        const updates = (await response.json()).corrections as {
          slug: string;
          part: string;
          title: string | null;
          summary: string;
          base_hash: string;
        }[];
        const bySlug = new Map(entries.map((e) => [e.slug, e]));
        const documents = new Set(
          updates.filter((r) => r.part === "document").map((r) => r.slug),
        );
        for (const row of updates) {
          const entry = bySlug.get(row.slug);
          if (!entry) continue;
          if (row.part === "document") {
            entry.title = row.title || entry.title;
            entry.summary = row.summary;
          } else if (!documents.has(row.slug)) {
            const bytes = await crypto.subtle.digest(
              "SHA-256",
              new TextEncoder().encode(entry.summary),
            );
            const hash = [...new Uint8Array(bytes)]
              .map((n) => n.toString(16).padStart(2, "0"))
              .join("");
            if (hash === row.base_hash) entry.summary = row.summary;
          }
        }
      }
    } catch {
      /* Source metadata stays usable when live corrections are unavailable. */
    }
    catalog = entries;
    root.dataset.catalogReady = "true";
    filter(false, false);
  })
  .catch(() => {
    const notice = document.createElement("p");
    notice.setAttribute("role", "status");
    notice.textContent =
      "The additional reference index could not load. Refresh to search all imported articles.";
    root.prepend(notice);
  });
