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
  const pages = Math.max(1, Math.ceil(matching.length / pageSize));
  currentPage = Math.min(currentPage, pages);
  cards.forEach((card) => (card.hidden = true));
  const start = (currentPage - 1) * pageSize;
  matching
    .slice(start, start + pageSize)
    .forEach((card) => (card.hidden = false));
  root.querySelector("#count")!.textContent =
    matching.length > pageSize
      ? `${start + 1}-${Math.min(start + pageSize, matching.length)} of ${matching.length} guides`
      : `${matching.length} ${matching.length === 1 ? "guide" : "guides"}`;
  root.querySelector<HTMLElement>(".library-pagination")!.hidden = pages <= 1;
  root.querySelector("#guide-page")!.textContent =
    `Page ${currentPage} of ${pages}`;
  previous.disabled = currentPage === 1;
  next.disabled = currentPage === pages;
  root.querySelector<HTMLElement>("#empty")!.hidden = matching.length !== 0;
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
