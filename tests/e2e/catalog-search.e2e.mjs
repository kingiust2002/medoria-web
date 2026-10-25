// End-to-end: server-side catalog search and paging. 60 extra Health products and 30 Beauty products are
// added to the fake database for each test (the seed is restored before the next one). Proves in a real
// browser: the Health catalog fetches pages (never the whole table), "load more" appends the next page
// without repeats, search is answered by the database, the Beauty catalog pages with plain links that work
// without JavaScript, a page past the end goes back to page 1, and the pager fits a 320px phone.
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { BASE, DB, launch, dbLog, resetDb, poll, get, measureInPage } from "./helpers.mjs";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
beforeEach(async () => { await resetDb(); });

const SERVICE = "service-test-key";
async function insert(table, rows) {
  const res = await fetch(`${DB}/rest/v1/${table}`, { method: "POST", headers: { apikey: SERVICE, "content-type": "application/json", prefer: "return=representation" }, body: JSON.stringify(rows) });
  assert.equal(res.status, 201, `insert into ${table}`);
}
const stamp = "2026-10-01T10:00:00.000Z";
const healthRow = (n) => ({
  slug: `e2e-bulk-${n}`, sku: `BULK-${n}`, name_en: `E2E Bulk ${n}`, name_ru: `E2E Bulk ${n}`, name_tg: `E2E Bulk ${n}`, name_fa: `E2E Bulk ${n}`,
  description_en: "Bulk demo product.", price: 5 + (n % 20), currency: "USD", unit: "box", min_order_qty: 1, brand: n % 2 ? "Alpha" : "Beta", badge: null,
  category: "gloves", category_id: 1, in_stock: true, is_active: true, is_featured: false, specs: {}, tags: [], views: n, image_url: null, created_at: stamp, updated_at: stamp,
});
const beautyRow = (n) => ({
  slug: `e2e-glow-${n}`, sku: `GLOW-${n}`, name_en: `E2E Glow ${n}`, name_ru: `E2E Glow ${n}`, name_tg: `E2E Glow ${n}`, name_fa: `E2E Glow ${n}`,
  description_en: "Beauty demo product.", price: 10 + n, currency: "USD", unit: "pcs", brand: "Lumen", badge: null,
  category_id: null, in_stock: true, is_active: true, is_featured: false, specs: {}, tags: [], views: 0, image_url: null, created_at: stamp, updated_at: stamp,
});

// Distinct product links in the page's list (a card can have several anchors to the same product).
const productLinks = (page, base) => page.evaluate((b) => [...new Set([...document.querySelectorAll(`a[href^="${b}"]`)].map((a) => a.getAttribute("href")).filter((h) => h && !h.includes("?") && h !== b && !h.endsWith("/")))], base);

test("Health catalog: pages of 24 from the database, load more appends without repeats, never the whole table", async () => {
  await insert("products", Array.from({ length: 60 }, (_, i) => healthRow(i + 1)));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/health/en/catalog`, { waitUntil: "networkidle" });
  const base = "/health/en/catalog/";
  await poll(async () => (await productLinks(page, base)).length === 24, { label: "first page of 24 cards" });
  const total = 60 + 2;   // + the two active seeded products
  assert.ok((await page.content()).includes(String(total)), "the exact total is shown");

  // load more twice → 48, then all 62; no product repeated
  const more = page.getByRole("button", { name: /load more/i });
  await more.click();
  await poll(async () => (await productLinks(page, base)).length === 48, { label: "48 cards" });
  await more.click();
  await poll(async () => (await productLinks(page, base)).length === total, { label: "all cards" });
  assert.equal(new Set(await productLinks(page, base)).size, total);
  assert.equal(await more.count(), 0, "no 'load more' once everything is shown");

  // what the browser asked the database for: bounded pages, counted, with a stable sort
  const reqs = (await dbLog()).filter((l) => /\/rest\/v1\/products/.test(l.path) && l.kind === "anon" && l.method === "GET");
  const pageReqs = reqs.filter((l) => /count=/.test(l.query) || /offset=/.test(l.query));
  assert.ok(reqs.length > 0);
  assert.ok(reqs.every((l) => !/limit=500\b/.test(l.query)), "the catalog must not fetch up to 500 rows");
  assert.ok(reqs.some((l) => /offset=24/.test(l.query) && /limit=24/.test(l.query)), `page 2 request missing: ${reqs.map((l) => l.query).join(" | ")}`);
  assert.ok(pageReqs.length >= 3);
  assert.ok(reqs.every((l) => /order=[^&]*id\.asc/.test(decodeURIComponent(l.query)) || !/order=/.test(l.query) || /select=brand/.test(l.query)), "every ordered request ends with the id");
  await ctx.close();
});

test("Health catalog: search is answered by the database and ignores stale answers", async () => {
  await insert("products", Array.from({ length: 60 }, (_, i) => healthRow(i + 1)));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/health/en/catalog`, { waitUntil: "networkidle" });
  await poll(async () => (await productLinks(page, "/health/en/catalog/")).length === 24, { label: "first page" });

  const box = page.locator('input[placeholder]').first();
  await box.fill("Bulk 17");
  await poll(async () => (await productLinks(page, "/health/en/catalog/")).join() === "/health/en/catalog/e2e-bulk-17", { label: "only 'E2E Bulk 17' left" });
  // typing something else quickly: only the last text's answer remains
  await box.fill("BULK-4");
  await box.fill("BULK-41");
  await poll(async () => (await productLinks(page, "/health/en/catalog/")).join() === "/health/en/catalog/e2e-bulk-41", { label: "only BULK-41 left" });
  await box.fill("zzzz-no-such-thing");
  await page.getByText(/no (products|results)/i).first().waitFor({ timeout: 10000 });
  assert.equal((await productLinks(page, "/health/en/catalog/")).length, 0);
  // a hostile search text neither breaks the page nor the query
  await box.fill('x,name_en.eq.1),or(id.gt.0');
  await page.waitForTimeout(700);
  assert.equal((await productLinks(page, "/health/en/catalog/")).length, 0);
  assert.equal(await page.getByText(/could not load/i).count(), 0, "a hostile text must not be a database error");
  const log = (await dbLog()).filter((l) => /\/rest\/v1\/products/.test(l.path) && l.kind === "anon");
  assert.ok(log.every((l) => (decodeURIComponent(l.query).match(/\bor=/g) || []).length <= 2));
  await ctx.close();
});

test("search palette asks for 6 matches at a time instead of loading the catalog", async () => {
  await insert("products", Array.from({ length: 60 }, (_, i) => healthRow(i + 1)));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/health/en`, { waitUntil: "networkidle" });
  const before = (await dbLog()).length;
  await page.keyboard.press("Control+k");
  const input = page.locator('div[role="dialog"] input').first();
  await input.waitFor({ timeout: 10000 });
  await input.fill("BULK-3");
  await page.locator('div[role="dialog"]').getByText("E2E Bulk 3", { exact: true }).first().waitFor({ timeout: 10000 });
  const reqs = (await dbLog()).slice(before).filter((l) => /\/rest\/v1\/products/.test(l.path) && l.kind === "anon");
  assert.ok(reqs.some((l) => /limit=6\b/.test(l.query)), `no 6-row search request: ${reqs.map((l) => l.query).join(" | ")}`);
  assert.ok(reqs.every((l) => !/limit=500\b/.test(l.query)));
  await ctx.close();
});

test("Beauty catalog: plain-link paging, page past the end goes back to page 1, works without JavaScript", async () => {
  await insert("beauty_products", Array.from({ length: 30 }, (_, i) => beautyRow(i + 1)));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, javaScriptEnabled: false });
  const page = await ctx.newPage();
  const base = "/beauty/en/catalog/";

  await page.goto(`${BASE}/beauty/en/catalog?sort=newest`, { waitUntil: "load" });
  assert.equal((await productLinks(page, base)).length, 24);
  const nav = page.getByRole("navigation", { name: "Pages" });
  assert.equal(await nav.getByRole("link", { name: "Page 2" }).count(), 1);
  assert.equal(await nav.locator('[aria-current="page"]').innerText(), "1");
  assert.equal(await nav.getByRole("link", { name: "Previous" }).count(), 0);
  assert.ok((await page.content()).includes(">30<"), "the exact total (30) is shown");

  // page 2 by clicking the link: the remaining 6, no overlap with page 1
  const first = await productLinks(page, base);
  await nav.getByRole("link", { name: "Page 2" }).click();
  await page.waitForURL(/page=2/);
  const second = await productLinks(page, base);
  assert.equal(second.length, 6);
  assert.equal(second.filter((h) => first.includes(h)).length, 0, "page 2 repeats nothing from page 1");
  assert.match(page.url(), /sort=newest/, "paging keeps the other filters");
  assert.equal(await nav.getByRole("link", { name: "Next" }).count(), 0);
  await nav.getByRole("link", { name: "Previous" }).click();
  await page.waitForURL((u) => !/page=/.test(u.search));

  // a filter change returns to page 1; a page past the end redirects to page 1
  await page.goto(`${BASE}/beauty/en/catalog?sort=newest&page=99`, { waitUntil: "load" });
  assert.ok(!/page=99/.test(page.url()), `still on ${page.url()}`);
  assert.equal((await productLinks(page, base)).length, 24);
  for (const bad of ["abc", "-1", "0", "1e9", "2147483648"]) {
    const r = await get(`/beauty/en/catalog?sort=popular&page=${bad}`);
    assert.equal(r.status, 200, `?page=${bad}`);
  }
  await ctx.close();
});

test("search + brand filters on the Beauty catalog are answered by the database too", async () => {
  await insert("beauty_products", Array.from({ length: 30 }, (_, i) => beautyRow(i + 1)));
  const r = await get("/beauty/en/catalog?q=GLOW-7&sort=popular");
  assert.equal(r.status, 200);
  assert.ok(r.text.includes("E2E Glow 7"), "the match is listed");
  assert.ok(!r.text.includes("E2E Glow 8"), "the others are not");
  const none = await get("/beauty/en/catalog?brand=NoSuchBrand&sort=popular");
  assert.equal(none.status, 200);
  assert.ok(!none.text.includes("E2E Glow"));
});

test("the pagers and the long catalog fit a 320px phone", async () => {
  await insert("products", Array.from({ length: 60 }, (_, i) => healthRow(i + 1)));
  await insert("beauty_products", Array.from({ length: 30 }, (_, i) => beautyRow(i + 1)));
  const ctx = await browser.newContext({ viewport: { width: 320, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  for (const url of ["/beauty/en/catalog?sort=price_asc", "/beauty/en/catalog?sort=price_asc&page=2", "/beauty/fa/catalog?sort=price_asc&page=2"]) {
    await page.goto(BASE + url, { waitUntil: "networkidle" });
    const res = await page.evaluate(measureInPage);
    assert.equal(res.count, 0, `${url}: ${JSON.stringify(res.offenders.slice(0, 3))}`);
  }
  await page.goto(`${BASE}/health/en/catalog`, { waitUntil: "networkidle" });
  await poll(async () => (await productLinks(page, "/health/en/catalog/")).length === 24, { label: "first page" });
  await page.getByRole("button", { name: /load more/i }).click();
  await poll(async () => (await productLinks(page, "/health/en/catalog/")).length === 48, { label: "48 cards" });
  const res = await page.evaluate(measureInPage);
  assert.equal(res.count, 0, JSON.stringify(res.offenders.slice(0, 3)));
  assert.equal(await page.evaluate(() => { window.scrollTo(300, 0); return window.scrollX; }), 0);
  await ctx.close();
});
