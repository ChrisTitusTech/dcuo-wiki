export {};
type Part = {
  id: string;
  title: string;
  text: string;
  baseHash: string;
  revision: number;
  kind: string;
};
type Draft = {
  replacement: string;
  reason: string;
  sources: string;
  baseHash: string;
  revision: number;
};
const root = document.querySelector<HTMLElement>("#article-editor")!;
const form = document.querySelector<HTMLFormElement>("#article-edit-form")!;
const select = document.querySelector<HTMLSelectElement>("#edit-part")!;
const text = document.querySelector<HTMLTextAreaElement>("#edit-text")!;
const status = document.querySelector<HTMLElement>("#edit-status")!;
const submit = document.querySelector<HTMLButtonElement>("#submit-edit")!;
const original = document.querySelector<HTMLElement>("#edit-original")!;
const endpoint = `/api/articles/${encodeURIComponent(root.dataset.slug!)}`;
const key = `wiki-edit:${root.dataset.slug}`;
const field = (name: string) =>
  form.elements.namedItem(name) as HTMLTextAreaElement;
let requestedPart: string | undefined;
let loading = false,
  busy = false;
function setBusy(value: boolean) {
  busy = value;
  form
    .querySelectorAll<
      | HTMLInputElement
      | HTMLSelectElement
      | HTMLTextAreaElement
      | HTMLButtonElement
    >("input,select,textarea,button")
    .forEach((control) => (control.disabled = value));
  submit.disabled = value || !eligible;
}
let parts: Part[] = [];
let drafts: Record<string, Draft> = {};
let selected = "0",
  dirty = false,
  eligible = false,
  loaded = false;
async function api(path: string, init: RequestInit = {}) {
  const response = await fetch(path, { ...init, credentials: "same-origin" });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Request failed. Please try again.");
  return data;
}
function remember() {
  if (!loaded) return;
  const part = parts[Number(selected)];
  const previous = drafts[part.id];
  drafts[part.id] = {
    replacement: text.value,
    reason: field("reason").value,
    sources: field("sources").value,
    baseHash: previous?.baseHash ?? part.baseHash,
    revision: previous?.revision ?? part.revision,
  };
  dirty = Object.entries(drafts).some(
    ([id, d]) =>
      d.replacement !== parts.find((p) => p.id === id)?.text ||
      d.reason ||
      d.sources,
  );
  try {
    sessionStorage.setItem(key, JSON.stringify({ selected, drafts }));
  } catch {}
}
function show() {
  select.value = selected;
  const part = parts[Number(selected)],
    draft = drafts[part.id];
  text.required = part.kind !== "videos";
  text.value = draft?.replacement ?? part.text;
  original.textContent = part.text;
  field("reason").value = draft?.reason ?? "";
  field("sources").value = draft?.sources ?? "";
  if (
    draft &&
    (draft.baseHash !== part.baseHash || draft.revision !== part.revision)
  )
    status.textContent =
      "This section changed since your draft. Copy any edits you want to keep, discard the old draft, and apply them to the current text.";
}
form.addEventListener("input", remember);
select.addEventListener("input", (event) => event.stopPropagation());
select.addEventListener("change", () => {
  selected = select.value;
  if (loaded) show();
});
document.querySelector("#reset-edit")!.addEventListener("click", async () => {
  if (
    !loaded ||
    busy ||
    (dirty &&
      !confirm("Discard the draft for this section and load the current text?"))
  )
    return;
  setBusy(true);
  try {
    const fresh = await api(endpoint);
    parts = fresh.parts;
    delete drafts[parts[Number(selected)].id];
    show();
    remember();
    status.textContent = "Loaded the latest published text.";
  } catch (error) {
    status.textContent = (error as Error).message;
  } finally {
    setBusy(false);
  }
});
window.addEventListener("beforeunload", (event) => {
  if (dirty) {
    event.preventDefault();
    event.returnValue = "";
  }
});
async function start() {
  if (loaded || loading) return;
  loading = true;
  try {
    const data = await api(endpoint);
    parts = data.parts;
    selected = String(
      Math.max(
        0,
        parts.findIndex((part) => part.id === "section-0"),
      ),
    );
    try {
      const saved = JSON.parse(sessionStorage.getItem(key) || "null");
      if (
        saved &&
        parts[Number(saved.selected)] &&
        saved.drafts &&
        typeof saved.drafts === "object"
      ) {
        for (const [id, value] of Object.entries(saved.drafts)) {
          const d = value as Draft;
          if (
            parts.some((p) => p.id === id) &&
            [d?.replacement, d?.reason, d?.sources, d?.baseHash].every(
              (v) => typeof v === "string",
            ) &&
            Number.isInteger(d.revision)
          )
            drafts[id] = d;
        }
        selected = String(saved.selected);
      }
    } catch {}
    if (requestedPart) {
      const index = parts.findIndex((part) => part.id === requestedPart);
      if (index >= 0) selected = String(index);
      requestedPart = undefined;
    }
    loaded = true;
    form.hidden = false;
    select.replaceChildren(
      ...parts.map((p, i) => new Option(p.title, String(i))),
    );
    show();
    remember();
    try {
      const me = await api("/api/me");
      eligible = !!me.profile;
      status.textContent = eligible
        ? `Signed in as ${me.name}. Corrections will be published immediately under your character name.`
        : "Save a Census-matched profile before publishing.";
    } catch {
      status.textContent =
        "Sign in with Discord and match a character before publishing. You can prepare a draft below.";
    }
    submit.disabled = !eligible;
    document.querySelector<HTMLElement>("#edit-account")!.hidden = eligible;
  } catch (error) {
    status.textContent = (error as Error).message;
  } finally {
    loading = false;
  }
}
if (location.hash === "#article-editor") {
  root.setAttribute("open", "");
  start();
}
root.addEventListener("toggle", () => {
  if (root.hasAttribute("open")) start();
});
document
  .querySelectorAll<HTMLAnchorElement>('a[href="#article-editor"]')
  .forEach((link) =>
    link.addEventListener("click", (event) => {
      if (busy) {
        event.preventDefault();
        return;
      }
      requestedPart = link.dataset.editPart || "section-0";
      if (loaded) {
        remember();
        const index = parts.findIndex((part) => part.id === requestedPart);
        if (index >= 0) selected = String(index);
        requestedPart = undefined;
        show();
      }
      root.setAttribute("open", "");
      start();
    }),
  );
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!eligible || !loaded || busy) return;
  remember();
  const part = parts[Number(selected)],
    draft = drafts[part.id];
  if (text.value.trim() === part.text.trim()) {
    status.textContent = "Change the proposed text before publishing.";
    return;
  }
  setBusy(true);
  status.textContent = "Checking Census and publishing...";
  try {
    await api(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        part: part.id,
        content: text.value,
        reason: draft.reason,
        sources: draft.sources,
        baseHash: draft.baseHash,
        revision: draft.revision,
      }),
    });
    delete drafts[part.id];
    try {
      sessionStorage.setItem(key, JSON.stringify({ selected, drafts }));
    } catch {}
    dirty = false;
    location.reload();
  } catch (error) {
    status.textContent = (error as Error).message;
    setBusy(false);
  }
});
const history = document.querySelector<HTMLDetailsElement>("#edit-history")!;
history.addEventListener("toggle", async () => {
  if (!history.open) return;
  const list = document.querySelector<HTMLElement>("#edit-history-list")!;
  list.textContent = "Loading history...";
  try {
    const { revisions } = await api(`${endpoint}/history`);
    list.replaceChildren();
    if (!revisions.length) list.textContent = "No player edits yet.";
    for (const revision of revisions) {
      const entry = document.createElement("details"),
        heading = document.createElement("summary");
      heading.textContent = `${new Date(revision.created_at * 1000).toLocaleString()} - ${revision.character_name} - ${revision.part}`;
      entry.append(heading);
      for (const value of [
        `Reason: ${revision.reason}`,
        `Evidence: ${revision.sources}`,
        `Before: ${revision.previous_content}`,
        `After: ${revision.content}`,
      ]) {
        const p = document.createElement("p");
        p.style.whiteSpace = "pre-wrap";
        p.textContent = value;
        entry.append(p);
      }
      const restore = document.createElement("button");
      restore.textContent = "Restore text from before this edit";
      restore.addEventListener("click", async () => {
        if (busy) return;
        await start();
        if (!loaded) return;
        const i = parts.findIndex((p) => p.id === revision.part);
        if (i < 0) return;
        if (dirty && !confirm("Replace the current draft with this revision?"))
          return;
        selected = String(i);
        delete drafts[revision.part];
        show();
        text.value = revision.previous_content;
        field("reason").value = `Revert revision ${revision.id}: `;
        field("sources").value = revision.sources;
        remember();
        root.setAttribute("open", "");
        root.scrollIntoView();
      });
      entry.append(restore);
      list.append(entry);
    }
  } catch (error) {
    list.textContent = (error as Error).message;
  }
});
