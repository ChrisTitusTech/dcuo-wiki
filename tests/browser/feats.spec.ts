import { test, expect } from "@playwright/test";
import catalog from "../../src/data/feats.json" with { type: "json" };
test("feats navigation, independent reward/difficulty filters, pagination and mobile", async ({
  page,
}) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Categories", exact: true });
  await expect(nav.getByRole("link", { name: /Progression/ })).toHaveCount(0);
  await nav.getByRole("link", { name: /^Feats/ }).click();
  await expect(page).toHaveURL(/\/feats\//);
  await expect(page.locator("#feat-status")).toContainText(
    `${catalog.feats.length.toLocaleString()} feats match`,
  );
  await expect(page.locator(".feat-result")).toHaveCount(
    Math.min(40, catalog.feats.length),
  );
  const firstName = [...catalog.feats].sort((a, b) =>
    a.title.localeCompare(b.title),
  )[0].title;
  await expect(page.locator(".feat-result h2").first()).toHaveText(firstName);
  await page
    .getByRole("combobox", { name: "Order", exact: true })
    .selectOption("points");
  await expect(page.locator(".feat-result .feat-points").first()).toHaveText(
    "100 feat points",
  );
  await page
    .getByRole("combobox", { name: "Order", exact: true })
    .selectOption("name");
  await expect(page.locator(".feat-result h2").first()).toHaveText(firstName);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator("#feat-page")).toHaveText(/Page 2/);
  const feat = catalog.feats.find((f) => f.points === 50)!;
  await page.getByLabel("Find a feat", { exact: true }).fill(feat.title);
  await page
    .getByRole("combobox", { name: "Feat points", exact: true })
    .selectOption("50");
  await page
    .getByRole("combobox", { name: "Estimated difficulty", exact: true })
    .selectOption(String(feat.difficulty.level));
  await expect(page.locator(".feat-result")).not.toHaveCount(0);
  await expect(page.locator(".feat-result .feat-points").first()).toHaveText(
    "50 feat points",
  );
  await expect(
    page.locator('.feat-result [role="meter"]').first(),
  ).toHaveAttribute("aria-valuenow", String(feat.difficulty.level));
  await page.reload();
  await expect(page.getByLabel("Find a feat", { exact: true })).toHaveValue(
    feat.title,
  );
  await expect(page.locator(".feat-result")).not.toHaveCount(0);
  await page.locator(".feat-plan-link").first().click();
  await expect(page.locator("#article-body")).toContainText(
    /Difficulty estimate:/,
  );
  await expect(
    page.locator('#article-body [role="meter"]').first(),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page.goto("/feats/");
  await expect(page.locator("#feat-status")).toContainText("feats match");
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
  await page
    .getByLabel("Find a feat", { exact: true })
    .fill("no-feat-matches-this-string");
  await expect(page.locator("#feat-status")).toContainText("No feats match");
});
test("all category guides remain linked without JavaScript", async ({
  browser,
}) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/feats/");
  await expect(
    page.getByRole("heading", {
      name: "All feat category guides",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".feat-category-grid a")).toHaveCount(
    catalog.groups.reduce((n, g) => n + g.guides.length, 0),
  );
  await context.close();
});

test("point-farming session survives reload and quick filter excludes prepared rewards", async ({
  page,
}) => {
  await page.goto("/feats/?sort=priority&quick=1");
  await expect(page.locator("#feat-status")).toContainText("feats match");
  await expect(page.locator(".feat-result")).not.toHaveCount(0);
  await expect(page.locator(".feat-result .feat-attempt").first()).toHaveText(
    "Quick objective",
  );
  await page.locator(".feat-select input").first().check();
  await expect(page.locator("#session-total")).toContainText("1 selected");
  await page.reload();
  await expect(page.locator("#session-total")).toContainText("1 selected");
  await page.locator(".feat-session summary").click();
  await expect(page.locator("#feat-session")).toContainText(
    "potential feat points",
  );
  await page
    .getByRole("button", { name: "Clear session", exact: true })
    .click();
  await expect(page.locator("#session-total")).toHaveText("No feats selected");
  await page.getByRole("link", { name: /Point-farming route:/ }).click();
  await expect(
    page.getByRole("heading", {
      name: "Build points with fewer wasted runs",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator('a[href*="we9yLQauGSA&t="]')).toHaveCount(5);
});

test("YouTube filter resets pagination, combines with rewards and survives shared URLs", async ({
  page,
}) => {
  const withVideos = catalog.feats.filter((f) => f.videos.length);
  await page.goto("/feats/");
  await expect(page.locator("#feat-status")).toContainText("feats match");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator("#feat-page")).toContainText("Page 2");
  await page
    .getByRole("checkbox", { name: "Has YouTube video", exact: true })
    .check();
  await expect(page.locator("#feat-status")).toHaveText(
    `${withVideos.length.toLocaleString()} feats match. Showing 1-40.`,
  );
  await expect(page.locator("#feat-page")).toContainText("Page 1");
  await expect(page.locator(".feat-result details")).toHaveCount(40);
  await expect(page).toHaveURL(/youtube=1/);
  await page.reload();
  await expect(
    page.getByRole("checkbox", { name: "Has YouTube video", exact: true }),
  ).toBeChecked();
  await expect(page.locator("#feat-status")).toContainText(
    `${withVideos.length.toLocaleString()} feats match`,
  );
  await page
    .getByRole("combobox", { name: "Feat points", exact: true })
    .selectOption("50");
  const matching = withVideos.filter((f) => f.points === 50).length;
  await expect(page.locator("#feat-status")).toContainText(
    `${matching.toLocaleString()} feats match`,
  );
  await expect(page.locator(".feat-result details")).toHaveCount(
    Math.min(40, matching),
  );
  await page
    .getByRole("checkbox", { name: "Has YouTube video", exact: true })
    .uncheck();
  await expect(page).not.toHaveURL(/youtube=1/);
  await expect(page.locator("#feat-status")).toContainText(
    `${catalog.feats.filter((f) => f.points === 50).length.toLocaleString()} feats match`,
  );
});
