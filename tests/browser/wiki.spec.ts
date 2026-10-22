import { test, expect } from "@playwright/test";
import articles from "../../src/data/articles.json" with { type: "json" };
test("search, filters, quest sources and mobile layout", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".card")).toHaveCount(articles.length);
  await page.getByRole("searchbox").fill("corridor leading to the exit");
  await expect(page.locator(".card:visible")).toHaveCount(1);
  await page.getByRole("button", { name: "Quests", exact: true }).click();
  await page.getByRole("link", { name: "All guides" }).click();
  await expect(page.locator(".card:visible")).toHaveCount(
    Math.min(48, articles.length),
  );
  await expect(page.getByRole("searchbox")).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "All", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("searchbox").fill("no matching entry");
  await expect(page.locator("#empty")).toBeVisible();
  await page.getByRole("searchbox").fill("");
  await page.getByRole("button", { name: "Quests", exact: true }).click();
  await expect(page.locator(".card:visible")).toHaveCount(
    Math.min(48, articles.filter((a) => a.category === "Quests").length),
  );
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
  await expect(page.locator(".card:visible")).toHaveCount(
    Math.min(48, articles.filter((a) => a.category === "Locations").length),
  );
});

test("mastery table remains usable on mobile and searchable", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("searchbox").fill("Shuriken Storm");
  await expect(
    page.getByRole("link", { name: /Weapon Mastery/ }),
  ).toBeVisible();
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
  await expect(
    page.getByRole("link", { name: /Weapon Mastery/ }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Categories", exact: true })
    .getByRole("link", { name: "Quests" })
    .click();
  await expect(page.locator(".card:visible")).toHaveCount(
    Math.min(48, articles.filter((a) => a.category === "Quests").length),
  );
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

test("copied maps appear inline with full-size and source links", async ({
  page,
}) => {
  for (const [slug, count] of [
    ["Grab_and_Smash", 10],
    ["Cape_Carmine_Lighthouse", 12],
    ["Viva_la_Lucha_Libre", 12],
    ["Out_in_the_Streets", 1],
    ["House_of_Venom", 2],
    ["Til_Death_Do_Us_Part_Episode_I", 12],
    ["Til_Death_Do_Us_Part_Episode_II", 12],
  ] as const) {
    await page.goto(`/wiki/${slug}/`);
    await expect(page.locator(".map-gallery img")).toHaveCount(count);
    await expect(
      page.locator(".map-gallery a").filter({ hasText: "Full-size image" }),
    ).toHaveCount(count);
    for (const img of await page.locator(".map-gallery img").all()) {
      await expect(img).toHaveAttribute(
        "src",
        /^https:\/\/images\.dcuo-wiki\.com\/[a-f0-9]{64}-preview\.webp$/,
      );
    }
  }
});

test("briefing chapters match wiki parts rather than video collection order", async ({
  page,
}) => {
  await page.goto("/wiki/Til_Death_Do_Us_Part_Episode_I/");
  await expect(
    page.getByRole("link", { name: "Part 1: Vicki Vale", exact: true }),
  ).toHaveAttribute(
    "href",
    "https://www.youtube.com/watch?v=2bfM23Di18w&t=238s",
  );
  await expect(
    page.getByRole("link", { name: "Part 4: Jack Ryder", exact: true }),
  ).toHaveAttribute(
    "href",
    "https://www.youtube.com/watch?v=2bfM23Di18w&t=68s",
  );
  await page.goto("/wiki/Til_Death_Do_Us_Part_Episode_II/");
  await expect(
    page.getByRole("link", { name: "Part 4: Lois Lane", exact: true }),
  ).toHaveAttribute(
    "href",
    "https://www.youtube.com/watch?v=GJOXYvO91xc&t=346s",
  );
});

test("reference directories retain entries and keep detail links compact", async ({
  page,
}) => {
  await page.goto("/wiki/Collections/");
  await expect(page.locator("tbody tr")).toHaveCount(379);
  const references = page
    .locator("details.section-references")
    .filter({ hasText: "Alien Technology" })
    .first();
  await expect(references).not.toHaveAttribute("open", "");
  await references.locator("summary").click();
  await expect(
    references.getByRole("link", { name: "Alien Technology", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await page.goto("/wiki/Artifacts/");
  await expect(page.locator("tbody tr")).toHaveCount(82);
  await expect(
    page.getByText(
      "The source introduction still describes three artifact slots",
      { exact: false },
    ),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/artifacts-expanded-mobile.png" });
});

test("power pages retain ability details and merged combo labels", async ({
  page,
}) => {
  await page.goto("/wiki/Fire_Power/");
  await expect(
    page
      .locator("tbody tr")
      .filter({ hasText: "Spontaneous Combustion" })
      .filter({ hasText: "Level: 30" }),
  ).toContainText("Power Cost: 200");
  await page.goto("/wiki/Light/");
  const table = page.getByRole("table", {
    name: "Construct Combos",
    exact: true,
  });
  await expect(table.locator("tbody tr")).toHaveCount(42);
  await expect(table.locator("tbody tr").last()).toContainText("Whip Thrash");
  await expect(table.locator("tbody tr").last()).toContainText("Impact");
  await expect(table.locator("tbody tr").last()).toContainText("Hold Range");
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
});

test("Celestial purification interactions are structured rows", async ({
  page,
}) => {
  await page.goto("/wiki/Celestial/");
  const table = page.getByRole("table", {
    name: "Celestial Power Interactions",
    exact: true,
  });
  await expect(table.locator("tbody tr")).toHaveCount(3);
  await expect(table.locator("tbody tr").first()).toContainText(
    "Purifies enemies",
  );
  await expect(table.locator("tbody tr").first()).toContainText("Retribution");
});

test("large guide libraries paginate and reset after searching or changing categories", async ({
  page,
}) => {
  test.skip(
    articles.length <= 48,
    "Pagination is only needed for larger libraries",
  );
  await page.goto("/", { waitUntil: "domcontentloaded" });
  const navigation = page.getByRole("navigation", { name: "Guide pages" });
  await expect(navigation).toBeVisible();
  await expect(page.locator(".card:visible")).toHaveCount(48);
  const first = await page
    .locator(".card:visible")
    .first()
    .getAttribute("href");
  await expect(
    navigation.getByRole("button", { name: "Previous", exact: true }),
  ).toBeDisabled();
  await navigation.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator("#guide-page")).toHaveText(/Page 2 of/);
  await expect(page.locator(".card:visible").first()).not.toHaveAttribute(
    "href",
    first!,
  );
  await page.getByRole("searchbox").fill("no matching entry");
  await expect(page.locator("#empty")).toBeVisible();
  await expect(navigation).toBeHidden();
  await page.getByRole("link", { name: /^All guides/ }).click();
  await expect(page.locator("#guide-page")).toHaveText(/Page 1 of/);
  await expect(page.locator(".card:visible").first()).toHaveAttribute(
    "href",
    first!,
  );
  await page.getByRole("button", { name: "Quests", exact: true }).click();
  await expect(page.locator("#guide-page")).toHaveText(/Page 1 of/);
  await expect(page.locator(".card:visible").first()).toHaveAttribute(
    "data-type",
    "Quests",
  );
});

test("imported articles omit unfilled sections and display clean text and tables", async ({
  page,
}) => {
  await page.goto("/wiki/Disturbance_on_the_Coast/");
  const body = page.locator("#article-body");
  await expect(body).toContainText("Restore Order in Coast City");
  expect(await body.innerText()).not.toMatch(/\\|\bn\/a\b|Not specified/);
  await expect(
    body.getByRole("heading", { name: "Rewards", exact: true }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("navigation", { name: "Table of contents" })
      .getByRole("link", { name: "Rewards", exact: true }),
  ).toHaveCount(0);
  await expect(
    body.getByRole("heading", { name: "Video walkthroughs", exact: true }),
  ).toHaveCount(0);
  await page.goto("/wiki/Collections/");
  expect(await page.locator("#article-body").innerText()).not.toMatch(
    /\b(?:n\/a|Not specified)\b/i,
  );
  await expect(page.locator("#article-body td:empty").first()).toBeVisible();
});

test("See also entries open the matching local guides directly", async ({
  page,
}) => {
  await page.goto("/wiki/Disturbance_on_the_Coast/");
  const list = page.locator('#section-5 [data-live-part="section-5"]');
  await expect(
    list.getByRole("link", { name: "Duo T1: Ferris Aircraft", exact: true }),
  ).toHaveAttribute("href", "/wiki/Duo_T1_Ferris_Aircraft/");
  await expect(
    list.getByRole("link", {
      name: "Alert T1: STAR Labs Research Facility",
      exact: true,
    }),
  ).toHaveAttribute("href", "/wiki/Alert_T1_STAR_Labs_Research_Facility/");
  await list
    .getByRole("link", { name: "Alert T1: Oan Sciencells", exact: true })
    .click();
  await expect(page).toHaveURL(/\/wiki\/Alert_T1_Oan_Sciencells_Heroes\//);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Alert T1: Oan Sciencells (Heroes)",
  );
});

test("expanded locations and catalog parts are navigable with copied artwork", async ({
  page,
}) => {
  await page.goto("/guides/?category=Locations");
  await expect(
    page.getByRole("button", { name: "Locations", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".card:visible")).toHaveCount(
    articles.filter((a) => a.category === "Locations").length,
  );
  await page.locator('.card[href="/wiki/Metropolis/"]').click();
  await expect(
    page.getByRole("heading", { name: "Metropolis", exact: true, level: 1 }),
  ).toBeVisible();
  await expect(page.locator("#article-body img").first()).toHaveAttribute(
    "src",
    /^https:\/\/images\.dcuo-wiki\.com\//,
  );
  await page.goto("/wiki/Base_Items/");
  await page
    .getByRole("link", { name: "Base Items (Part 1)", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Base Items (Part 1)",
      exact: true,
      level: 1,
    }),
  ).toBeVisible();
  await expect(page.getByRole("table").first()).toBeVisible();
  await page.goto("/guides/?release=game-systems&q=Vendors");
  await expect(page.locator('.card[href="/wiki/Vendors/"]')).toBeVisible();
});
