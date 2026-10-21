export {};
type Character = {
  character_id: string;
  name: string;
  world_id: string;
  level: string;
  combat_rating: string;
  skill_points: string;
};
type Profile = {
  id: string;
  character: Character;
  bio: string;
  screenshot: string | null;
};
const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const status = el("account-status");
const requestedPage = new URLSearchParams(location.search).get("page");
if (requestedPage) {
  const login = document.querySelector<HTMLAnchorElement>("#signed-out a")!;
  login.href = `/api/auth/discord?page=${encodeURIComponent(requestedPage.slice(0, 120))}`;
}
let characters: Character[] = [];
async function api(path: string, init: RequestInit = {}) {
  const response = await fetch(path, { ...init, credentials: "same-origin" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}
const post = (path: string, data: unknown) =>
  api(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
function showProfile(p: Profile | null) {
  el("profile-summary").hidden = !p;
  el("contribution-form").hidden = !p;
  el("contribution-lock").textContent = p
    ? "Census matched. Your character will be checked again when you submit."
    : "Match a character in Census to unlock submissions.";
  if (!p) return;
  el("match-status").textContent =
    `Census matched: ${p.character.name} (world ${p.character.world_id}). Ownership is not verified.`;
  const link = el<HTMLAnchorElement>("profile-link");
  link.href = `/player/?id=${encodeURIComponent(p.id)}`;
  el("remove-screenshot").hidden = !p.screenshot;
  const form = el<HTMLFormElement>("profile-form");
  (form.elements.namedItem("bio") as HTMLTextAreaElement).value = p.bio;
  characters = [p.character];
  renderChoices();
}
function renderChoices() {
  const form = el<HTMLFormElement>("profile-form"),
    select = form.elements.namedItem("character") as HTMLSelectElement;
  select.replaceChildren(
    ...characters.map(
      (c) =>
        new Option(
          `${c.name} - world ${c.world_id}, level ${c.level}, CR ${c.combat_rating}`,
          c.character_id,
        ),
    ),
  );
  form.hidden = characters.length === 0;
}
function bind(id: string, handler: (form: HTMLFormElement) => Promise<void>) {
  el<HTMLFormElement>(id).addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement,
      button = form.querySelector("button")!;
    button.disabled = true;
    status.textContent = "Working...";
    try {
      await handler(form);
    } catch (e) {
      status.textContent = (e as Error).message;
    } finally {
      button.disabled = false;
    }
  });
}
async function submissions() {
  const data = await api("/api/contributions"),
    target = el("my-submissions");
  target.replaceChildren();
  if (!data.contributions.length) target.textContent = "No submissions yet.";
  for (const c of data.contributions) {
    const p = document.createElement("p");
    p.textContent = `${c.page_slug} - ${c.status}`;
    target.append(p);
  }
}
bind("character-search", async (form) => {
  characters = (
    await api(
      `/api/characters?name=${encodeURIComponent(String(new FormData(form).get("name")))}`,
    )
  ).characters;
  renderChoices();
  status.textContent = characters.length
    ? "Choose your character and save your profile."
    : "No exact match found. Check spelling or try again later if Census has not updated.";
});
bind("profile-form", async (form) => {
  const data = new FormData(form),
    c = characters.find((c) => c.character_id === data.get("character"));
  if (!c) throw new Error("Choose a character.");
  const result = await post("/api/profile", {
    characterId: c.character_id,
    name: c.name,
    bio: data.get("bio"),
  });
  showProfile(result.profile);
  status.textContent = "Profile saved. You can now submit wiki suggestions.";
});
bind("screenshot-form", async (form) => {
  const file = new FormData(form).get("image") as File;
  if (
    !file ||
    !["image/png", "image/jpeg"].includes(file.type) ||
    file.size > 10 * 1024 * 1024
  )
    throw new Error("Choose a PNG or JPEG up to 10 MB.");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", 0.75),
  );
  if (!blob || blob.size > 256 * 1024)
    throw new Error(
      "This screenshot is still too large. Crop it or choose a smaller image.",
    );
  const result = await api("/api/profile/screenshot", {
    method: "POST",
    body: blob,
  });
  showProfile(result.profile);
  status.textContent = "Screenshot uploaded.";
  form.reset();
});
el("remove-screenshot").addEventListener("click", async () => {
  try {
    showProfile(
      (await api("/api/profile/screenshot", { method: "DELETE" })).profile,
    );
    status.textContent = "Screenshot removed.";
  } catch (e) {
    status.textContent = (e as Error).message;
  }
});
bind("contribution-form", async (form) => {
  const data = new FormData(form);
  await post("/api/contributions", Object.fromEntries(data));
  form.reset();
  status.textContent =
    "Suggestion submitted for review. It is not published yet.";
  await submissions();
});
el("logout").addEventListener("click", async () => {
  try {
    await post("/api/auth/logout", {});
    location.reload();
  } catch (e) {
    status.textContent = (e as Error).message;
  }
});
async function reviewQueue() {
  const target = el("review-queue");
  target.replaceChildren();
  const { contributions } = await api("/api/moderation");
  if (!contributions.length) target.textContent = "No pending submissions.";
  for (const c of contributions) {
    const card = document.createElement("article"),
      heading = document.createElement("h3");
    heading.textContent = `${c.page_slug} (${c.character_name})`;
    card.append(heading);
    for (const value of [c.suggestion, c.sources]) {
      const p = document.createElement("p");
      p.style.whiteSpace = "pre-wrap";
      p.textContent = value;
      card.append(p);
    }
    for (const decision of ["reviewed", "rejected"]) {
      const button = document.createElement("button");
      button.textContent = `Mark ${decision}`;
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          await post("/api/moderation", { id: c.id, status: decision });
          await reviewQueue();
        } catch (e) {
          status.textContent = (e as Error).message;
          button.disabled = false;
        }
      });
      card.append(button);
    }
    target.append(card);
  }
}
async function start() {
  try {
    const availability = await api("/api/status");
    if (!availability.login) {
      status.textContent =
        "Player accounts are awaiting activation. Wiki guides remain available.";
      return;
    }
    try {
      const me = await api("/api/me");
      el("signed-in").hidden = false;
      el("display-name").textContent = me.name;
      showProfile(me.profile);
      status.textContent = availability.census
        ? "Welcome. Find your character below."
        : "Signed in. Census matching is awaiting activation.";
      await submissions();
      if (me.moderator) {
        el("moderation").hidden = false;
        await reviewQueue();
      }
    } catch (e) {
      if (
        (e as Error).message.includes("Sign in") ||
        (e as Error).message.includes("session")
      ) {
        el("signed-out").hidden = false;
        status.textContent = new URLSearchParams(location.search).has("login")
          ? "Sign-in was cancelled. You can try again."
          : "Sign in to get started.";
      } else throw e;
    }
    const page = new URLSearchParams(location.search).get("page");
    if (page)
      (
        el<HTMLFormElement>("contribution-form").elements.namedItem(
          "page",
        ) as HTMLInputElement
      ).value = page.slice(0, 120);
  } catch (e) {
    status.textContent = (e as Error).message;
  }
}
start();
