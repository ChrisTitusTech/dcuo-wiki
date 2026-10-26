import { test, expect } from "@playwright/test";
import articles from "../../src/data/articles.json" with { type: "json" };
import catalog from "../../src/data/catalog-index.json" with { type: "json" };
const headers = {
  Cookie: `__Host-dcuo-session=${"a".repeat(64)}`,
  Origin: "http://127.0.0.1:8787",
};
test("D1 session and screenshot round trip, with Census unconfigured and submissions locked", async ({
  request,
}) => {
  const me = await request.get("/api/me", { headers });
  expect(me.status()).toBe(200);
  expect((await me.json()).name).toBe("Local fixture");
  expect(
    (
      await request.post("/api/contributions", {
        headers,
        data: { page: "test" },
      })
    ).status(),
  ).toBe(400);
  const body = {
    page: "test",
    suggestion: "A contribution that cannot be accepted without Census.",
    sources: "In-game evidence",
  };
  expect(
    (
      await request.post("/api/contributions", { headers, data: body })
    ).status(),
  ).toBe(503);
  expect(
    (
      await request.post("/api/contributions", {
        headers: { Origin: headers.Origin },
        data: body,
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.post("/api/contributions", {
        headers: { ...headers, Origin: "https://evil.example" },
        data: body,
      })
    ).status(),
  ).toBe(403);
  const image = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    "base64",
  );
  expect(
    (
      await request.post("/api/profile/screenshot", {
        headers: { ...headers, "Content-Type": "image/png" },
        data: image,
      })
    ).status(),
  ).toBe(200);
  const screenshot = await request.get(
    "/api/profiles/11111111-1111-4111-8111-111111111111/screenshot",
  );
  expect(screenshot.status()).toBe(200);
  expect(await screenshot.body()).toEqual(image);
  expect(
    (await request.delete("/api/profile/screenshot", { headers })).status(),
  ).toBe(200);
});
test("account page exposes Discord sign in and public profiles use text rendering", async ({
  page,
}) => {
  await page.goto("/account/");
  await expect(page.locator("#player-navigation")).toHaveText("Player profile / Sign in");
  await expect(
    page.getByRole("link", { name: "Sign in with Discord", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Submit for review" }),
  ).toBeHidden();
  await page.goto("/player/?id=11111111-1111-4111-8111-111111111111");
  await expect(
    page.getByRole("heading", { name: "Local fixture" }),
  ).toBeVisible();
  await expect(
    page.getByText("Ownership is not verified.", { exact: false }),
  ).toBeVisible();
});

test("account form saves a selected Census character and queues a suggestion", async ({
  page,
}) => {
  const character = {
    character_id: "123",
    name: "Test Hero",
    world_id: "2",
    level: "30",
    combat_rating: "100",
    skill_points: "90",
  };
  const profile = {
    id: "11111111-1111-4111-8111-111111111111",
    character,
    bio: "",
    screenshot: null,
  };
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown;
    if (path === "/api/status") body = { login: true, census: true };
    else if (path === "/api/me")
      body = { name: "Player", profile: null, moderator: false };
    else if (path === `/api/profiles/${profile.id}/equipment`)
      body = { characterId: "123", worldId: "2", items: [], syncedAt: 1700000000, stale: false, unavailable: false, refreshing: false, refreshAfter: 0 };
    else if (path === "/api/characters") body = { characters: [character] };
    else if (path === "/api/profile") {
      expect(route.request().postDataJSON().characterId).toBe("123");
      body = { profile };
    } else if (path === "/api/contributions")
      body =
        route.request().method() === "POST"
          ? { id: "queued", status: "pending" }
          : { contributions: [] };
    else throw new Error(`Unexpected route ${path}`);
    await route.fulfill({ json: body });
  });
  await page.goto("/account/");
  await expect(
    page.getByRole("button", { name: "Submit for review" }),
  ).toBeHidden();
  await expect(page.locator("#player-sign-in-state")).toHaveText("Signed in");
  await expect(page.locator("#player-navigation")).toHaveText("Player");
  await expect(page.locator("#player-navigation")).toHaveAttribute("href", "/account/");
  await page.getByLabel("Exact character name").fill("Test Hero");
  await page
    .getByRole("button", { name: "Search Census", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save player profile", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Submit for review" }),
  ).toBeVisible();
  await expect(page.locator("#player-navigation")).toHaveText("Test Hero");
  await expect(page.locator("#player-navigation")).toHaveAttribute("href", `/player/?id=${profile.id}`);
  await page.getByLabel("Wiki page title").fill("A quest");
  await page
    .getByLabel("Your addition or correction")
    .fill("A useful correction with sufficient details and context.");
  await page
    .getByLabel("Sources or in-game evidence")
    .fill("A map location and quest evidence");
  await page.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.locator("#account-status")).toContainText(
    "Suggestion submitted for review",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/player-profile-mobile.png",
    fullPage: true,
  });
});

test("signed-in character navigation opens their profile and uploaded image", async ({ page, request }) => {
  const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
  const upload = await request.post('/api/profile/screenshot', { headers: { ...headers, 'Content-Type': 'image/png' }, data: image });
  expect(upload.status()).toBe(200);
  await page.route('**/api/me', async route => {
    const response = await request.get('/api/me', { headers });
    await route.fulfill({ response });
  });
  try {
    await page.goto('/wiki/Powers/');
    await expect(page.locator('#player-sign-in-state')).toHaveText('Signed in');
    await expect(page.locator('#player-navigation')).toHaveText('Local fixture');
    await page.locator('#player-navigation').click();
    await expect(page).toHaveURL(/\/player\/\?id=11111111-1111-4111-8111-111111111111$/);
    await expect(page.locator('#player-name')).toHaveText('Local fixture');
    await expect(page.locator('#player-screenshot')).toBeVisible();
    await expect.poll(() => page.locator('#player-screenshot').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    await page.setViewportSize({width:390,height:844});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({path:'test-results/signed-in-player.png', fullPage:true});
  } finally {
    await request.delete('/api/profile/screenshot', { headers });
  }
});

test("account editor return links use only the lightweight title index", async ({
  page,
}) => {
  await page.goto("/account/?page=Sea%20Change");
  await expect(
    page.getByRole("link", { name: "Return to edit Sea Change", exact: true }),
  ).toHaveAttribute("href", "/wiki/Sea_Change/#article-editor");
  const index = JSON.parse(
    (await page.locator("#account-article-index").textContent()) || "[]",
  );
  expect(index).toHaveLength(articles.length + catalog.length);
  for (const entry of index)
    expect(Object.keys(entry).sort()).toEqual(["slug", "title"]);
  const scripts = await page
    .locator("script[src]")
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("src")!),
    );
  let size = 0;
  for (const script of scripts) {
    const response = await page.request.get(script);
    expect(response.ok()).toBe(true);
    size += (await response.body()).byteLength;
  }
  expect(size).toBeLessThan(100 * 1024);
});

test("equipment endpoint uses D1 and retains a cached loadout while Census is unconfigured", async ({
  request,
}) => {
  const id = "33333333-3333-4333-8333-333333333333";
  const result = await request.get(`/api/profiles/${id}/equipment`);
  expect(result.status()).toBe(200);
  const data = await result.json();
  expect(data.characterId).toBe("987654321");
  expect(data.unavailable).toBe(true);
  expect(data.items[0].href).toBe("/wiki/Digital_Invader_Helm/");
  expect(data.syncedAt).toBe(1700000000);
  expect(data.items[1].href).toBe("/wiki/Soder_Cola_Extreme/");
  expect(
    (
      await request.post("/api/profile/equipment/refresh", {
        headers: { Origin: headers.Origin },
        data: {},
      })
    ).status(),
  ).toBe(401);
  expect(
    (
      await request.post("/api/profile/equipment/refresh", {
        headers,
        data: { characterId: "987654321" },
      })
    ).status(),
  ).toBe(400);
});
