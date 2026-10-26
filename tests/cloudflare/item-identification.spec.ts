import { test, expect } from "@playwright/test";
const origin = "http://127.0.0.1:8787";
const headers = {
  Cookie: `__Host-dcuo-session=${"a".repeat(64)}`,
  Origin: origin,
};
const mod = { Cookie: `__Host-dcuo-session=${"b".repeat(64)}`, Origin: origin };
const image =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
test("real D1 review publishes across cached equipment, protects screenshots and retains revocation history", async ({
  request,
}) => {
  const queue = await request.get("/api/items/unidentified");
  expect(queue.status()).toBe(200);
  expect(
    (await queue.json()).items.some((i: any) => i.item_id === "999000111"),
  ).toBe(true);
  const result = await request.post("/api/items/evidence", {
    headers,
    data: {
      itemId: "999000111",
      name: "Integration helmet",
      evidence:
        "One item changed before and after the tooltip capture, with Census synced to the exact same slot.",
      image,
    },
  });
  expect(result.status()).toBe(201);
  const { id } = await result.json();
  expect((await request.get(`/api/items/evidence/${id}/image`)).status()).toBe(
    401,
  );
  const privateImage = await request.get(`/api/items/evidence/${id}/image`, {
    headers: mod,
  });
  expect(privateImage.status()).toBe(200);
  expect(await privateImage.body()).toEqual(Buffer.from(image, "base64"));
  expect(
    (
      await request.post("/api/items/review", {
        headers,
        data: { id, status: "approved", name: "Wrong" },
      })
    ).status(),
  ).toBe(403);
  const approve = await request.post("/api/items/review", {
    headers: mod,
    data: {
      id,
      status: "approved",
      name: "Integration helmet",
      notes: "Fixture item level 100; verified from tooltip.",
      slug: "Powers",
      reason: "Verified the precise tooltip variant and Census snapshot.",
    },
  });
  expect(approve.status()).toBe(200);
  const equipment = await request.get(
    "/api/profiles/11111111-1111-4111-8111-111111111111/equipment",
  );
  expect((await equipment.json()).items[0]).toMatchObject({
    name: "Integration helmet",
    href: "/wiki/Powers/",
    identified: true,
  });
  expect(
    (await (await request.get("/api/items/unidentified")).json()).items.some(
      (i: any) => i.item_id === "999000111",
    ),
  ).toBe(false);
  expect(
    (
      await request.post("/api/items/review", {
        headers: mod,
        data: {
          id,
          status: "revoked",
          reason: "Revoke disposable integration fixture mapping.",
        },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await (
        await request.get(
          "/api/profiles/11111111-1111-4111-8111-111111111111/equipment",
        )
      ).json()
    ).items[0].identified,
  ).toBe(false);
});
test("linked player submits a tooltip from the page and moderator sees a usable review form", async ({
  page,
}) => {
  // Local HTTP cannot send a __Host secure cookie; forward only this fixture's same-origin API calls.
  await page.route("**/api/**", async (route) => {
    const response = await route.fetch({
      headers: { ...route.request().headers(), ...headers },
    });
    await route.fulfill({ response });
  });
  await page.goto("/equipment-identification/?item=999000112");
  await expect(
    page.getByRole("heading", { name: "Identify equipment", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Unknown item from your character")).toHaveValue(
    "999000112",
  );
  await page.getByLabel("Exact item name").fill("Browser augment fixture");
  await page
    .getByLabel("Evidence and item details")
    .fill(
      "Tooltip captured for this exact augment after comparing a before and after equipment snapshot.",
    );
  await page.getByLabel("Tooltip screenshot").setInputFiles({
    name: "tooltip.png",
    mimeType: "image/png",
    buffer: Buffer.from(image, "base64"),
  });
  await page.getByRole("button", { name: "Submit item evidence" }).click();
  await expect(page.locator("#identification-status")).toContainText(
    "submitted for moderator review",
  );
  await expect(page.locator("#item-submission-list")).toContainText(
    "Browser augment fixture",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/item-identification-mobile.png",
    fullPage: true,
  });
  await page.unroute("**/api/**");
  await page.route("**/api/**", async (route) => {
    const response = await route.fetch({
      headers: { ...route.request().headers(), ...mod },
    });
    await route.fulfill({ response });
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Review item evidence" }),
  ).toBeVisible();
  await expect(page.locator("#item-review-list")).toContainText(
    "Browser augment fixture",
  );
  await expect(
    page.getByRole("button", { name: "Publish verified mapping" }),
  ).toBeVisible();
  await page.getByText("Tooltip and saved equipment", { exact: true }).click();
  await expect(page.getByAltText("Submitted item tooltip")).toBeVisible();
});

test("companion token UI publishes native names directly and revokes access", async ({
  page,
  request,
}) => {
  await page.route("**/api/**", async (route) => {
    const response = await route.fetch({
      headers: { ...route.request().headers(), ...headers },
    });
    await route.fulfill({ response });
  });
  await page.goto("/equipment-identification/#overlay-access");
  await expect(
    page.getByRole("button", { name: "Create companion token" }),
  ).toBeVisible();
  expect(
    (
      await request.post("/api/items/overlay-token", {
        headers: { Cookie: headers.Cookie },
      })
    ).status(),
  ).toBe(403);
  await page.getByRole("button", { name: "Create companion token" }).click();
  const input = page.locator("#overlay-token");
  await expect(input).toHaveValue(/^[a-f0-9]{64}$/);
  const token = await input.inputValue();
  const bearer = { Authorization: `Bearer ${token}` };
  expect((await request.get("/api/overlay/items", { headers })).status()).toBe(
    401,
  );
  const missing = await request.get("/api/overlay/items", { headers: bearer });
  expect(missing.status()).toBe(200);
  const data = await missing.json();
  expect(data.items).toContainEqual({ itemId: "999000111" });
  const capture = {
    schemaVersion: 1,
    character: data.character,
    build: "a".repeat(64),
    profile: "item-names-v1",
    capturedAt: Math.floor(Date.now() / 1000),
    items: [{ itemId: "999000111", name: "Native fixture helmet" }],
  };
  const submit = await request.post("/api/overlay/items", {
    headers: bearer,
    data: capture,
  });
  expect(submit.status()).toBe(201);
  expect(await submit.json()).toEqual({ submitted: 1, skipped: 0 });
  expect(
    await (
      await request.post("/api/overlay/items", {
        headers: bearer,
        data: capture,
      })
    ).json(),
  ).toEqual({ submitted: 0, skipped: 1 });
  const evidence = (
    await (
      await request.get("/api/items/review?status=approved", { headers: mod })
    ).json()
  ).submissions.find((s: any) => s.source === "companion");
  expect(evidence.hasScreenshot).toBe(false);
  expect(evidence.capture.build).toBe(capture.build);
  expect(
    (
      await request.get(`/api/items/evidence/${evidence.id}/image`, {
        headers: mod,
      })
    ).status(),
  ).toBe(404);
  const publicEquipment =
    "/api/profiles/11111111-1111-4111-8111-111111111111/equipment";
  expect(evidence.status).toBe("approved");
  expect(JSON.parse(evidence.history_json)[0].reason).toContain(
    "Direct companion publication",
  );
  expect(
    (await (await request.get(publicEquipment)).json()).items[0].name,
  ).toBe("Native fixture helmet");
  await page.reload();
  await expect(page.locator("#item-submission-list")).toContainText(
    "Native fixture helmet",
  );
  await expect(page.locator("#item-submission-list")).toContainText(
    "Companion capture published",
  );
  await page.getByRole("button", { name: "Revoke companion access" }).click();
  await expect(page.locator("#overlay-token-status")).toHaveText(
    "Companion access revoked.",
  );
  await expect(input).toHaveValue("");
  await page
    .locator("#overlay-access")
    .screenshot({ path: ".import-cache/proofs/overlay-access.png" });
  expect(
    (await request.get("/api/overlay/items", { headers: bearer })).status(),
  ).toBe(401);
});
