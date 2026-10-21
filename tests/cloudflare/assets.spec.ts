import { test, expect } from "@playwright/test";

test("Cloudflare serves articles, redirects aliases, and returns a real 404", async ({
  request,
}) => {
  for (const path of ["/", "/wiki/Artifacts/", "/wiki/Weapon_Mastery/"]) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/html");
    expect(await response.text()).toContain("https://dcuo-wiki.com");
  }
  for (const path of ["/wiki/Artifact", "/wiki/Artifact/"]) {
    const response = await request.get(path, { maxRedirects: 0 });
    expect(response.status()).toBe(301);
    expect(response.headers().location).toBe("/wiki/Artifacts/");
  }
  const missing = await request.get("/wiki/does-not-exist/");
  expect(missing.status()).toBe(404);
  expect(await missing.text()).toContain("DCUO");
  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).toContain(
    "https://dcuo-wiki.com/wiki/Artifacts/",
  );
  for (const path of [
    "/data/inventory.json",
    "/.import-cache/review-Feats.json",
  ])
    expect((await request.get(path)).status()).toBe(404);
});
