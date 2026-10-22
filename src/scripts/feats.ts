import { featSession } from "../../shared/feat-planning.mjs";
import { difficultyMeter } from "../../shared/feat-meter.mjs";
type Feat = {
  id: string;
  title: string;
  requirement: string;
  points: number | null;
  reward: string;
  group: string;
  context: string;
  href: string;
  releases: string[];
  difficulty: { level: number; label: string; reason: string };
  effort: {
    quick: boolean;
    archived: boolean;
    flags: string[];
    priority: number;
    lane: string;
  };
  bundle: { key: string; title: string; href: string; kind: string };
  videos: { title: string; url: string; scope: string }[];
};
const search = document.querySelector<HTMLInputElement>("#feat-search")!;
const group = document.querySelector<HTMLSelectElement>("#feat-group")!;
const release = document.querySelector<HTMLSelectElement>("#feat-release")!;
const difficulty =
  document.querySelector<HTMLSelectElement>("#feat-difficulty")!;
const points = document.querySelector<HTMLSelectElement>("#feat-points")!;
const sort = document.querySelector<HTMLSelectElement>("#feat-sort")!;
const quick = document.querySelector<HTMLInputElement>("#feat-quick")!;
const sessionRoot = document.querySelector<HTMLElement>("#feat-session")!;
let selected = new Set<string>();
try {
  const saved = JSON.parse(localStorage.getItem("dcuo-feat-session") || "[]");
  if (Array.isArray(saved))
    selected = new Set(
      saved.filter((x) => typeof x === "string").slice(0, 200),
    );
} catch {}
const results = document.querySelector<HTMLElement>("#feat-results")!;
const status = document.querySelector<HTMLElement>("#feat-status")!;
const previous = document.querySelector<HTMLButtonElement>("#feat-previous")!;
const next = document.querySelector<HTMLButtonElement>("#feat-next")!;
const pagination = document.querySelector<HTMLElement>("#feat-pagination")!;
const pageLabel = document.querySelector<HTMLElement>("#feat-page")!;
const escape = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
let feats: Feat[] = [],
  page = 1;
const params = new URLSearchParams(location.search);
for (const [key, input] of [
  ["q", search],
  ["group", group],
  ["release", release],
  ["difficulty", difficulty],
  ["points", points],
  ["sort", sort],
] as const) {
  const value = params.get(key) || "";
  if (
    input === search ||
    [...(input as HTMLSelectElement).options].some((o) => o.value === value)
  )
    input.value = value;
}
quick.checked = params.get("quick") === "1";
function renderSession() {
  const chosen = feats.filter((f) => selected.has(f.id));
  const session = featSession(chosen);
  document.querySelector<HTMLElement>("#session-total")!.textContent =
    chosen.length
      ? `${chosen.length} selected / ${session.points} potential points`
      : "No feats selected";
  sessionRoot.innerHTML = chosen.length
    ? `<p>${session.points} potential feat points (${session.skillPoints} complete 100-point blocks + ${session.remainder} points). Assumes each objective is unearned and eligible; your current feat-point remainder and prerequisite overlap may change the actual skill-point gain.</p>` +
      session.bundles
        .map(
          (b) =>
            `<section><h3><a href="${escape(b.href)}">${escape(b.title)}</a></h3><p>${escape(b.kind)} - compare requirements before the attempt; these candidates are not a verified single-run bundle.</p><ol>${b.feats.map((f: Feat) => `<li><a href="${escape(f.href)}">${escape(f.title)}</a> (${f.points ?? "unlisted"} points)<p>${escape(f.requirement)}</p><p>${escape(f.effort.flags.join("; "))}</p><button type="button" data-remove-feat="${f.id}">Remove ${escape(f.title)}</button></li>`).join("")}</ol></section>`,
        )
        .join("")
    : "<p>Add feats from the search results to make a session checklist.</p>";
  try {
    localStorage.setItem("dcuo-feat-session", JSON.stringify([...selected]));
  } catch {}
}
function render() {
  const terms = search.value
    .toLocaleLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const matches = feats.filter(
    (f) =>
      (!quick.checked || f.effort.quick) &&
      (!group.value || f.group === group.value) &&
      (!release.value || f.releases.includes(release.value)) &&
      (!difficulty.value || f.difficulty.level === Number(difficulty.value)) &&
      (!points.value ||
        (points.value === "none"
          ? f.points === null
          : f.points === Number(points.value))) &&
      terms.every((t) =>
        (f.title + " " + f.requirement + " " + f.group + " " + f.context)
          .toLocaleLowerCase()
          .includes(t),
      ),
  );
  if (sort.value === "name")
    matches.sort((a, b) => a.title.localeCompare(b.title));
  if (sort.value === "priority")
    matches.sort(
      (a, b) =>
        Number(b.effort.quick) - Number(a.effort.quick) ||
        b.effort.priority - a.effort.priority ||
        (b.points || 0) - (a.points || 0) ||
        a.title.localeCompare(b.title),
    );
  if (sort.value === "points")
    matches.sort(
      (a, b) =>
        (b.points || 0) - (a.points || 0) ||
        a.difficulty.level - b.difficulty.level,
    );
  if (sort.value === "difficulty")
    matches.sort(
      (a, b) =>
        a.difficulty.level - b.difficulty.level ||
        (b.points || 0) - (a.points || 0),
    );
  const pages = Math.max(1, Math.ceil(matches.length / 40));
  page = Math.min(page, pages);
  const shown = matches.slice((page - 1) * 40, page * 40);
  results.innerHTML = shown
    .map(
      (f) =>
        `<article class="feat-result"><div class="feat-result-heading"><h2><a href="${escape(f.href)}">${escape(f.title)}</a></h2><strong class="feat-points">${escape(f.points === null ? f.reward : `${f.points} feat points`)}</strong></div><p class="feat-context">${escape(f.group + (f.context !== "Feats" ? " / " + f.context : ""))}</p><p>${escape(f.requirement)}</p><p class="feat-rating" title="${escape(f.difficulty.reason)}">${difficultyMeter(f.difficulty.level, f.difficulty.label)} <span>Estimated ${f.difficulty.level}/5 / ${escape(f.difficulty.label)}</span></p><a class="feat-plan-link" href="${escape(f.href)}">How to get this feat &gt;</a><p class="feat-attempt">${escape(f.effort.lane)}${f.effort.flags.length ? ": " + escape(f.effort.flags.join("; ")) : ""}</p>${f.videos.length ? `<details><summary>Related video references (${f.videos.length})</summary><ul>${f.videos.map((v) => `<li><a href="${escape(v.url)}">${escape(v.title)}</a><p>${escape(v.scope)}</p></li>`).join("")}</ul></details>` : ""}<label class="feat-select"><input type="checkbox" data-plan-id="${f.id}" ${selected.has(f.id) ? "checked" : ""} ${f.effort.archived ? "disabled" : ""}/> ${f.effort.archived ? "Archived source - choose a current version" : "Add " + escape(f.title) + " to session"}</label></article>`,
    )
    .join("");
  status.textContent = matches.length
    ? `${matches.length.toLocaleString()} feats match. Showing ${(page - 1) * 40 + 1}-${Math.min(page * 40, matches.length)}.`
    : "No feats match. Try another search or remove a filter.";
  pagination.hidden = pages <= 1;
  previous.disabled = page <= 1;
  next.disabled = page >= pages;
  pageLabel.textContent = `Page ${page} of ${pages}`;
  const query = new URLSearchParams();
  for (const [key, input] of [
    ["q", search],
    ["group", group],
    ["release", release],
    ["difficulty", difficulty],
    ["points", points],
    ["sort", sort],
  ] as const)
    if (input.value) query.set(key, input.value);
  if (quick.checked) query.set("quick", "1");
  renderSession();
  history.replaceState(
    null,
    "",
    location.pathname + (query.size ? "?" + query : ""),
  );
}
for (const input of [search, group, release, difficulty, points, sort, quick])
  input.addEventListener(input === search ? "input" : "change", () => {
    page = 1;
    if (feats.length) render();
  });
results.addEventListener("change", (event) => {
  const target = event.target as HTMLInputElement;
  if (!target.dataset.planId) return;
  if (target.checked && selected.size < 200)
    selected.add(target.dataset.planId);
  else selected.delete(target.dataset.planId);
  render();
});
sessionRoot.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLButtonElement>(
    "[data-remove-feat]",
  );
  if (target?.dataset.removeFeat) {
    selected.delete(target.dataset.removeFeat);
    render();
  }
});
document.querySelector("#clear-feat-session")!.addEventListener("click", () => {
  selected.clear();
  render();
});
previous.addEventListener("click", () => {
  page--;
  render();
  results.scrollIntoView({ block: "start" });
});
next.addEventListener("click", () => {
  page++;
  render();
  results.scrollIntoView({ block: "start" });
});
fetch("/feats/catalog.json")
  .then(async (response) => {
    if (!response.ok) throw Error();
    feats = await response.json();
    const allowed = new Set(
      feats.filter((f) => !f.effort.archived).map((f) => f.id),
    );
    selected = new Set([...selected].filter((id) => allowed.has(id)));
    render();
  })
  .catch(() => {
    status.textContent =
      "Search could not load. All feats remain available in the category guides below.";
  });
