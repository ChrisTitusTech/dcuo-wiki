import { test, expect } from '@playwright/test';

test.beforeEach(async ({page}) => {
  await page.route('https://images.dcuo-wiki.com/**', route => route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="#183755"/></svg>'}));
});

test('gallery popout stays on the article, navigates, and restores focus and scroll', async ({page, context}) => {
  await page.goto('/wiki/Grab_and_Smash/');
  const first = page.locator('.map-gallery figure').first().locator('a[data-image-viewer]').first();
  await first.scrollIntoViewIfNeeded();
  const scroll = await page.evaluate(() => scrollY);
  const url = page.url();
  await first.click();
  const viewer = page.getByRole('dialog', {name:'Image viewer'});
  await expect(viewer).toBeVisible();
  await expect(page.locator('#viewer-count')).toHaveText('1 / 10');
  await expect(page.locator('#viewer-image')).toHaveAttribute('src', (await first.getAttribute('href'))!);
  await expect(page.locator('#viewer-image')).not.toHaveAttribute('src', /preview/);
  expect(page.url()).toBe(url);
  expect(context.pages()).toHaveLength(1);
  await page.getByRole('button', {name:'Previous image',exact:true}).click();
  await expect(page.locator('#viewer-count')).toHaveText('10 / 10');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#viewer-count')).toHaveText('1 / 10');
  await page.getByRole('button', {name:'Next image',exact:true}).click();
  await expect(page.locator('#viewer-count')).toHaveText('2 / 10');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#viewer-count')).toHaveText('1 / 10');
  await page.keyboard.press('Escape');
  await expect(viewer).not.toBeVisible();
  await expect(first).toBeFocused();
  expect(await page.evaluate(() => scrollY)).toBeCloseTo(scroll, 0);
  await expect(page.locator('html')).not.toHaveClass(/image-viewer-open/);
  await page.locator('.map-gallery figure').first().getByRole('link', {name:'Full-size image'}).click();
  await expect(viewer).toBeVisible();
  await viewer.click({position:{x:2,y:100}});
  await expect(viewer).not.toBeVisible();
});

test('single images hide navigation and mobile viewer fits the screen', async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.goto('/wiki/Out_in_the_Streets/');
  await page.locator('.map-gallery img').click();
  await expect(page.locator('#viewer-count')).toHaveText('1 / 1');
  await expect(page.locator('#viewer-previous')).toBeHidden();
  await expect(page.locator('#viewer-next')).toBeHidden();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#viewer-count')).toHaveText('1 / 1');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', {name:'Close image viewer'}).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test("Powers inline artwork shares the page gallery and fits a mobile article", async ({
  page,
}) => {
  await page.goto("/wiki/Powers/");
  await expect(page.locator(".section-images img")).toHaveCount(16);
  const atomic = page.locator("#section-9");
  await expect(
    atomic.getByRole("heading", { name: "Atomic", exact: true }),
  ).toBeVisible();
  await atomic.getByRole("img").click();
  await expect(page.locator("#viewer-count")).toHaveText("2 / 16");
  await page.getByRole("button", { name: "Next image", exact: true }).click();
  await expect(page.locator("#viewer-caption")).toHaveText(
    "Celestial power icon",
  );
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
