import { test, expect } from "@playwright/test";
const id = "11111111-1111-4111-8111-111111111111";
const profile = {
  id,
  character: {
    character_id: "123",
    world_id: "2",
    name: "Equipment Hero",
    level: "30",
    combat_rating: "100",
    skill_points: "90",
  },
  bio: "Equipment test",
  matchedAt: 1,
  screenshot: null,
};
const snapshot = {
  characterId: "123",
  worldId: "2",
  syncedAt: 1700000000,
  stale: false,
  unavailable: false,
  refreshing: false,
  refreshAfter: 0,
  items: [
    {
      itemId: "2548220",
      name: "Digital Invader Helm",
      href: "/wiki/Digital_Invader_Helm/",
      slot: "14",
      quantity: 1,
      durability: null,
      augments: [],
    },
    {
      itemId: "999",
      name: "Census item 999",
      slot: "15",
      quantity: null,
      durability: 80,
      augments: [{ itemId: "88", name: "Census item 88" }],
    },
  ],
};
test("public equipment shows local wiki links, unknown IDs and read-only slots on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({
      json: path.endsWith("/equipment")
        ? snapshot
        : path === `/api/profiles/${id}`
          ? profile
          : {},
      status: path === "/api/me" ? 401 : 200,
    });
  });
  await page.goto(`/player/?id=${id}`);
  await expect(
    page.getByRole("heading", { name: "Equipment Hero" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Digital Invader Helm" }),
  ).toHaveAttribute("href", "/wiki/Digital_Invader_Helm/");
  await expect(
    page.getByText("Census item 999", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Durability: 80")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Refresh equipment" }),
  ).toBeHidden();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("owner refresh retains the last successful loadout on a Census outage", async ({
  page,
}) => {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({
      json:
        path === "/api/me"
          ? { profile }
          : path.endsWith("/refresh")
            ? {
                ...snapshot,
                unavailable: true,
                stale: true,
                refreshAfter: Math.floor(Date.now() / 1000) + 300,
              }
            : path.endsWith("/equipment")
              ? snapshot
              : profile,
    });
  });
  await page.goto(`/player/?id=${id}`);
  const button = page.getByRole("button", { name: "Refresh equipment" });
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.locator("#equipment-status")).toContainText(
    "temporarily unavailable",
  );
  await expect(
    page.getByRole("link", { name: "Digital Invader Helm" }),
  ).toBeVisible();
  await expect(page.locator("#equipment-time")).toContainText(
    "Last synced from Census:",
  );
  await expect(button).toBeDisabled();
});
test("profile changes reject mismatched equipment and other players cannot refresh", async ({
  page,
}) => {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({
      json:
        path === "/api/me"
          ? {
              profile: {
                ...profile,
                id: "22222222-2222-4222-8222-222222222222",
              },
            }
          : path.endsWith("/equipment")
            ? { ...snapshot, characterId: "456" }
            : profile,
    });
  });
  await page.goto(`/player/?id=${id}`);
  await expect(page.locator("#equipment-status")).toContainText(
    "linked character changed",
  );
  await expect(page.locator("#equipment-table")).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Refresh equipment" }),
  ).toBeHidden();
});

test("restoring a cached page resumes equipment loading and refresh availability", async ({
  page,
}) => {
  let restored = false,
    equipmentReads = 0;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/equipment")) equipmentReads++;
    await route.fulfill({
      json:
        path === "/api/me"
          ? { profile }
          : path.endsWith("/equipment")
            ? {
                ...snapshot,
                refreshAfter: restored
                  ? 0
                  : Math.floor(Date.now() / 1000) + 300,
              }
            : profile,
    });
  });
  await page.goto(`/player/?id=${id}`);
  const button = page.getByRole("button", { name: "Refresh equipment" });
  await expect(button).toBeVisible();
  await expect(button).toBeDisabled();
  await page.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent("pagehide", { persisted: true }),
    ),
  );
  restored = true;
  await page.evaluate(() =>
    window.dispatchEvent(
      new PageTransitionEvent("pageshow", { persisted: true }),
    ),
  );
  await expect(button).toBeEnabled();
  expect(equipmentReads).toBe(2);
  await expect(
    page.getByRole("link", { name: "Digital Invader Helm" }),
  ).toBeVisible();
});

test("source-named items without a local article retain their ID and do not create broken links", async ({
  page,
}) => {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({
      json: path.endsWith("/equipment")
        ? {
            ...snapshot,
            items: [
              {
                itemId: "1234",
                name: "Source-named artifact",
                slot: "22",
                quantity: 1,
                durability: null,
                augments: [],
              },
            ],
          }
        : path === `/api/profiles/${id}`
          ? profile
          : {},
      status: path === "/api/me" ? 401 : 200,
    });
  });
  await page.goto(`/player/?id=${id}`);
  await expect(
    page.getByText("Source-named artifact", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Census ID 1234", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Source-named artifact" }),
  ).toHaveCount(0);
});
