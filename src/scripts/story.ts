export {};
const input = document.querySelector<HTMLInputElement>("#story-search")!;
const era = document.querySelector<HTMLSelectElement>("#story-era")!;
const groups = [...document.querySelectorAll<HTMLElement>(".story-group")];
const cards = [...document.querySelectorAll<HTMLAnchorElement>(".story-card")];
const params = new URLSearchParams(location.search);
input.value = params.get("q") || "";
const requested = params.get("era") || "";
if ([...era.options].some((o) => o.value === requested)) era.value = requested;
function filter() {
  const terms = input.value.toLowerCase().trim().split(/\s+/).filter(Boolean);
  let matches = 0;
  for (const card of cards) {
    const visible =
      (!era.value || card.dataset.era === era.value) &&
      terms.every((t) => (card.dataset.search || "").includes(t));
    card.closest<HTMLElement>(".story-row")!.hidden = !visible;
    if (visible) matches++;
  }
  for (const group of groups)
    group.hidden = ![...group.querySelectorAll<HTMLElement>(".story-row")].some(
      (row) => !row.hidden,
    );
  document.querySelector("#story-count")!.textContent =
    matches + " " + (matches === 1 ? "story" : "stories");
  document.querySelector<HTMLElement>("#story-empty")!.hidden = matches !== 0;
  const url = new URL(location.href);
  for (const [key, value] of [
    ["q", input.value.trim()],
    ["era", era.value],
  ]) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  history.replaceState(null, "", url);
}
input.addEventListener("input", filter);
era.addEventListener("change", filter);
filter();
