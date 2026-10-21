import { test, expect } from "@playwright/test";
test("search, filters, quest sources and mobile layout", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".card")).toHaveCount(8);
  await page.getByRole("searchbox").fill("corridor leading to the exit");
  await expect(page.locator(".card:visible")).toHaveCount(1);
  await page.getByRole("searchbox").fill("no matching entry");
  await expect(page.locator("#empty")).toBeVisible();
  await page.getByRole("searchbox").fill("");
  await page.getByRole("button", { name: "Quests", exact: true }).click();
  await expect(page.locator(".card:visible")).toHaveCount(3);
  await page.getByRole("link", { name: /Grab and Smash/ }).click();
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

test("location tables, video chapters, and related guides", async ({
  page,
}) => {
  await page.goto("/wiki/House_of_Venom/");
  await expect(
    page.getByRole("link", { name: "StressOutGamer: House of Venom" }),
  ).toHaveAttribute(
    "href",
    "https://www.youtube.com/watch?v=J2s4czUcY8Q&t=457s",
  );
  await expect(
    page.getByText("No quest-specific video verified", { exact: false }),
  ).toHaveCount(0);
  await page
    .getByRole("link", { name: "Viva la Lucha Libre", exact: true })
    .click();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByRole("row")).toHaveCount(7);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.screenshot({
    path: "test-results/investigation-mobile.png",
    fullPage: true,
  });
  await page.goto("/");
  await page.getByRole("searchbox").fill("Quetzalcoatl");
  await expect(page.locator(".card:visible")).toHaveCount(1);
  await page.getByRole("searchbox").fill("");
  await page.getByRole("button", { name: "Locations", exact: true }).click();
  await expect(page.locator(".card:visible")).toHaveCount(1);
});
