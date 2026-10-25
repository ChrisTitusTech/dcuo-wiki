import { test, expect } from "@playwright/test";
import housing from "../../content/catalog/Housing.json" with { type: "json" };
const article = housing.find((a) =>
  a.sections.some((s) =>
    s.images?.some((i) => i.url.includes("/api/catalog-media/")),
  ),
)!;
test("library corrections expose current public titles and summaries", async ({
  request,
}) => {
  const missing = await request.get("/api/articles/Does_Not_Exist/document");
  expect(missing.status()).toBe(404);
  const response = await request.get("/api/catalog-corrections");
  expect(response.status()).toBe(200);
  const rows = (await response.json()).corrections as {
    slug: string;
    part: string;
    title: string;
    summary: string;
  }[];
  const source = await request.get("/api/articles/Grab_and_Smash/document");
  const document = (await source.json()).document;
  expect(
    rows.find((r) => r.slug === "Grab_and_Smash" && r.part === "document")
      ?.title,
  ).toBe(document.title);
  expect(rows.every((r) => !("user_id" in r) && !("discord_id" in r))).toBe(
    true,
  );
});
test("packed housing pages, complete editors, media selection and credits work together", async ({
  request,
}) => {
  const response = await request.get("/wiki/" + article.slug + "/");
  expect(response.status()).toBe(200);
  expect(response.headers()["x-frame-options"]).toBe("DENY");
  expect(await response.text()).toContain(article.title);
  const doc = await request.get("/api/articles/" + article.slug + "/document");
  expect(doc.status()).toBe(200);
  const payload = await doc.json();
  expect(payload.document.title).toBe(article.title);
  expect(payload.revision).toBe(0);
  const preview = await request.post(
    "/api/articles/" + article.slug + "/preview",
    {
      headers: { Origin: "http://127.0.0.1:8787" },
      data: { document: payload.document },
    },
  );
  expect(preview.status()).toBe(200);
  const media = await request.get("/api/articles/" + article.slug + "/media");
  expect(media.status()).toBe(200);
  const pictures = (await media.json()).images as {
    src: string;
    source: string;
  }[];
  const picture = pictures.find((p) => p.src.includes("/api/catalog-media/"));
  expect(picture).toBeTruthy();
  if (!picture) throw Error("Imported article media was not returned");
  const credit = await request.get(new URL(picture.source).pathname, {
    maxRedirects: 0,
  });
  expect(credit.status()).toBe(302);
  expect(credit.headers().location).toMatch(
    /^https:\/\/dcuniverseonline\.fandom\.com\/wiki\/File:/,
  );
});
