type LinkedProfile = { id: string; character: { name: string } };
let revision = 0;
export function showPlayerNavigation(
  profile: LinkedProfile | null,
  name: string,
) {
  revision++;
  const link = document.querySelector<HTMLAnchorElement>("#player-navigation");
  const status = document.querySelector<HTMLElement>("#player-sign-in-state");
  if (!link || !status) return;
  link.textContent = profile?.character.name || name || "Your account";
  link.href = profile
    ? `/player/?id=${encodeURIComponent(profile.id)}`
    : "/account/";
  status.textContent = "Signed in";
  status.hidden = false;
}
export async function loadPlayerNavigation() {
  const initialRevision = revision;
  try {
    const response = await fetch("/api/me", {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!response.ok) return;
    const me = await response.json();
    if (revision === initialRevision) showPlayerNavigation(me.profile, me.name);
  } catch {
    // Leave the account link usable if the session service is unavailable.
  }
}
