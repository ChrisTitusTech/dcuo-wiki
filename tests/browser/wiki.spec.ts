import { test, expect } from "@playwright/test";
test("search, filters, quest sources and mobile layout", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".card")).toHaveCount(12);
  await page.getByRole("searchbox").fill("corridor leading to the exit");
  await expect(page.locator(".card:visible")).toHaveCount(1);
  await page.getByRole("button", { name: "Quests", exact: true }).click();
  await page.getByRole("link", { name: "All guides" }).click();
  await expect(page.locator(".card:visible")).toHaveCount(12);
  await expect(page.getByRole("searchbox")).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "All", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
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

test("mastery table remains usable on mobile and searchable", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("searchbox").fill("Shuriken Storm");
  await expect(page.locator(".card:visible")).toHaveCount(1);
  await page.getByRole("link", { name: /Weapon Mastery/ }).click();
  await expect(page.getByRole("row")).toHaveCount(12);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await expect(
    page.getByRole("cell", { name: "Bow", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/mastery-mobile.png",
    fullPage: true,
  });
});

test("global search, category navigation, and mobile menu", async ({
  page,
}) => {
  await page.goto("/wiki/Powers/");
  await page.getByRole("searchbox").fill("Shuriken Storm");
  await page.getByRole("button", { name: "Search wiki", exact: true }).click();
  await expect(page.locator(".card:visible")).toHaveCount(1);
  await expect(page.locator(".card:visible")).toContainText("Weapon Mastery");
  await page
    .getByRole("navigation", { name: "Categories", exact: true })
    .getByRole("link", { name: "Quests" })
    .click();
  await expect(page.locator(".card:visible")).toHaveCount(3);
  await page.getByRole("button", { name: "Switch color theme" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveClass("light");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".wiki-sidebar details")).not.toHaveAttribute(
    "open",
    "",
  );
  await page.locator(".wiki-sidebar summary").click();
  await expect(
    page.getByRole("navigation", { name: "Categories", exact: true }),
  ).toBeVisible();
  await page.locator(".wiki-sidebar summary").click();
  await page.goto("/");
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.screenshot({
    path: "test-results/home-mobile-light.png",
    fullPage: true,
  });
});
