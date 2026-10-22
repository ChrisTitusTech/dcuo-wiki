import { test, expect } from "@playwright/test";
test("live section corrections load into the full article editor", async ({
  page,
  request,
}) => {
  const response = await request.get("/wiki/Powers/");
  expect(response.headers()["cache-control"]).toBe("no-store");
  expect(await response.text()).toContain(
    "Live fixture power correction &lt;script&gt;bad()&lt;/script&gt;",
  );
  await page.goto("/wiki/Powers/");
  await page.getByRole("link", { name: "Edit this page", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Article body", exact: true }),
  ).toContainText("How powers work");
  await expect(page.getByLabel("Article summary", { exact: true })).toHaveValue(
    "Live fixture power correction <script>bad()</script>",
  );
  await expect(
    page.getByRole("textbox", { name: "Article body", exact: true }),
  ).toContainText("Tank power sets");
  await expect(
    page.getByRole("button", { name: "Publish changes", exact: true }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Back to article" }).click();
  await page
    .getByRole("link", { name: "Edit Tank power sets", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Editing: Powers" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.getSelection()?.anchorNode?.parentElement?.closest("h2")
            ?.textContent,
      ),
    )
    .toBe("Tank power sets");
  expect(
    (await page.locator("script").allTextContents()).join(""),
  ).not.toContain("bad()");
});

test("full article drafts survive conflicts and reloads, then discard to current content", async ({
  page,
}) => {
  let publishes = 0,
    reads = 0;
  let release!: () => void;
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
  await page.route("**/api/articles/Powers/document", async (route) => {
    if (route.request().method() !== "POST") {
      reads++;
      if (reads < 3) return route.continue();
      const response = await route.fetch();
      const data = await response.json();
      data.document.content = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Newest published full-article content." },
            ],
          },
        ],
      };
      data.revision = 99;
      return route.fulfill({ json: data });
    }
    const body = route.request().postDataJSON();
    expect(body.document.title).toBe("Corrected Powers guide");
    expect(JSON.stringify(body.document.content)).toContain(
      "Corrected complete walkthrough",
    );
    expect(JSON.stringify(body.document.content).length).toBeGreaterThan(7000);
    expect(body.baseHash).toHaveLength(64);
    publishes++;
    await pending;
    await route.fulfill({
      status: 409,
      json: { error: "This article changed. Your draft is saved." },
    });
  });
  await page.goto("/wiki/Powers/#article-editor");
  await expect(
    page.getByRole("button", { name: "Publish changes" }),
  ).toBeEnabled();
  await page
    .getByLabel("Article title", { exact: true })
    .fill("Corrected Powers guide");
  await page.getByRole("tab", { name: "Source (HTML)", exact: true }).click();
  const source = page.getByLabel("Article HTML source", { exact: true });
  const original = await source.inputValue();
  await source.fill(
    original +
      "<h2>Corrected complete walkthrough</h2><p>" +
      "Useful verified walkthrough detail. ".repeat(500) +
      "</p>",
  );
  await page
    .getByText("Edit summary and supporting sources", { exact: true })
    .click();
  await page
    .getByLabel("What changed and why?")
    .fill("Expand the full guide with current power progression.");
  await page
    .getByLabel("Sources or in-game evidence", { exact: true })
    .fill("Checked against the in-game powers menu.");
  await page.getByRole("button", { name: "Publish changes" }).click();
  await expect(source).toBeDisabled();
  await expect(
    page.getByLabel("Article title", { exact: true }),
  ).toBeDisabled();
  release();
  await expect(page.locator("#edit-status")).toContainText(
    "This article changed",
  );
  expect(publishes).toBe(1);
  page.on("dialog", (dialog) => dialog.accept());
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Article body", exact: true }),
  ).toContainText("Corrected complete walkthrough");
  await expect(page.getByLabel("Article title", { exact: true })).toHaveValue(
    "Corrected Powers guide",
  );
  await page.getByRole("button", { name: "Discard draft and reload" }).click();
  await expect(
    page.getByRole("textbox", { name: "Article body", exact: true }),
  ).toContainText("Newest published full-article content.");
  await expect(page.locator("#edit-status")).toContainText("Loaded the latest");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () =>
        document.querySelector("#article-editor")!.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/full-article-editor-mobile.png",
  });
});

test("visual formatting, table controls, wiki images and YouTube round-trip through preview", async ({
  page,
}) => {
  await page.route("**/embed/**", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<p>Local video preview fixture</p>",
    }),
  );
  await page.goto("/wiki/Grab_and_Smash/#article-editor");
  await page.getByRole("tab", { name: "Source (HTML)", exact: true }).click();
  await page
    .getByLabel("Article HTML source", { exact: true })
    .fill(
      "<h2>A new walkthrough</h2><p>Format this complete guide paragraph.</p>",
    );
  await page.getByRole("tab", { name: "Visual editor", exact: true }).click();
  const body = page.getByRole("textbox", { name: "Article body", exact: true });
  await body.locator("p").first().click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  await page.getByRole("button", { name: "Bold", exact: true }).click();
  await expect(body.locator("strong")).toContainText(
    "Format this complete guide paragraph.",
  );
  await page.keyboard.press("ArrowRight");
  await page.getByRole("button", { name: "Table", exact: true }).click();
  await expect(body.locator("table")).toHaveCount(1);
  await body.locator("td").first().click();
  await page.getByRole("button", { name: "Add row", exact: true }).click();
  await expect(body.locator("tr")).toHaveCount(4);
  await page.getByRole("button", { name: "Image / map", exact: true }).click();
  await page
    .getByLabel("Search wiki images", { exact: true })
    .fill("SourceMark");
  await page
    .getByRole("button", { name: "Choose SourceMark.png", exact: true })
    .click();
  await page
    .getByLabel("Label / caption", { exact: true })
    .fill("Source Mark icon");
  await page.getByRole("button", { name: "Insert", exact: true }).click();
  await expect(body.locator("img")).toHaveAttribute(
    "src",
    /^https:\/\/images\.dcuo-wiki\.com\//,
  );
  await page
    .getByRole("button", { name: "YouTube video", exact: true })
    .click();
  await page
    .getByLabel("Link URL", { exact: true })
    .fill("https://www.youtube.com/watch?v=feVycMBmm5Q");
  await page
    .getByLabel("Label / caption", { exact: true })
    .fill("Verified quest walkthrough");
  await page.getByRole("button", { name: "Insert", exact: true }).click();
  await page.getByRole("tab", { name: "Source (HTML)", exact: true }).click();
  await expect(
    page.getByLabel("Article HTML source", { exact: true }),
  ).toHaveValue(/data-youtube-url/);
  await page.getByRole("tab", { name: "Preview", exact: true }).click();
  const preview = page.locator("#article-preview");
  await expect(
    preview.getByRole("heading", { name: "A new walkthrough", exact: true }),
  ).toBeVisible();
  await expect(preview.locator("table tr")).toHaveCount(4);
  await expect(preview.locator("strong").first()).toContainText(
    "Format this complete guide paragraph.",
  );
  await expect(preview.locator("img")).toHaveAttribute(
    "src",
    /^https:\/\/images\.dcuo-wiki\.com\//,
  );
  await expect(preview.locator("iframe")).toHaveAttribute(
    "src",
    /youtube-nocookie\.com\/embed\/feVycMBmm5Q/,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("full article revisions render live titles, body, contents, search, and restorable history", async ({
  page,
  request,
}) => {
  await page.goto("/guides/");
  await page.getByRole("searchbox").fill("Live full-article fixture");
  await expect(page.locator(".card:visible")).toHaveCount(1);
  await expect(page.locator(".card:visible h3")).toHaveText(
    "Live fixture Grab and Smash guide",
  );
  await expect(page.locator(".card:visible p")).toContainText(
    "A full-article fixture summary",
  );
  const response = await request.get("/wiki/Grab_and_Smash/", {
    headers: { "If-None-Match": '\"old\"' },
  });
  expect(response.status()).toBe(200);
  expect(await response.text()).toContain("Live full-article fixture with");
  await page.goto("/wiki/Grab_and_Smash/");
  await expect(page.locator(".article-top h1")).toHaveText(
    "Live fixture Grab and Smash guide",
  );
  await expect(page.locator("#article-toc")).toContainText(
    "Community walkthrough",
  );
  await expect(page.locator("#article-body")).toContainText(
    "<script>neverExecute()</script>",
  );
  expect(
    (await page.locator("script").allTextContents()).join(""),
  ).not.toContain("neverExecute()");
  await page
    .getByRole("link", { name: "Edit Community walkthrough", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.getSelection()?.anchorNode?.parentElement?.closest("h2")
            ?.textContent,
      ),
    )
    .toBe("Community walkthrough");
  await page.getByRole("button", { name: "Back to article" }).click();
  await page.locator('#article-body a[data-edit-part="location"]').click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        window
          .getSelection()
          ?.anchorNode?.parentElement?.closest("h2")
          ?.getAttribute("data-section-id"),
      ),
    )
    .toBe("location");
  await page.getByRole("button", { name: "Back to article" }).click();
  await page.getByText("Page edit history", { exact: true }).click();
  await page.locator("#edit-history-list summary").first().click();
  await expect(page.locator("#edit-history-list .history-article")).toHaveCount(
    2,
  );
  await page
    .getByRole("button", {
      name: "Restore article from before this edit",
      exact: true,
    })
    .click();
  await expect(page.getByLabel("Article title", { exact: true })).toHaveValue(
    "Grab and Smash",
  );
  await expect(page.locator("#edit-status")).toContainText(
    "Earlier article loaded as a draft",
  );
  await expect(
    page.getByRole("button", { name: "Publish changes" }),
  ).toBeDisabled();
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

test("live reward corrections keep their edited amount and safely display the currency icon", async ({
  page,
}) => {
  await page.goto("/wiki/BOUNTY_New_Genesis_Protector/");
  const rewards = page.locator('[data-live-part="section-5"]');
  await expect(rewards).toContainText("9 Source Marks");
  await expect(rewards).not.toContainText("1 Source Mark");
  await expect(rewards.locator(".reward-currency img")).toHaveAttribute(
    "src",
    /^https:\/\/images\.dcuo-wiki\.com\//,
  );
  await expect(rewards).toContainText("<script>unsafe()</script>");
  expect(
    (await page.locator("script").allTextContents()).join(""),
  ).not.toContain("unsafe()");
});

test("a reviewed conflict preserves the draft and publishes against the latest revision", async ({
  page,
}) => {
  let reads = 0,
    writes = 0;
  await page.route("**/api/me", (route) =>
    route.fulfill({
      json: {
        name: "Test player",
        profile: { character: { name: "Test Hero" } },
      },
    }),
  );
  await page.route("**/api/articles/Powers/document", async (route) => {
    if (route.request().method() === "GET") {
      const response = await route.fetch();
      const state = await response.json();
      reads++;
      if (reads > 1) {
        state.revision = 9;
        state.baseHash = "c".repeat(64);
        state.document.summary = "A peer's newer summary.";
        state.html = "<p>A concurrent edit to preserve.</p>";
      }
      return route.fulfill({ json: state });
    }
    const body = route.request().postDataJSON();
    writes++;
    if (writes === 1)
      return route.fulfill({
        status: 409,
        json: {
          error:
            "This article changed since you opened it. Your draft is saved.",
        },
      });
    expect(body.revision).toBe(9);
    expect(body.baseHash).toBe("c".repeat(64));
    expect(JSON.stringify(body.document)).toContain(
      "My complete guide correction.",
    );
    expect(JSON.stringify(body.document)).toContain(
      "A concurrent edit to preserve.",
    );
    return route.fulfill({ status: 201, json: { published: true } });
  });
  await page.goto("/wiki/Powers/#article-editor");
  await expect(
    page.getByRole("button", { name: "Publish changes" }),
  ).toBeEnabled();
  await page.getByRole("tab", { name: "Source (HTML)", exact: true }).click();
  await page
    .getByLabel("Article HTML source", { exact: true })
    .fill("<h2>Guide correction</h2><p>My complete guide correction.</p>");
  await page
    .getByText("Edit summary and supporting sources", { exact: true })
    .click();
  await page
    .getByLabel("What changed and why?")
    .fill("Correct and merge the full article details.");
  await page
    .getByLabel("Sources or in-game evidence", { exact: true })
    .fill("Verified against the current in-game menu.");
  await page.getByRole("button", { name: "Publish changes" }).click();
  await expect(page.locator("#conflict-controls")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Continue with reviewed draft" }),
  ).toBeDisabled();
  await expect(page.locator("#article-preview")).toContainText(
    "My complete guide correction.",
  );
  await expect(page.locator("#published-preview")).toContainText(
    "A concurrent edit to preserve.",
  );
  await page.getByRole("tab", { name: "Source (HTML)", exact: true }).click();
  const html = page.getByLabel("Article HTML source", { exact: true });
  await html.fill(
    (await html.inputValue()) + "<p>A concurrent edit to preserve.</p>",
  );
  await page.getByRole("tab", { name: "Preview", exact: true }).click();
  await page
    .getByLabel(
      "I have reviewed the latest article and merged the changes I want to keep.",
      { exact: true },
    )
    .check();
  await page
    .getByRole("button", { name: "Continue with reviewed draft" })
    .click();
  await page.getByRole("button", { name: "Publish changes" }).click();
  await expect(page.locator("#article-editor")).not.toBeVisible();
  expect(writes).toBe(2);
  expect(
    await page.evaluate(() => sessionStorage.getItem("wiki-document:Powers")),
  ).toBeNull();
});

test("the largest existing article can be edited and previewed as a complete document", async ({
  page,
}) => {
  await page.goto("/wiki/Collections/#article-editor");
  const body = page.getByRole("textbox", { name: "Article body", exact: true });
  await expect(body.locator("table").first()).toBeVisible();
  await page.getByRole("tab", { name: "Source (HTML)", exact: true }).click();
  expect(
    (await page.getByLabel("Article HTML source", { exact: true }).inputValue())
      .length,
  ).toBeGreaterThan(100000);
  await page.getByRole("tab", { name: "Preview", exact: true }).click();
  await expect(page.locator("#article-preview h1")).toHaveText("Collections");
  await expect(page.locator("#article-preview table").first()).toBeVisible();
});

test("published story corrections appear safely in the Story tab and its search", async ({
  page,
  request,
}) => {
  const res = await request.get("/story/");
  expect(res.headers()["cache-control"]).toBe("no-store");
  expect(await res.text()).toContain(
    "Live story correction &lt;script&gt;storyUnsafe()&lt;/script&gt;",
  );
  await page.goto("/story/");
  await page
    .getByRole("searchbox", { name: "Find a story", exact: true })
    .fill("Live story correction");
  await expect(page.locator(".story-row:visible")).toHaveCount(1);
  await expect(page.locator(".story-card:visible p")).toContainText(
    "Live story correction <script>storyUnsafe()</script>",
  );
  expect(await page.evaluate(() => typeof (window as any).storyUnsafe)).toBe(
    "undefined",
  );
  await page.locator(".story-card:visible").click();
  await expect(page.locator('[data-live-part="summary"]')).toContainText(
    "Live story correction",
  );
  await page.getByRole("link", { name: "Edit this page", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Article body", exact: true }),
  ).toContainText("Green Lantern");
});

test("cleaned empty sections remain omitted until a legacy correction supplies real content", async ({
  page,
  request,
}) => {
  await page.goto("/wiki/Disturbance_on_the_Coast/");
  await expect(page.locator("#article-body")).toContainText(
    "Restore Order in Coast City",
  );
  await expect(
    page
      .locator("#article-body")
      .getByRole("heading", { name: "Rewards", exact: true }),
  ).toHaveCount(0);
  const initial = await (
    await request.get("/api/articles/Disturbance_on_the_Coast/document")
  ).json();
  expect(JSON.stringify(initial.document)).not.toMatch(
    /n\/a|\\\\|Restore Order in \[oast/,
  );
  await page.goto("/wiki/Tomorrow_Will_Be_Gigantic/");
  await expect(page.locator("#section-4")).toBeVisible();
  await expect(
    page
      .getByRole("navigation", { name: "Table of contents" })
      .getByRole("link", { name: "Rewards", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#section-4")).toContainText("5 Source Marks");
  const restored = await (
    await request.get("/api/articles/Tomorrow_Will_Be_Gigantic/document")
  ).json();
  expect(JSON.stringify(restored.document)).toContain("5 Source Marks");
});

test("See also cross links survive the live Worker, full editor baseline and preview", async ({
  page,
  request,
}) => {
  const slug = "Disturbance_on_the_Coast";
  await page.goto("/wiki/" + slug + "/");
  await expect(
    page.locator('#section-5 [data-live-part="section-5"] a'),
  ).toHaveCount(3);
  const state = await (
    await request.get("/api/articles/" + slug + "/document")
  ).json();
  expect(JSON.stringify(state.document)).toContain(
    "/wiki/Alert_T1_Oan_Sciencells_Heroes/",
  );
  const preview = await request.post("/api/articles/" + slug + "/preview", {
    headers: { Origin: "http://127.0.0.1:8787" },
    data: { document: state.document },
  });
  expect(preview.status()).toBe(200);
  expect((await preview.json()).html).toContain(
    'href="/wiki/Duo_T1_Ferris_Aircraft/"',
  );
  // A saved legacy/full-document source URL is localized at render time too.
  const doc = {
    version: 1,
    title: "Local guide links",
    summary: "Summary",
    content: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "See also" }],
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Duo T1: Ferris Aircraft" }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Oan mission",
              marks: [
                {
                  type: "link",
                  attrs: {
                    href: "https://dcuniverseonline.fandom.com/wiki/Alert_T1:_Oan_Sciencells",
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  };
  const migrated = await request.post("/api/articles/" + slug + "/preview", {
    headers: { Origin: "http://127.0.0.1:8787" },
    data: { document: doc },
  });
  expect(migrated.status()).toBe(200);
  const rendered = await migrated.json();
  expect(rendered.html).toContain(
    'href="/wiki/Alert_T1_Oan_Sciencells_Heroes/"',
  );
  expect(rendered.html).toContain('href="/wiki/Duo_T1_Ferris_Aircraft/"');
  expect(JSON.stringify(rendered.document)).toContain(
    "https://dcuniverseonline.fandom.com/wiki/Alert_T1:_Oan_Sciencells",
  );
});

test("large untouched articles stream prepared editor documents and keep revision hashes compatible", async ({
  request,
}) => {
  for (const slug of ["Allies", "Base_Items_1", "Vendors"]) {
    const source = await request.get("/_editor/" + slug + ".json");
    expect(source.status()).toBe(200);
    const live = await request.get("/api/articles/" + slug + "/document");
    expect(live.status()).toBe(200);
    expect(live.headers()["cache-control"]).toBe("no-store");
    const document = await live.json();
    expect(document).toEqual(await source.json());
    expect(document.revision).toBe(0);
    expect(document.baseHash).toHaveLength(64);
  }
});
