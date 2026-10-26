export {};
const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const status = el("identification-status");
async function api(path: string, init: RequestInit = {}) {
  const r = await fetch(path, { ...init, credentials: "same-origin" }),
    data = await r.json();
  if (!r.ok)
    throw new Error(
      data.error || "Item identification is temporarily unavailable.",
    );
  return data;
}
const post = (path: string, data: unknown) =>
  api(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
let cursor: string | null = "",
  moderator = false;
async function queue(reset = false) {
  if (reset) {
    cursor = "";
    el("unknown-items").replaceChildren();
  }
  const data = await api(
    "/api/items/unidentified" +
      (cursor ? "?after=" + encodeURIComponent(cursor) : ""),
  );
  for (const item of data.items) {
    const row = document.createElement("tr");
    for (const value of [
      item.item_id,
      item.characters,
      item.pending,
      new Date(item.lastSeen * 1000).toLocaleDateString(),
    ]) {
      const cell = document.createElement("td");
      cell.textContent = String(value);
      row.append(cell);
    }
    el("unknown-items").append(row);
  }
  cursor = data.next;
  el("unknown-more").hidden = !cursor;
  el("unknown-empty").hidden =
    !!el("unknown-items").children.length || !!cursor;
}
el("unknown-more").addEventListener("click", async () => {
  const button = el<HTMLButtonElement>("unknown-more");
  button.disabled = true;
  try {
    await queue();
  } catch (e) {
    status.textContent = (e as Error).message;
  } finally {
    button.disabled = false;
  }
});
function paragraph(parent: HTMLElement, text: string) {
  const p = document.createElement("p");
  p.textContent = text;
  parent.append(p);
  return p;
}
let submissionCursor: string | null = null,
  reviewCursor: string | null = null;
async function submissions(reset = true) {
  const { submissions, next } = await api(
      "/api/items/evidence" +
        (!reset && submissionCursor
          ? "?before=" + encodeURIComponent(submissionCursor)
          : ""),
    ),
    target = el("item-submission-list");
  if (reset) target.replaceChildren();
  submissionCursor = next;
  el("item-submissions-more").hidden = !next;
  if (!submissions.length) paragraph(target, "No item evidence submitted yet.");
  for (const s of submissions) {
    const p = paragraph(
      target,
      `${s.proposed_name} (Census ${s.item_id}) - ${s.status}`,
    );
    const link = document.createElement("a");
    link.href = `/api/items/evidence/${s.id}/image`;
    link.textContent = "View your tooltip evidence";
    p.append(" ", link);
    if (s.review_reason) paragraph(target, s.review_reason);
  }
  el("item-submissions").hidden = false;
}
function field(
  form: HTMLFormElement,
  label: string,
  name: string,
  value: string,
  multiline = false,
) {
  const wrap = document.createElement("label");
  wrap.textContent = label;
  const input = document.createElement(multiline ? "textarea" : "input");
  input.name = name;
  input.value = value;
  input.maxLength = name === "reason" || name === "notes" ? 2000 : 180;
  if (name === "reason") {
    input.required = true;
    input.minLength = 10;
  }
  wrap.append(input);
  form.append(wrap);
  return input;
}
async function reviews(reset = true) {
  if (!moderator) return;
  const selected = el<HTMLSelectElement>("item-review-status").value;
  const { submissions, next } = await api(
      "/api/items/review?status=" +
        selected +
        (!reset && reviewCursor
          ? "&before=" + encodeURIComponent(reviewCursor)
          : ""),
    ),
    target = el("item-review-list");
  if (reset) target.replaceChildren();
  reviewCursor = next;
  el("item-reviews-more").hidden = !next;
  if (!submissions.length) paragraph(target, "No evidence with this status.");
  for (const s of submissions) {
    const card = document.createElement("article");
    card.className = "item-review-card";
    const h = document.createElement("h3");
    h.textContent = `${s.proposed_name} - Census ${s.item_id}`;
    card.append(h);
    paragraph(
      card,
      `${s.character_name}, world ${s.world_id}. Census snapshot: ${new Date(s.synced_at * 1000).toLocaleString()}. Status: ${s.status}.`,
    );
    paragraph(card, s.evidence);
    const details = document.createElement("details"),
      summary = document.createElement("summary");
    summary.textContent = "Tooltip and saved equipment";
    details.append(summary);
    const image = document.createElement("img");
    image.src = `/api/items/evidence/${s.id}/image`;
    image.alt = "Submitted item tooltip";
    image.loading = "lazy";
    details.append(image);
    const pre = document.createElement("pre");
    pre.textContent = JSON.stringify(JSON.parse(s.snapshot_json), null, 2);
    details.append(pre);
    card.append(details);
    if (s.review_reason) paragraph(card, "Review: " + s.review_reason);
    const history = JSON.parse(s.history_json || "[]");
    if (history.length) {
      const audit = document.createElement("details"),
        label = document.createElement("summary");
      label.textContent = "Review history";
      audit.append(label);
      for (const entry of history)
        paragraph(
          audit,
          `${entry.decision}: ${entry.reason}${entry.name ? " | " + entry.name : ""}${entry.notes ? " | " + entry.notes : ""}`,
        );
      card.append(audit);
    }
    if (selected === "pending" || selected === "approved") {
      const form = document.createElement("form");
      if (selected === "pending") {
        field(form, "Verified item name", "name", s.proposed_name);
        field(form, "Existing wiki article slug (optional)", "slug", "");
        field(
          form,
          "Verified details / stats (optional, cite variant and source)",
          "notes",
          "",
          true,
        );
      } else
        paragraph(
          form,
          `Published as ${s.name}${s.slug ? " -> /wiki/" + s.slug + "/" : ""}. ${s.notes || ""}`,
        );
      field(form, "Review explanation", "reason", "", true);
      for (const decision of selected === "pending"
        ? ["approved", "rejected"]
        : ["revoked"]) {
        const button = document.createElement("button");
        button.type = "submit";
        button.value = decision;
        button.textContent =
          decision === "approved"
            ? "Publish verified mapping"
            : decision === "rejected"
              ? "Reject evidence"
              : "Revoke mapping";
        form.append(button);
      }
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submitter = (event as SubmitEvent).submitter as HTMLButtonElement;
        const buttons = form.querySelectorAll("button");
        buttons.forEach((b) => (b.disabled = true));
        try {
          await post("/api/items/review", {
            ...Object.fromEntries(new FormData(form)),
            id: s.id,
            status: submitter.value,
          });
          status.textContent =
            submitter.value === "approved"
              ? "Verified item published to all equipment profiles."
              : submitter.value === "revoked"
                ? "Mapping revoked. The item is unidentified again."
                : "Evidence rejected.";
          await Promise.all([reviews(), queue(true), submissions()]);
        } catch (e) {
          status.textContent = (e as Error).message;
        } finally {
          buttons.forEach((b) => (b.disabled = false));
        }
      });
      card.append(form);
    }
    target.append(card);
  }
}
for (const [id, load] of [
  ["item-submissions-more", () => submissions(false)],
  ["item-reviews-more", () => reviews(false)],
] as const) {
  el(id).addEventListener("click", async () => {
    const button = el<HTMLButtonElement>(id);
    button.disabled = true;
    try {
      await load();
    } catch (e) {
      status.textContent = (e as Error).message;
    } finally {
      button.disabled = false;
    }
  });
}
el("item-review-status").addEventListener("change", () => {
  void reviews().catch((e) => (status.textContent = e.message));
});
async function screenshot(file: File) {
  if (
    !file ||
    !["image/png", "image/jpeg"].includes(file.type) ||
    file.size > 10 * 1024 * 1024
  )
    throw new Error("Choose a PNG or JPEG up to 10 MB.");
  const bitmap = await createImageBitmap(file),
    scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height)),
    canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.85),
  );
  if (!blob || blob.size > 256 * 1024)
    throw new Error(
      "Crop closer to the tooltip; the resized screenshot must be under 256 KB.",
    );
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
el<HTMLFormElement>("item-evidence-form").addEventListener(
  "submit",
  async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement,
      button = form.querySelector("button")!;
    button.disabled = true;
    try {
      const data = new FormData(form);
      await post("/api/items/evidence", {
        itemId: data.get("itemId"),
        name: data.get("name"),
        evidence: data.get("evidence"),
        image: await screenshot(data.get("image") as File),
      });
      status.textContent =
        "Item evidence submitted for moderator review. It is not published yet.";
      form.reset();
      await Promise.all([submissions(), queue(true)]);
    } catch (e) {
      status.textContent = (e as Error).message;
    } finally {
      button.disabled = false;
    }
  },
);
async function start() {
  try {
    await queue();
    status.textContent =
      "Help identify items using exact names and in-game evidence.";
  } catch (e) {
    status.textContent = (e as Error).message;
  }
  let me;
  try {
    me = await api("/api/me");
  } catch {
    return;
  }
  moderator = me.moderator;
  el("item-review").hidden = !moderator;
  try {
    await submissions();
    await reviews();
    if (!me.profile) {
      el("item-sign-in").textContent =
        "Link a character in your player account to submit item evidence.";
      return;
    }
    const data = await api(`/api/profiles/${me.profile.id}/equipment`);
    const items = new Map<string, string>();
    for (const item of data.items || [])
      for (const entry of [item, ...item.augments])
        if (entry.identified === false) items.set(entry.itemId, entry.name);
    const select = el<HTMLFormElement>("item-evidence-form").elements.namedItem(
      "itemId",
    ) as HTMLSelectElement;
    select.replaceChildren(
      ...[...items].map(([id, name]) => new Option(`${name} (${id})`, id)),
    );
    const requested = new URLSearchParams(location.search).get("item");
    if (requested && items.has(requested)) select.value = requested;
    el("item-sign-in").textContent = items.size
      ? "Choose an unknown item equipped by your linked character."
      : "Your saved loadout has no unidentified items. Refresh equipment after changing gear.";
    el("item-evidence-form").hidden = !items.size;
    el("item-snapshot-time").textContent = data.syncedAt
      ? "Saved equipment: " + new Date(data.syncedAt * 1000).toLocaleString()
      : "";
  } catch (e) {
    status.textContent = (e as Error).message;
  }
}
void start();
