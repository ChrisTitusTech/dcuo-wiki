import { test, expect } from "@playwright/test";
test("search, filters, quest sources and mobile layout", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".card")).toHaveCount(4);
  await page.getByRole("searchbox").fill("terminal");
  await expect(page.locator(".card:visible")).toHaveCount(1);
  await page.getByRole("searchbox").fill("no matching entry");
  await expect(page.locator("#empty")).toBeVisible();
  await page.getByRole("searchbox").fill("");
  await page.getByRole("button", { name: "Quests", exact: true }).click();
  await expect(page.locator(".card:visible")).toHaveCount(1);
  await page.locator(".card:visible").click();
  await expect(
    page.getByRole("heading", { name: "Grab and Smash", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /source map screenshot/ }),
  ).toHaveCount(5);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: "test-results/quest-mobile.png",
    fullPage: true,
  });
  await page.goto("/");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "test-results/home-desktop.png",
    fullPage: true,
  });
});
