import { test, expect } from "@playwright/test";
import articles from "../../src/data/articles.json" with { type: "json" };
import { releaseIdsFor } from "../../shared/releases.mjs";
test("guides hub combines release, category and search; shareable filters reset pagination", async ({
  page,
}) => {
  await page.goto("/guides/");
  await expect(
    page.getByRole("heading", { name: "Guides & missions", exact: true }),
  ).toBeVisible();
  await page.locator("#next-guides").click();
  await expect(page.locator("#guide-page")).toHaveText("Page 2 of 22");
  await page.getByLabel("Episode / DLC / chapter").selectOption("episode-1");
  const expected = articles.filter((a) =>
    releaseIdsFor(a.slug).includes("episode-1"),
  );
  await expect(page.locator(".card:visible")).toHaveCount(expected.length);
  await expect(page.locator(".library-pagination")).toBeHidden();
  await page.getByRole("button", { name: "Quests", exact: true }).click();
  await page.getByRole("searchbox").fill("Alert T1: Oan Sciencells (Heroes)");
  await expect(page.locator(".card:visible")).toHaveCount(1);
  await expect(page).toHaveURL(/release=episode-1/);
  await page.reload();
  await expect(page.getByLabel("Episode / DLC / chapter")).toHaveValue(
    "episode-1",
  );
  await expect(page.getByRole("searchbox")).toHaveValue(
    "Alert T1: Oan Sciencells (Heroes)",
  );
  await expect(page.locator(".card:visible")).toHaveCount(1);
  await page.getByRole("button", { name: "Character", exact: true }).click();
  await expect(page.locator("#empty")).toBeVisible();
  await page.getByRole("link", { name: /^All guides/ }).click();
  await expect(page.getByRole("searchbox")).toHaveValue("");
  await expect(page.getByLabel("Episode / DLC / chapter")).toHaveValue("");
});
test("release catalog and arc chapters connect to missions without empty release pages", async ({
  page,
  request,
}) => {
  await page.goto("/releases/");
  await page
    .getByRole("link", { name: "Episode 1: Fight for the Light", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Episode 1: Fight for the Light",
  );
  await expect(page.locator(".card:visible")).toHaveCount(7);
  await page
    .getByRole("link", { name: /Alert T1: Oan Sciencells.*Heroes/ })
    .click();
  await expect(
    page.getByRole("navigation", { name: "Content release" }).getByRole("link"),
  ).toHaveAttribute("href", "/releases/episode-1/");
  await page.goto("/guides/?release=light-and-rain-chapter-3");
  await expect(page.locator(".card:visible")).toHaveCount(6);
  await page.locator(".card:visible").first().click();
  await page
    .getByRole("navigation", { name: "Content release" })
    .getByRole("link")
    .click();
  await page
    .getByRole("navigation", { name: "Breadcrumb" })
    .getByRole("link", { name: "Light and Rain", exact: true })
    .click();
  await expect(page.locator(".card:visible")).toHaveCount(17);
  await expect(
    page
      .getByRole("navigation", { name: "Story arc chapters" })
      .getByRole("link"),
  ).toHaveCount(4);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/guides/?release=light-and-rain-chapter-3");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/release-guides-mobile.png",
    fullPage: true,
  });
  const missing = await request.get("/releases/children-of-krypton-chapter-2/");
  expect(missing.status()).toBe(404);
});
