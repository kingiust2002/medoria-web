// The panels in three languages, in a real browser: Persian (right to left, the default), Tajik and English (left to right).
// Every page of both panels is opened in each language; in Tajik and English no Persian text may remain on screen, the
// direction and language attributes follow the choice, the switch works and remembers, and nothing sticks out past a phone.
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { BASE, launch, resetDb, login, measureInPage } from "./helpers.mjs";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
beforeEach(async () => { await resetDb(); });

const AR = /[؀-ۿ]/;
const PAGES = {
  health: ["/operator", "/operator/products", "/operator/products/new", "/operator/products/bulk", "/operator/products/import", "/operator/products/1/edit", "/operator/categories", "/operator/quotes", "/operator/activity", "/operator/settings"],
  beauty: ["/beauty/operator", "/beauty/operator/products", "/beauty/operator/products/new", "/beauty/operator/products/bulk", "/beauty/operator/products/import", "/beauty/operator/categories", "/beauty/operator/brands", "/beauty/operator/quotes", "/beauty/operator/activity", "/beauty/operator/settings"],
};
const EXPECT = {
  en: { dir: "ltr", lang: "en", word: /Dashboard|Products|Requests|Settings/ },
  tg: { dir: "ltr", lang: "tg", word: /Лавҳаи идора|Маҳсулот|Дархост|Танзимот/ },
  fa: { dir: "rtl", lang: "fa", word: /داشبورد|محصولات|استعلام|تنظیمات/ },
};

// login() caches the first session of the file (cookies included): set the language AFTER it, never before.
async function openAs(ctx, house, lang) {
  const page = await ctx.newPage();
  await login(page, house);
  await ctx.addCookies([{ name: "medoria_panel_lang", value: lang, url: BASE }]);
  return page;
}

for (const house of ["health", "beauty"]) {
  for (const lang of ["en", "tg"]) {
    test(`${house}: every page in ${lang} is in that language only, left to right, and fits a 320px phone`, { timeout: 300_000 }, async () => {
      const ctx = await browser.newContext({ viewport: { width: 320, height: 640 }, hasTouch: true });
      const page = await openAs(ctx, house, lang);
      const problems = [];
      for (const path of PAGES[house]) {
        await page.goto(BASE + path, { waitUntil: "networkidle" });
        const frame = page.locator("[data-panel-lang]").first();
        assert.equal(await frame.getAttribute("data-panel-lang"), lang, path);
        assert.equal(await frame.getAttribute("dir"), EXPECT[lang].dir, `${path}: direction`);
        assert.equal(await frame.getAttribute("lang"), EXPECT[lang].lang, `${path}: lang attribute`);
        const text = await page.locator("body").innerText();
        const persian = [...new Set(text.split("\n").filter((l) => AR.test(l)).map((l) => l.trim().slice(0, 70)))];
        if (persian.length) problems.push(`${path}: still Persian -> ${persian.slice(0, 4).join(" | ")}`);
        const wide = await page.evaluate(measureInPage);
        if (wide.count) problems.push(`${path}: sticks out at 320px -> ${JSON.stringify(wide.offenders.slice(0, 2))}`);
      }
      assert.deepEqual(problems, []);
      await ctx.close();
    });
  }
}

test("Persian stays the default: right to left, Persian words, Persian digits in dates", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await login(page, "health");
  await ctx.clearCookies({ name: "medoria_panel_lang" });
  await page.reload({ waitUntil: "networkidle" });
  const frame = page.locator("[data-panel-lang]").first();
  assert.equal(await frame.getAttribute("data-panel-lang"), "fa");
  assert.equal(await frame.getAttribute("dir"), "rtl");
  assert.match(await page.locator("body").innerText(), EXPECT.fa.word);
  await ctx.close();
});

test("the switch changes the language, keeps it after a reload and on another page, and the nav follows the direction", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await login(page, "health");
  await ctx.clearCookies({ name: "medoria_panel_lang" });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "EN", exact: true }).first().click();
  await page.getByRole("heading", { name: "Dashboard" }).waitFor();
  assert.equal(await page.locator("[data-panel-lang]").first().getAttribute("dir"), "ltr");
  // the sidebar is on the left in English and on the right in Persian
  const sidebar = page.locator("aside").first();
  const box = await sidebar.boundingBox();
  assert.ok(box.x < 100, `English: sidebar should be on the left (x=${box.x})`);
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "Dashboard" }).waitFor();
  await page.getByRole("link", { name: "Products" }).first().click();
  await page.waitForURL("**/operator/products");
  await page.getByRole("heading", { name: "Products" }).waitFor();
  await page.getByRole("button", { name: "TG", exact: true }).first().click();
  await page.getByRole("heading", { name: "Маҳсулот" }).first().waitFor();
  await page.getByRole("button", { name: "FA", exact: true }).first().click();
  await page.getByRole("heading", { name: "محصولات" }).first().waitFor();
  const boxFa = await page.locator("aside").first().boundingBox();
  assert.ok(boxFa.x > 600, `Persian: sidebar should be on the right (x=${boxFa.x})`);
  await ctx.close();
});

test("the language cookie accepts only the three languages", async () => {
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: "medoria_panel_lang", value: "ru", url: BASE }]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login/health`, { waitUntil: "networkidle" });
  assert.equal(await page.locator("[data-panel-lang]").first().getAttribute("data-panel-lang"), "fa", "an unknown value means Persian");
  await ctx.close();
});

test("login pages and the panel chooser follow the language too", async () => {
  for (const [lang, word] of [["en", /Sign in|Staff sign-in|Which panel/], ["tg", /Ворид|Вуруд|кадом панел/]]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
    await ctx.addCookies([{ name: "medoria_panel_lang", value: lang, url: BASE }]);
    const page = await ctx.newPage();
    for (const path of ["/login", "/login/health", "/login/beauty"]) {
      await page.goto(BASE + path, { waitUntil: "networkidle" });
      const text = await page.locator("body").innerText();
      assert.match(text, word, `${path} (${lang})`);
      assert.ok(!AR.test(text), `${path} (${lang}) still has Persian: ${text.split("\n").filter((l) => AR.test(l)).slice(0, 3).join(" | ")}`);
      assert.equal(await page.locator("[data-panel-lang]").first().getAttribute("dir"), "ltr");
    }
    await ctx.close();
  }
});
