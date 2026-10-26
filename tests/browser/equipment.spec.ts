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
type Gear = {
  itemId: string;
  name: string;
  href?: string;
  notes?: string;
  identified?: boolean;
  slot: string;
  quantity: number | null;
  durability: number | null;
  augments: {
    itemId: string;
    name: string;
    href?: string;
    notes?: string;
    identified?: boolean;
  }[];
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
  ] as Gear[],
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
  await page.locator("#equipment-list summary").click();
  await expect(
    page.getByRole("heading", { name: "Equipment Hero" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Digital Invader Helm" }),
  ).toHaveAttribute("href", "/wiki/Digital_Invader_Helm/");
  await expect(
    page
      .locator("#equipment-items")
      .getByText("Census item 999", { exact: true }),
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
  await page.locator("#equipment-list summary").click();
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
  await page.locator("#equipment-list summary").click();
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
  await page.locator("#equipment-list summary").click();
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
  await page.locator("#equipment-list summary").click();
  await expect(
    page
      .locator("#equipment-items")
      .getByText("Source-named artifact", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Census ID 1234", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Source-named artifact" }),
  ).toHaveCount(0);
});

test("verified augment details render safely beside the matching augment", async ({
  page,
}) => {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const data = structuredClone(snapshot);
    data.items[1].augments = [
      {
        itemId: "88",
        name: "Verified augment",
        notes: "Rank 10 variant: +123 defense. <script>unsafe()</script>",
      } as (typeof data.items)[1]["augments"][number],
    ];
    await route.fulfill({
      json: path.endsWith("/equipment")
        ? data
        : path === `/api/profiles/${id}`
          ? profile
          : {},
      status: path === "/api/me" ? 401 : 200,
    });
  });
  await page.goto(`/player/?id=${id}`);
  await page.locator("#equipment-list summary").click();
  await expect(page.locator("#equipment-items")).toContainText(
    "Rank 10 variant: +123 defense. <script>unsafe()</script>",
  );
  await expect(page.locator("#equipment-items script")).toHaveCount(0);
});

test("character sheet selects numbered slots, preserves focus and shows verified artwork safely", async ({
  page,
}) => {
  const data = structuredClone(snapshot);
  Object.assign(data.items[1], { identified: false });
  for (const slot of [
    0, 1, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 17, 18, 19, 20, 21, 22, 23, 24, 25,
    26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 37, 38,
  ])
    data.items.push({
      itemId: String(999000000 + slot),
      name: `Census item ${999000000 + slot}`,
      slot: String(slot),
      quantity: 1,
      durability: null,
      augments: [],
    });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({
      json: path.endsWith("/equipment")
        ? data
        : path === `/api/profiles/${id}`
          ? profile
          : {},
      status: path === "/api/me" ? 401 : 200,
    });
  });
  data.items.sort((a, b) => Number(a.slot) - Number(b.slot));
  await page.route("**/equipment-art.json", (route) =>
    route.fulfill({
      json: { Digital_Invader_Helm: "/api/catalog-media/" + "a".repeat(64) },
    }),
  );
  await page.route("**/api/catalog-media/**", (route) =>
    route.fulfill({
      contentType: "image/png",
      body: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
        "base64",
      ),
    }),
  );
  await page.goto(`/player/?id=${id}`);
  await expect(page.locator("#equipment-sheet")).toBeVisible();
  await expect(page.locator("#equipment-character-name")).toHaveText(
    "Equipment Hero",
  );
  await expect(page.locator("#equipment-table")).toBeHidden();
  const slot = page.getByRole("button", {
    name: "Slot 14: Digital Invader Helm",
    exact: true,
  });
  await expect(slot.locator("img")).toHaveAttribute(
    "src",
    "/api/catalog-media/" + "a".repeat(64),
  );
  await slot.click();
  const detail = page.getByRole("region", { name: "Selected equipment" });
  await expect(detail).toBeVisible();
  await expect(
    detail.getByRole("link", { name: "Digital Invader Helm" }),
  ).toHaveAttribute("href", "/wiki/Digital_Invader_Helm/");
  await slot.press("Escape");
  await expect(detail).toBeHidden();
  await expect(slot).toBeFocused();
  await page
    .getByRole("button", { name: "Slot 15: Census item 999", exact: true })
    .click();
  await expect(
    detail.getByRole("link", { name: "Identify this item", exact: true }),
  ).toHaveAttribute("href", "/equipment-identification/?item=999");
  await page.getByRole("button", { name: "Close item details" }).click();
  await expect(detail).toBeHidden();
  await page.screenshot({
    path: "test-results/character-sheet-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Slot 15: Census item 999", exact: true })
    .click();
  await expect(detail).toBeVisible();
  await page.screenshot({
    path: "test-results/character-sheet-mobile.png",
    fullPage: true,
  });
});

test("the character portrait stays visible when Census equipment has never synced", async ({
  page,
}) => {
  const photo = { ...profile, screenshot: `/api/profiles/${id}/screenshot` };
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/screenshot"))
      return route.fulfill({
        contentType: "image/png",
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
          "base64",
        ),
      });
    await route.fulfill({
      json: path.endsWith("/equipment")
        ? { ...snapshot, items: null, syncedAt: null, unavailable: true }
        : path === `/api/profiles/${id}`
          ? photo
          : {},
      status: path === "/api/me" ? 401 : 200,
    });
  });
  await page.goto(`/player/?id=${id}`);
  await expect(page.locator("#player-screenshot")).toBeVisible();
  await expect(page.locator("#equipment-status")).toContainText(
    "temporarily unavailable",
  );
  await expect(page.locator(".equipment-slot")).toHaveCount(0);
});

test("captured icons and details take precedence while source rank bonuses stay labelled", async ({
  page,
}) => {
  const native = "/api/item-icons/" + "b".repeat(64);
  const source = "/api/catalog-media/" + "c".repeat(64);
  await page.route("**/equipment-details.json", (route) =>
    route.fulfill({
      json: {
        Digital_Invader_Helm: {
          description: "Source description",
          source:
            "https://dcuniverseonline.fandom.com/wiki/Digital_Invader_Helm",
          icon: source,
          sections: [
            {
              heading: "Rank bonuses",
              table: {
                columns: ["Rank", "Source-listed bonus"],
                rows: [["80", "+1% Health"]],
              },
            },
          ],
        },
      },
    }),
  );
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (
      path.startsWith("/api/item-icons/") ||
      path.startsWith("/api/catalog-media/")
    )
      return route.fulfill({
        contentType: "image/png",
        body: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
          "base64",
        ),
      });
    await route.fulfill({
      json: path.endsWith("/equipment")
        ? {
            ...snapshot,
            items: [
              {
                ...snapshot.items[0],
                icon: native,
                details: {
                  description: "Captured description",
                  style: "Invader",
                  requiredLevel: 30,
                },
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
  const slot = page.getByRole("button", {
    name: "Slot 14: Digital Invader Helm",
    exact: true,
  });
  await expect(slot.locator(".equipment-slot-name")).toHaveText(
    "Digital Invader Helm",
  );
  await expect(slot.locator("img")).toHaveAttribute("src", native);
  // The component stylesheet must win over the base button dimensions/padding.
  const separated = () =>
    slot.evaluate((button) => {
      const image = button.querySelector("img")!.getBoundingClientRect();
      const label = button
        .querySelector(".equipment-slot-name")!
        .getBoundingClientRect();
      return label.left >= image.right || label.top >= image.bottom;
    });
  await expect.poll(separated).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(separated).toBe(true);
  await page.setViewportSize({ width: 1280, height: 720 });
  await slot.click();
  const detail = page.getByRole("region", { name: "Selected equipment" });
  await expect(detail).toContainText("Captured description");
  await expect(detail).toContainText("Required level");
  await expect(detail).toContainText("Invader");
  await expect(detail).toContainText("Source-listed item details");
  await expect(
    detail.getByRole("cell", { name: "+1% Health", exact: true }),
  ).toBeVisible();
  await expect(detail).toContainText(
    "not this character's current scaled stats",
  );
});

test("captured equipped values remain specific to the selected slot", async ({
  page,
}) => {
  const capturedAt = 1700000000;
  await page.route("**/equipment-details.json", (route) =>
    route.fulfill({
      json: {
        Digital_Invader_Helm: {
          description: "Definition only",
          sections: [
            {
              heading: "Rank bonuses",
              table: {
                columns: ["Rank", "Source-listed bonus"],
                rows: [["80", "+1% Health"]],
              },
            },
          ],
        },
      },
    }),
  );
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({
      json: path.endsWith("/equipment")
        ? {
            ...snapshot,
            items: [
              {
                ...snapshot.items[0],
                slot: "14",
                details: { requiredLevel: 0, requiredCombatRating: 0 },
                equipped: {
                  itemLevel: 391,
                  effects: ["First equipped effect"],
                  stats: [{ name: "Might", value: 1234 }],
                  capturedAt,
                },
              },
              {
                ...snapshot.items[0],
                slot: "15",
                details: { requiredLevel: 30, requiredCombatRating: 100 },
                equipped: {
                  itemLevel: 402,
                  effects: ["Second equipped effect"],
                  capturedAt: capturedAt + 60,
                },
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
  await page
    .getByRole("button", { name: "Slot 14: Digital Invader Helm", exact: true })
    .click();
  const detail = page.getByRole("region", { name: "Selected equipment" });
  const values = detail.locator(".equipment-captured-values");
  await expect(values).toContainText("Captured equipped values");
  await expect(values).toContainText("391");
  await expect(values).toContainText("Might");
  await expect(values).toContainText("1234");
  await expect(values).toContainText("First equipped effect");
  await expect(values.locator("time")).toHaveAttribute(
    "datetime",
    new Date(capturedAt * 1000).toISOString(),
  );
  await expect(values).not.toContainText("+1% Health");
  await expect(detail).not.toContainText("Required level");
  await expect(detail).not.toContainText("Required combat rating");
  await page
    .getByRole("button", { name: "Slot 15: Digital Invader Helm", exact: true })
    .click();
  await expect(values).toContainText("402");
  await expect(values).toContainText("Second equipped effect");
  await expect(values).not.toContainText("391");
  await expect(values).not.toContainText("1234");
  await expect(values).not.toContainText("Might");
  await expect(detail).toContainText("Required level");
  await expect(detail).toContainText("Required combat rating");
});
