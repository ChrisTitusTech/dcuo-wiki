import { test, expect } from "@playwright/test";
test("live D1 revisions render safely in articles, search, and history", async ({
  page,
  request,
}) => {
  const response = await request.get("/wiki/Powers/");
  expect(response.headers()["cache-control"]).toBe("no-store");
  const html = await response.text();
  expect(html).toContain(
    "Live fixture power correction &lt;script&gt;bad()&lt;/script&gt;",
  );

  const cached = await request.get("/wiki/Powers/", {
    headers: { "If-None-Match": '"old"' },
  });
  expect(cached.status()).toBe(200);
  await page.goto("/");
  await page.getByRole("searchbox").fill("Live fixture power correction");
  await expect(page.locator(".card:visible")).toHaveCount(1);
  await page.locator(".card:visible").click();
  expect(
    (await page.locator("script").allTextContents()).join(""),
  ).not.toContain("bad()");
  await expect(page.locator('[data-live-part="summary"]')).toContainText(
    "Live fixture power correction",
  );
  await page.getByText("Page edit history", { exact: true }).click();
  await expect(page.locator("#edit-history-list")).toContainText(
    "Local fixture",
  );
  await page.getByRole("link", { name: "Edit this page", exact: true }).click();
  await expect(page.getByLabel("Proposed text")).toHaveValue(
    /Choose your power set during character creation/,
  );
  await page
    .getByRole("link", { name: "Edit Tank power sets", exact: true })
    .click();
  await expect(page.getByLabel("Proposed text")).toHaveValue(
    /Fire, Ice, Earth, Rage, and Atomic/,
  );
  await page.getByLabel("Section to edit").selectOption({ label: "Summary" });
  await expect(page.getByLabel("Proposed text")).toHaveValue(
    "Live fixture power correction <script>bad()</script>",
  );
  await expect(
    page.getByRole("button", { name: "Publish correction", exact: true }),
  ).toBeDisabled();
});

test("article editor publishes selected text and preserves a rejected draft", async ({
  page,
}) => {
  let publishes = 0,
    reads = 0;
  let release: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/me", (route) =>
    route.fulfill({
      json: {
        name: "Test player",
        profile: { character: { name: "Test Hero" } },
      },
    }),
  );
  await page.route("**/api/articles/Powers", async (route) => {
    if (route.request().method() !== "POST") {
      reads++;
      if (reads < 3) return route.continue();
      const response = await route.fetch();
      const data = await response.json();
      data.parts[1].text = "- Newest published section.";
      data.parts[1].revision = 99;
      return route.fulfill({ json: data });
    }
    const body = route.request().postDataJSON();
    expect(body.part).toBe("section-0");
    expect(body.content).toContain("Corrected power details");
    expect(body.baseHash).toHaveLength(64);
    publishes++;
    await pending;
    await route.fulfill({
      status: 409,
      json: {
        error:
          "This section changed. Reload the current text before publishing your correction.",
      },
    });
  });
  await page.goto("/wiki/Powers/#article-editor");
  await expect(
    page.getByRole("button", { name: "Publish correction", exact: true }),
  ).toBeEnabled();
  await page
    .getByLabel("Section to edit")
    .selectOption({ label: "How powers work" });
  await page
    .getByLabel("Proposed text")
    .fill("- Corrected power details checked in game.");
  await page
    .getByLabel("What changed and why?")
    .fill("Correct the current power progression.");
  await page
    .getByLabel("Sources or in-game evidence", { exact: true })
    .fill("Checked against the in-game powers menu.");
  await page
    .getByRole("button", { name: "Publish correction", exact: true })
    .click();
  await expect(page.getByLabel("Proposed text")).toBeDisabled();
  await expect(page.getByLabel("Section to edit")).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Discard this draft" }),
  ).toBeDisabled();
  release!();
  await expect(page.locator("#edit-status")).toContainText(
    "This section changed",
  );
  expect(publishes).toBe(1);
  await expect(page.getByLabel("Proposed text")).toHaveValue(
    "- Corrected power details checked in game.",
  );
  page.on("dialog", (dialog) => dialog.accept());
  await page.reload();
  await expect(page.getByLabel("Proposed text")).toHaveValue(
    "- Corrected power details checked in game.",
  );
  await page.getByRole("button", { name: "Discard this draft" }).click();
  await expect(page.getByLabel("Proposed text")).toHaveValue(
    "- Newest published section.",
  );
  await expect(page.locator("#edit-status")).toContainText("Loaded the latest");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/article-editor-mobile.png",
    fullPage: true,
  });
});

test("live corrections appear on the guides hub and release pages with release search labels", async ({
  page,
}) => {
  for (const path of ["/guides/", "/releases/game-systems/"]) {
    await page.goto(path);
    await page.getByRole("searchbox").fill("Live fixture power correction");
    await expect(page.locator(".card:visible")).toHaveCount(1);
    await expect(page.locator(".card:visible p")).toContainText(
      "Live fixture power correction",
    );
    await page.getByRole("searchbox").fill("Game systems & updates");
    await expect(page.locator('.card[href="/wiki/Powers/"]')).toBeVisible();
  }
});
