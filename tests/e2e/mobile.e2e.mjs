// Mobile layout, several phone sizes: no sideways scrolling, menus and dialogs open
// and stay inside the screen. Public pages (Health and Beauty, LTR and RTL) and both
// operator panels, including the new Quotes screen with its bulk bar and dialogs.
//
// This is an EMULATED phone (Chromium with a phone viewport, touch and pixel ratio), not a real
// device: it proves layout and behaviour at these widths, not Safari/Android-specific rendering.
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { BASE, launch, resetDb, login, measureInPage } from "./helpers.mjs";

const WIDTHS = [320, 360, 390, 430, 768, 820, 1024, 1180, 1280, 1366];
const PUBLIC = [
  "/", "/health/en", "/health/fa", "/health/tg", "/health/ru/catalog", "/health/en/catalog/e2e-gloves",
  "/health/en/contact", "/health/en/categories", "/beauty/en", "/beauty/fa", "/beauty/en/contact",
];

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
beforeEach(async () => { await resetDb(); });

async function phone(width) {
  const ctx = await browser.newContext({ viewport: { width, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  return { ctx, page: await ctx.newPage() };
}

async function assertFits(page, label) {
  const res = await page.evaluate(measureInPage);
  assert.equal(res.count, 0, `${label}: ${res.count} element(s) past the screen edge: ${JSON.stringify(res.offenders.slice(0, 3))}`);
  const sx = await page.evaluate(() => { window.scrollTo(300, 0); return window.scrollX; });
  assert.equal(sx, 0, `${label}: the page scrolls sideways`);
}

async function assertInside(page, locator, label) {
  const vw = await page.evaluate(() => document.documentElement.clientWidth);
  const box = await locator.boundingBox();
  assert.ok(box, `${label}: not visible`);
  assert.ok(box.x >= -1 && box.x + box.width <= vw + 1, `${label}: x ${Math.round(box.x)}..${Math.round(box.x + box.width)} is outside the ${vw}px screen`);
}

for (const width of WIDTHS) {
  test(`public pages at ${width}px: no sideways scroll`, async () => {
    const { ctx, page } = await phone(width);
    for (const route of PUBLIC) {
      await page.goto(BASE + route, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);
      await assertFits(page, `${route} @ ${width}`);
    }
    await ctx.close();
  });

  for (const house of ["health", "beauty"]) {
    test(`${house} header menus at ${width}px open, stay on screen and close`, async () => {
      const { ctx, page } = await phone(width);
      await page.goto(`${BASE}/${house}/en`, { waitUntil: "networkidle" });
      await page.waitForTimeout(400);

      // main menu (below the desktop breakpoint)
      const menu = page.locator('button[aria-label="Menu"]');
      if (await menu.isVisible()) {
        assert.equal(await menu.getAttribute("aria-expanded"), "false");
        await menu.click();
        await page.waitForTimeout(250);
        assert.equal(await menu.getAttribute("aria-expanded"), "true", "menu did not open");
        await assertFits(page, `${house} menu open @ ${width}`);
        const link = page.locator("div.fixed nav a").first();
        await assertInside(page, link, `${house} first menu link @ ${width}`);
        await menu.click();
        await page.waitForTimeout(200);
        assert.equal(await menu.getAttribute("aria-expanded"), "false", "menu did not close");
      }

      // language + theme pill (phones)
      const prefs = page.locator('button[aria-label="Language and theme"]');
      if (await prefs.isVisible()) {
        await prefs.click();
        await page.waitForTimeout(250);
        assert.equal(await prefs.getAttribute("aria-expanded"), "true");
        const dropdown = page.locator('button[aria-label="Language and theme"] + div');
        await assertInside(page, dropdown, `${house} language menu @ ${width}`);
        await assertFits(page, `${house} language menu open @ ${width}`);
        await prefs.click();
      }

      // search overlay
      const search = page.locator('button[aria-label="Search"]');
      if (await search.count()) {
        await search.first().click();
        const dialog = page.getByRole("dialog");
        await dialog.waitFor({ timeout: 5000 });
        await assertInside(page, dialog.locator("> div").last(), `${house} search box @ ${width}`);
        await assertFits(page, `${house} search open @ ${width}`);
        await page.keyboard.press("Escape");
        await dialog.waitFor({ state: "detached", timeout: 5000 });
      }
      await ctx.close();
    });
  }

  test(`Health panel at ${width}px: pages, drawer, Quotes bulk bar and dialogs fit`, async () => {
    const { ctx, page } = await phone(width);
    await login(page, "health");
    for (const route of ["/operator", "/operator/products", "/operator/categories", "/operator/settings"]) {
      await page.goto(BASE + route, { waitUntil: "networkidle" });
      await assertFits(page, `${route} @ ${width}`);
    }

    // the drawer (below the desktop breakpoint the sidebar becomes a drawer)
    const burger = page.locator('button[aria-label="منو"]');
    if (await burger.isVisible()) {
      await burger.click();
      const drawer = page.locator("aside.absolute");
      await drawer.waitFor();
      await assertInside(page, drawer, `panel drawer @ ${width}`);
      await assertFits(page, `panel drawer open @ ${width}`);
      await page.locator('button[aria-label="بستن"]').click();
      await drawer.waitFor({ state: "detached" });
    }

    // Quotes: tabs, expanded row, selection, bulk bar, both delete dialogs
    await page.goto(`${BASE}/operator/quotes`, { waitUntil: "networkidle" });
    await assertFits(page, `quotes @ ${width}`);
    await page.getByRole("tab", { name: /همه/ }).click();
    await page.locator("button", { hasText: "E2E Customer 3" }).first().click();   // expand a row
    await assertFits(page, `quotes row expanded @ ${width}`);
    await page.getByLabel("انتخاب E2E Customer 1", { exact: true }).check();
    await page.getByLabel("انتخاب E2E Customer 2", { exact: true }).check();
    const bar = page.getByRole("region", { name: "عملیات گروهی" });
    await bar.waitFor();
    await assertInside(page, bar, `bulk bar @ ${width}`);
    await assertFits(page, `quotes with bulk bar @ ${width}`);
    await bar.getByRole("button", { name: "حذف" }).click();
    const dlg = page.getByRole("dialog");
    await assertInside(page, dlg, `bulk delete dialog @ ${width}`);
    await assertFits(page, `bulk delete dialog open @ ${width}`);
    await dlg.getByRole("button", { name: "انصراف" }).click();
    await page.getByRole("button", { name: "حذف درخواست E2E Customer 3" }).click();
    await assertInside(page, page.getByRole("dialog"), `single delete dialog @ ${width}`);
    await assertFits(page, `single delete dialog open @ ${width}`);
    await ctx.close();
  });
}

test("Beauty panel on a phone: Quotes screen fits", async () => {
  const { ctx, page } = await phone(360);
  await login(page, "beauty");
  await page.goto(`${BASE}/beauty/operator/quotes`, { waitUntil: "networkidle" });
  await assertFits(page, "beauty quotes @ 360");
  await page.getByLabel(/انتخاب E2E Beauty Customer/).check();
  await assertFits(page, "beauty quotes selected @ 360");
  await ctx.close();
});
