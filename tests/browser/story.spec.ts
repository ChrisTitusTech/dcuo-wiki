import { test, expect } from "@playwright/test";
import story from "../../src/data/story.json" with { type: "json" };
test("Story tab covers original branches, Episodes and chapters with shareable search", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("navigation", { name: "Content navigation", exact: true })
    .getByRole("link", { name: "Story", exact: true })
    .click();
  await expect(page).toHaveURL(/\/story\//);
  const sitemap = await page.request.get("/sitemap.xml");
  expect(await sitemap.text()).toContain("https://dcuo-wiki.com/story/");
  await expect(page.locator(".story-card")).toHaveCount(story.entries.length);
  await expect(page.locator("#mentors .story-card")).toHaveCount(6);
  await expect(page.locator("#episodes .story-card")).toHaveCount(49);
  await expect(page.locator("#children-of-krypton .story-card")).toHaveCount(2);
  await page
    .getByRole("combobox", { name: "Era", exact: true })
    .selectOption("chapter");
  await expect(page.locator(".story-row:visible")).toHaveCount(6);
  await page
    .getByRole("searchbox", { name: "Find a story", exact: true })
    .fill("Wrath of the Worldkillers");
  await expect(page.locator(".story-row:visible")).toHaveCount(1);
  await page.reload();
  await expect(
    page.getByRole("combobox", { name: "Era", exact: true }),
  ).toHaveValue("chapter");
  await expect(page.locator(".story-row:visible")).toHaveCount(1);
  await page.locator(".story-card:visible").click();
  await expect(page.locator("#article-body")).toContainText("Worldkillers");
  await expect(
    page.getByRole("link", { name: "Edit this page", exact: true }),
  ).toBeVisible();
  await page.goto("/story/?q=no-story-matches-this-text");
  await expect(page.locator("#story-empty")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/story/");
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
});
test("the whole Story catalog remains accessible without JavaScript", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/story/");
  await expect(page.locator(".story-card")).toHaveCount(story.entries.length);
  await expect(
    page.getByRole("heading", { name: "Children of Krypton", exact: true }),
  ).toBeVisible();
  await context.close();
});

test("Episode 1 separates faction mission paths in source order", async ({
  page,
}) => {
  await page.goto("/wiki/Story_episode_1/");
  const body = page.locator("#article-body");
  await expect(
    body.getByRole("heading", {
      name: "Story Missions - For Heroes",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    body.getByRole("heading", {
      name: "Story Missions - For Villains",
      exact: true,
    }),
  ).toBeVisible();
  const text = await body.innerText();
  expect(text.indexOf("Emergency at Ferris Aircraft")).toBeLessThan(
    text.indexOf("Opportunity at Ferris Aircraft"),
  );
  expect(text).not.toMatch(/Edit section:|#####/);
});
