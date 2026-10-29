// End-to-end: the printable catalog (/health/{lang}/print-catalog) and the product-completeness markers.
// Real Chromium: the page lists active products only, in the page language, prints no placeholder data,
// hides the site chrome in print mode, renders to a real multi-page PDF in all four languages, fits a
// phone on screen; and the panel shows which products are still incomplete.
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { BASE, DB, launch, get, resetDb, login, measureInPage } from "./helpers.mjs";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
beforeEach(async () => { await resetDb(); });

const SERVICE = "service-test-key";
async function insert(table, rows) {
  const res = await fetch(`${DB}/rest/v1/${table}`, { method: "POST", headers: { apikey: SERVICE, "content-type": "application/json", prefer: "return=representation" }, body: JSON.stringify(rows) });
  assert.equal(res.status, 201);
}
const stamp = "2026-10-01T10:00:00.000Z";
const full = (n, extra = {}) => ({
  slug: `e2e-full-${n}`, sku: `FULL-${n}`, name_en: `E2E Complete ${n}`, name_ru: `E2E Complete ${n}`, name_tg: `E2E Complete ${n}`, name_fa: `E2E Complete ${n}`,
  description_en: "Complete demo product.", description_ru: "Демо.", description_tg: "Намуна.", description_fa: "نمونه.", price: 12, currency: "USD", unit: "box",
  min_order_qty: 10, brand: "E2E", badge: null, category: "gloves", category_id: 1, in_stock: true, is_active: true, is_featured: false,
  specs: { Size: "M", Material: "Nitrile" }, tags: [], views: 0, image_url: "e2e/full.webp", created_at: stamp, updated_at: stamp, ...extra,
});

test("the printable catalog lists active products only, in the page language, with no placeholder data", async () => {
  const en = await get("/health/en/print-catalog");
  assert.equal(en.status, 200);
  assert.ok(en.text.includes("E2E Product 1") && en.text.includes("E2E Product 3"));
  assert.ok(!en.text.includes("E2E Product 2"), "the archived product must not be printed");
  assert.ok(en.text.includes("E2E-1") && en.text.includes("Product catalog"));
  assert.match(en.text, /<meta name="robots" content="noindex/);
  assert.ok(!/undefined|\bnull\b/.test(en.text.replace(/<script[\s\S]*?<\/script>/g, "")), "no 'undefined' or 'null' text in the document");
  assert.ok(!en.text.includes("+992900000000"), "the placeholder phone number must never be printed");
  assert.match((await get("/robots.txt")).text, /Disallow: \/\*\/print-catalog/);

  const fa = await get("/health/fa/print-catalog");
  assert.equal(fa.status, 200);
  assert.ok(fa.text.includes("کاتالوگ محصولات"));
  assert.match(fa.text, /<div dir="rtl" class="print-doc/);
  const ru = await get("/health/ru/print-catalog");
  assert.ok(ru.text.includes("Каталог товаров"));
  const tg = await get("/health/tg/print-catalog");
  assert.ok(tg.text.includes("Каталоги маҳсулот"));
  assert.equal((await get("/health/zz/print-catalog")).status, 404);
});

test("?category= limits the catalog to that branch; an unknown category is a 404", async () => {
  const gloves = await get("/health/en/print-catalog?category=gloves");
  assert.equal(gloves.status, 200);
  assert.ok(gloves.text.includes("E2E Product 1") && !gloves.text.includes("E2E Product 3"));
  const masks = await get("/health/en/print-catalog?category=masks");
  assert.ok(masks.text.includes("E2E Product 3") && !masks.text.includes("E2E Product 1"));
  assert.equal((await get("/health/en/print-catalog?category=no-such-category")).status, 404);
  assert.equal((await get("/health/en/print-catalog?category=" + "x".repeat(500))).status, 404);
});

test("in print mode the site chrome and the controls are hidden; the PDF is real, multi-page, in all four languages", async () => {
  await insert("products", Array.from({ length: 40 }, (_, i) => full(i + 1)));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  for (const lang of ["en", "ru", "tg", "fa"]) {
    await page.goto(`${BASE}/health/${lang}/print-catalog`, { waitUntil: "networkidle" });
    await page.emulateMedia({ media: "print" });
    const hidden = await page.evaluate(() => ({
      header: [...document.querySelectorAll("header")].every((e) => getComputedStyle(e).display === "none"),
      footer: [...document.querySelectorAll("footer")].every((e) => getComputedStyle(e).display === "none"),
      controls: [...document.querySelectorAll("[data-print-hide]")].every((e) => getComputedStyle(e).display === "none"),
      doc: getComputedStyle(document.querySelector(".print-doc")).display !== "none",
    }));
    assert.deepEqual(hidden, { header: true, footer: true, controls: true, doc: true }, lang);
    const pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-", `${lang}: not a PDF`);
    const raw = pdf.toString("latin1");
    // the page tree's /Count is the page total (Chromium may pack page objects into compressed streams)
    const pages = Math.max(0, ...[...raw.matchAll(/\/Count\s+(\d+)/g)].map((m) => Number(m[1])), (raw.match(/\/Type\s*\/Page\b/g) || []).length);
    assert.ok(pages >= 2, `${lang}: expected several pages, got ${pages}`);
    assert.ok(pdf.length > 20_000, `${lang}: suspiciously small PDF (${pdf.length} bytes)`);
    await page.emulateMedia({ media: "screen" });
  }
  await ctx.close();
});

test("the catalog page links to the printable version with the chosen category", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/health/en/catalog`, { waitUntil: "networkidle" });
  const link = page.getByRole("link", { name: "Printable catalog (PDF)" });
  await link.waitFor();
  assert.equal(await link.getAttribute("href"), "/health/en/print-catalog");
  await ctx.close();
});

test("the printable catalog fits a 320px phone on screen, even with a very long unbroken name", async () => {
  await insert("products", [full(1, { name_en: "W".repeat(150), sku: "S".repeat(70), specs: { ["K".repeat(60)]: "V".repeat(90) } })]);
  const ctx = await browser.newContext({ viewport: { width: 320, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/health/en/print-catalog`, { waitUntil: "networkidle" });
  const res = await page.evaluate(measureInPage);
  assert.equal(res.count, 0, JSON.stringify(res.offenders.slice(0, 3)));
  assert.equal(await page.evaluate(() => { window.scrollTo(300, 0); return window.scrollX; }), 0);
  await ctx.close();
});

test("the panel marks incomplete products: filter, badge and dashboard count", async () => {
  await insert("products", [full(1)]);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await login(page, "health");
  await page.goto(`${BASE}/operator/products`, { waitUntil: "networkidle" });
  const names = async () => (await page.locator("body").innerText());
  // the filter runs on the server now (the address changes, the list is re-rendered): wait for the new list
  await page.getByLabel("تکمیل اطلاعات").selectOption("complete");
  await page.waitForURL(/complete=complete/);
  await page.getByText("E2E Complete 1").first().waitFor();
  assert.ok((await names()).includes("E2E Complete 1"));
  assert.ok(!(await names()).includes("E2E Product 1"));
  await page.getByLabel("تکمیل اطلاعات").selectOption("incomplete");
  await page.waitForURL(/complete=incomplete/);
  await page.getByText("E2E Product 1").first().waitFor();
  assert.ok((await names()).includes("E2E Product 1") && (await names()).includes("E2E Product 3"));
  assert.ok(!(await names()).includes("E2E Complete 1"));
  assert.ok(await page.getByText(/^ناقص: \d+/).count() >= 2, "the badge is shown on incomplete rows");
  const title = await page.getByText(/^ناقص: \d+/).first().getAttribute("title");
  assert.match(title, /تصویر/);

  await page.goto(`${BASE}/operator`, { waitUntil: "networkidle" });
  const card = (await page.getByText("محصولات با اطلاعات ناقص").first().locator("xpath=ancestor::div[2]").innerText()).replace(/\s+/g, " ");
  assert.match(card, /\b2\b/, "two active products are incomplete (the archived one and the complete one do not count)");
  await ctx.close();
});
