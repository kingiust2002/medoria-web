// Server-side paging in a real browser (N1, docs/PANEL_LIST_PAGING.md): the product and request lists of both panels page, search, filter and
// count over ALL rows — 2,600 products and 1,300 requests, more than the old caps and more than the 1,000 rows the (fake) API returns per
// request. The state lives in the address, the list works without JavaScript, and the pager fits a 320 px phone.
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { BASE, DB, launch, state, resetDb, login, measureInPage } from "./helpers.mjs";
import { productGaps } from "../../lib/operator/completeness.js";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
beforeEach(async () => { await resetDb(); });

const SERVICE = "service-test-key";
const ts = "2026-10-01T10:00:00.000Z";
const digits = (s) => String(s).replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[,،٬\s]/g, "");
async function insert(table, rows) {
  for (let i = 0; i < rows.length; i += 400) {
    const res = await fetch(`${DB}/rest/v1/${table}`, { method: "POST", headers: { apikey: SERVICE, "content-type": "application/json", prefer: "return=representation" }, body: JSON.stringify(rows.slice(i, i + 400)) });
    assert.equal(res.status, 201);
  }
}
const product = (i, house = "health") => ({
  id: 1000 + i, slug: `p-${house}-${i}`, sku: `PG-${String(i).padStart(5, "0")}`, name_en: `Paged ${house} ${String(i).padStart(5, "0")}`, name_fa: `کالای ${i}`, name_ru: i % 4 ? null : `Тов ${i}`, name_tg: i % 4 ? "" : `Мањ ${i}`,
  description_en: i % 4 ? "" : "d", description_fa: i % 4 ? null : "d", description_ru: i % 4 ? null : "d", description_tg: i % 4 ? null : "d",
  price: i % 9 ? 10 + i : null, currency: "USD", unit: "box", min_order_qty: 1, brand: i % 3 ? "Zeta" : "Acme", badge: null, category: house === "health" ? "gloves" : null, category_id: 1,
  in_stock: i % 3 !== 0, is_active: i % 10 !== 0, is_featured: false, specs: i % 4 ? {} : { a: 1 }, tags: [], views: 0, image_url: i % 4 ? null : `p/${i}.jpg`,
  created_at: ts, updated_at: new Date(Date.UTC(2026, 9, 1, 0, 0, 0) + i * 60_000).toISOString(),
});
const quote = (i, house = "health") => ({
  id: 1000 + i, status: ["new", "contacted", "quoted", "closed", "archived", "spam"][i % 6], tracking_code: `${house === "health" ? "MH" : "MB"}-PG${String(i).padStart(5, "0")}`, assigned_to: i % 5 ? null : "Sara",
  first_response_at: null, notify_status: i % 11 === 0 ? "failed" : "sent", name: `Paged Customer ${i}`, organization: "", phone: `+9929${String(i % 90000).padStart(8, "0")}`, product_name: null, preferred_contact: "whatsapp", language: "en",
  message: "m", internal_notes: "", created_at: new Date(Date.UTC(2026, 9, 1, 0, 0, 0) - i * 60_000).toISOString(), updated_at: ts,
});
const makeCategories = (house) => (house === "beauty" ? [{ id: 1, slug: "skincare-cream", name_en: "Cream", name_ru: "C", name_tg: "C", name_fa: "کرم", icon: "x", is_active: true, is_featured: false, sort_order: 1, parent_id: null, world: "skincare", created_at: ts }] : []);
async function seedProducts(n, house = "health") { await insert(house === "beauty" ? "beauty_products" : "products", Array.from({ length: n }, (_, k) => product(k + 1, house))); if (house === "beauty") await insert("beauty_categories", makeCategories("beauty")); }
const range = async (page) => digits(await page.getByTestId("list-range").innerText());
const base = (house) => `${BASE}${house === "beauty" ? "/beauty/operator" : "/operator"}`;

test("2,600 products: exact total, every page reachable, deep search, filters and sort run on the server, state is in the address", async () => {
  await seedProducts(2600);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await login(page, "health");
  await page.goto(`${base("health")}/products`, { waitUntil: "networkidle" });
  // total: the three seeded demo products + 2,600
  const total = 2603;
  assert.match(digits(await page.locator("h1").first().locator("xpath=..").innerText()), new RegExp(`${total}`), "the subtitle shows the exact total");
  assert.match(await range(page), new RegExp(`1.*25.*${total}`));
  assert.equal(await page.locator("input[type=checkbox]").count(), 26, "25 rows + select-all");
  // the last page by its address
  await page.goto(`${base("health")}/products?page=105`, { waitUntil: "networkidle" });
  assert.match(await range(page), new RegExp(`2601.*${total}`));
  // beyond the end → the last page that exists (never an empty screen)
  await page.goto(`${base("health")}/products?page=99999`, { waitUntil: "networkidle" });
  assert.match(await range(page), new RegExp(`${total}`));
  // search for a product that is far beyond the old 2,000-row cap
  await page.goto(`${base("health")}/products`, { waitUntil: "networkidle" });
  await page.getByPlaceholder("جستجوی نام، SKU یا برند…").fill("PG-02599");
  await page.waitForURL(/q=PG-02599/);
  await page.getByText("PG-02599").first().waitFor();
  assert.match(await range(page), /1.*1.*1/);
  // a filter combination equals the same rule computed over the whole table
  const all = (await state()).products;
  const want = all.filter((p) => p.is_active !== false && !p.in_stock && productGaps(p).length > 0).length;
  await page.goto(`${base("health")}/products?status=active&stock=out&complete=incomplete`, { waitUntil: "networkidle" });
  assert.match(await range(page), new RegExp(`${want}`));
  // changing a filter keeps the others and returns to page 1
  await page.goto(`${base("health")}/products?page=3&status=active`, { waitUntil: "networkidle" });
  await page.getByLabel("موجودی").selectOption("in");
  await page.waitForURL(/stock=in/);
  assert.ok(!/page=/.test(page.url()), `the page number was kept: ${page.url()}`);
  assert.match(page.url(), /status=active/);
  // the reload shows the same list
  const before = await range(page);
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await range(page), before);
  await ctx.close();
});

test("the product list works without JavaScript: rows, pager links and search form are server-rendered", async () => {
  await seedProducts(300);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await login(page, "health");
  const cookies = await ctx.cookies();
  const plain = await browser.newContext({ javaScriptEnabled: false });
  await plain.addCookies(cookies);
  const p = await plain.newPage();
  await p.goto(`${base("health")}/products?page=2&size=50&q=PG-001`, { waitUntil: "load" });
  assert.match(await p.getByTestId("list-range").innerText().then(digits), /\d+/);
  assert.ok((await p.locator("a[rel=next], a[rel=prev]").count()) >= 1 || (await p.getByTestId("list-pager").count()) === 1);
  assert.ok((await p.getByText("PG-00100").count()) + (await p.getByText("PG-00101").count()) > 0, "rows are in the HTML");
  await plain.close(); await ctx.close();
});

test("1,300 requests: exact tab counts, deep search, the follow-up filter and paging", async () => {
  await insert("quote_requests", Array.from({ length: 1300 }, (_, k) => quote(k + 1)));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await login(page, "health");
  const all = (await state()).quote_requests;
  const active = all.filter((q) => q.status !== "archived" && q.status !== "spam").length;
  await page.goto(`${base("health")}/quotes`, { waitUntil: "networkidle" });
  const tabs = digits(await page.getByRole("tablist").innerText());
  assert.match(tabs, new RegExp(`${active}`), "the active tab count is exact over all requests");
  assert.match(tabs, new RegExp(`${all.length}`), "so is the all tab");
  assert.match(await range(page), new RegExp(`${active}`));
  // a request that is far past the old 1,500 newest? search by its code
  await page.getByPlaceholder("جستجو: نام، تلفن، محصول، کد پیگیری…").fill("MH-PG01291");
  await page.waitForURL(/q=MH-PG01291/);
  await page.getByText("Paged Customer 1291").waitFor();
  // the tab lives in the address too
  await page.goto(`${base("health")}/quotes?tab=archived`, { waitUntil: "networkidle" });
  assert.match(await range(page), new RegExp(`${all.filter((q) => q.status === "archived").length}`));
  // "needs follow-up": unanswered > 24 h or a failed notice
  await page.goto(`${base("health")}/quotes?attention=1&tab=all`, { waitUntil: "networkidle" });
  assert.ok((await page.getByTestId("list-range").count()) === 1);
  await ctx.close();
});

test("Beauty: its own products and requests page the same way, the brand link pre-fills the search, nothing of Health leaks in", async () => {
  await seedProducts(800, "beauty");
  await insert("beauty_quote_requests", Array.from({ length: 300 }, (_, k) => quote(k + 1, "beauty")));
  await insert("products", [product(1, "health")]);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await login(page, "beauty");
  await page.goto(`${base("beauty")}/products`, { waitUntil: "networkidle" });
  assert.match(await range(page), /800/);
  await page.goto(`${base("beauty")}/products?brand=Acme`, { waitUntil: "networkidle" });
  const acme = (await state()).beauty_products.filter((p) => p.brand === "Acme").length;
  assert.match(await range(page), new RegExp(`${acme}`));
  await page.goto(`${base("beauty")}/products?world=skincare&complete=incomplete`, { waitUntil: "networkidle" });
  const bp = (await state()).beauty_products.filter((p) => productGaps(p).length > 0).length;
  assert.match(await range(page), new RegExp(`${bp}`));
  await page.goto(`${base("beauty")}/quotes`, { waitUntil: "networkidle" });
  const aq = (await state()).beauty_quote_requests.filter((q) => q.status !== "archived" && q.status !== "spam").length;
  assert.match(await range(page), new RegExp(`${aq}`));
  assert.ok(!(await page.content()).includes("Paged health"), "Health rows in the Beauty list");
  await ctx.close();
});

test("an unreadable list says so (never an empty list); a Health session cannot page the Beauty lists", async () => {
  await seedProducts(40);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await login(page, "health");
  await fetch(`${DB}/__fault`, { method: "POST", body: JSON.stringify({ table: "products", method: "GET", status: 500, code: "57014", message: "timeout" }) });
  await page.goto(`${base("health")}/products`, { waitUntil: "networkidle" });
  await page.getByTestId("list-error").waitFor();
  assert.equal(await page.getByText("محصولی یافت نشد").count(), 0, "a failed read must not look like an empty catalogue");
  await fetch(`${DB}/__fault/clear`, { method: "POST" });
  const res = await page.goto(`${base("beauty")}/products`, { waitUntil: "networkidle" });
  assert.ok(/login/.test(page.url()) || res.status() !== 200, "a Health session opened the Beauty list");
  await ctx.close();
});

test("the pager and the filter bar fit a 320 px phone in both panels", async () => {
  await seedProducts(400);
  await insert("quote_requests", Array.from({ length: 200 }, (_, k) => quote(k + 1)));
  const ctx = await browser.newContext({ viewport: { width: 320, height: 700 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  await login(page, "health");
  for (const path of ["/products?page=2&size=50", "/quotes?page=2"]) {
    await page.goto(`${base("health")}${path}`, { waitUntil: "networkidle" });
    const res = await page.evaluate(measureInPage);
    assert.equal(res.count, 0, `${path}: ${JSON.stringify(res.offenders.slice(0, 3))}`);
    assert.equal(await page.evaluate(() => { window.scrollTo(300, 0); return window.scrollX; }), 0, `${path} scrolls sideways`);
  }
  await ctx.close();
});
