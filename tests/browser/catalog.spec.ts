import { test, expect } from "@playwright/test";
test("published title and summary corrections update imported reference search", async ({
  page,
}) => {
  await page.route("**/api/catalog-corrections", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        corrections: [
          {
            slug: "Zod_Emblem",
            part: "document",
            title: "Zod Emblem corrected",
            summary: "Community correction search phrase",
          },
        ],
      }),
    }),
  );
  await page.goto("/guides/?q=Community%20correction%20search%20phrase");
  await expect(page.locator("#library")).toHaveAttribute(
    "data-catalog-ready",
    "true",
  );
  const card = page.locator('.card[href="/wiki/Zod_Emblem/"]');
  await expect(card).toBeVisible();
  await expect(card.getByRole("heading")).toHaveText("Zod Emblem corrected");
});
test("new categorized references are searchable and have working inline galleries", async ({
  page,
  context,
}) => {
  await page.route("https://dcuo-wiki.com/api/catalog-media/**", (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#183755"/></svg>',
    }),
  );
  await page.goto("/guides/?category=Equipment&q=Zod%20Emblem");
  await expect(page.locator("#library")).toHaveAttribute(
    "data-catalog-ready",
    "true",
  );
  const card = page.locator('.card[href="/wiki/Zod_Emblem/"]');
  await expect(card).toBeVisible();
  await card.click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Zod Emblem",
  );
  await expect(page.locator(".article-tools .badge")).toContainText(
    "Source imported",
  );
  const first = page.locator(".map-gallery a[data-image-viewer]").first();
  await expect(first).toBeVisible();
  await first.click();
  await expect(
    page.getByRole("dialog", { name: "Image viewer" }),
  ).toBeVisible();
  expect(context.pages()).toHaveLength(1);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("dialog", { name: "Image viewer" }),
  ).not.toBeVisible();
});

test("signing in from an imported article retains the return-to-edit link", async ({
  page,
}) => {
  await page.goto("/account/?page=Zod%20Emblem");
  const link = page.getByRole("link", { name: "Return to edit Zod Emblem" });
  await expect(link).toHaveAttribute(
    "href",
    "/wiki/Zod_Emblem/#article-editor",
  );
  await expect(page.locator("#signed-out a")).toHaveAttribute(
    "href",
    "/api/auth/discord?page=Zod%20Emblem",
  );
});
