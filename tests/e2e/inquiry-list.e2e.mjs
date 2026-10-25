// End-to-end: the inquiry list (several products, one request). Real Chromium, production build, fake database.
// Add from the catalog cards → header count → review and set quantities → send ONE request → stored with
// names/SKUs from the database; a tampered list (archived and unknown ids) is cleaned; the operator panel shows
// the products; the page fits a 320px phone with a very long product name.
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { BASE, DB, launch, state, resetDb, poll, login, measureInPage } from "./helpers.mjs";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
beforeEach(async () => { await resetDb(); });

const SERVICE = "service-test-key";
async function insert(table, rows) {
  const res = await fetch(`${DB}/rest/v1/${table}`, { method: "POST", headers: { apikey: SERVICE, "content-type": "application/json", prefer: "return=representation" }, body: JSON.stringify(rows) });
  assert.equal(res.status, 201);
  return res.json();
}
async function solveCaptcha(page) {
  const q = page.locator('span[aria-live="polite"]').filter({ hasText: /\d\s*[+−-]\s*\d/ });
  await q.waitFor({ timeout: 15000 });
  const m = (await q.innerText()).match(/(\d+)\s*([+−-])\s*(\d+)/);
  const [a, op, b] = [Number(m[1]), m[2], Number(m[3])];
  return String(op === "+" ? a + b : a - b);
}
const listOf = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("medoria.inquiry.health.v1") || "[]"));

test("add two products from the catalog, set quantities, send one request", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => { window.__opened = []; window.open = (u) => { window.__opened.push(String(u)); return null; }; });   // record the messenger link instead of leaving the page
  const page = await ctx.newPage();
  await page.goto(`${BASE}/health/en/catalog`, { waitUntil: "networkidle" });

  const add = page.getByRole("button", { name: "Add to inquiry list" });
  await add.first().waitFor();
  assert.equal(await add.count(), 2, "two active products, two buttons");
  await add.first().click();
  await add.first().click();
  assert.equal(await page.getByRole("link", { name: "In your inquiry list" }).count(), 2);
  await poll(async () => (await listOf(page)).length === 2, { label: "two ids in the list" });
  assert.match(await page.getByRole("link", { name: "Inquiry list", exact: true }).first().innerText(), /2/, "the header count shows 2");

  // survives a reload; then open the list from the header
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.getByRole("link", { name: "In your inquiry list" }).count(), 2);
  await page.getByRole("link", { name: "Inquiry list", exact: true }).first().click();
  await page.waitForURL(/\/health\/en\/inquiry/);
  await page.getByText("E2E Product 1").first().waitFor();
  assert.equal(await page.getByLabel("Quantity").count(), 2);

  await page.getByLabel("Quantity").nth(0).fill("50");
  await page.getByLabel("Quantity").nth(1).fill("7");
  const [first, second] = await listOf(page);
  assert.deepEqual([first.qty, second.qty].sort((a, b) => a - b), [7, 50]);

  const form = page.locator("form");
  await form.locator("input[required]").nth(0).fill("E2E List Visitor");
  await form.locator('input[type="tel"]').fill("+992900111222");
  await form.locator("textarea").fill("Please quote both.");
  await form.locator("input[required]").last().fill(await solveCaptcha(page));
  await form.locator('button[type="submit"]').click();
  await poll(async () => (await state()).quote_requests.some((q) => q.name === "E2E List Visitor"), { label: "the request to be stored" });

  const row = (await state()).quote_requests.find((q) => q.name === "E2E List Visitor");
  assert.equal(row.items.length, 2);
  assert.deepEqual(row.items.map((i) => i.name).sort(), ["E2E Product 1", "E2E Product 3"]);
  assert.deepEqual(row.items.map((i) => i.quantity).sort((a, b) => a - b), [7, 50]);
  assert.deepEqual(row.items.map((i) => i.sku).sort(), ["E2E-1", "E2E-3"], "SKUs come from the database");
  assert.equal(row.quantity ?? null, null);
  assert.equal(row.product_id ?? null, null);
  assert.match(row.product_name, /^E2E Product \d \+1$/);
  assert.equal(row.message, "Please quote both.");

  // the messenger hand-off carries the whole list
  await poll(async () => (await page.evaluate(() => window.__opened)).length === 1, { label: "the messenger link" });
  const link = decodeURIComponent((await page.evaluate(() => window.__opened))[0]);
  assert.match(link, /E2E Product 1 ?\(E2E-1\) × 50/);
  assert.match(link, /E2E Product 3 ?\(E2E-3\) × 7/);
  // the list is emptied after sending
  await page.getByText(/request|sent|thank/i).first().waitFor({ timeout: 10000 });
  assert.deepEqual(await listOf(page), []);
  await ctx.close();
});

test("a tampered list is cleaned: archived and unknown ids never reach a request", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx.addInitScript(() => { if (!localStorage.getItem("medoria.inquiry.health.v1")) localStorage.setItem("medoria.inquiry.health.v1", JSON.stringify([{ id: 1, qty: 3 }, { id: 2, qty: 9 }, { id: 99999, qty: 1 }, { id: "x", qty: 1 }, { id: 1, qty: 5 }])); });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/health/en/inquiry`, { waitUntil: "networkidle" });
  await page.getByText("E2E Product 1").first().waitFor();
  assert.equal(await page.getByLabel("Quantity").count(), 1, "only the active product is listed (product 2 is archived)");
  await page.getByText(/no longer available/i).waitFor();
  await poll(async () => (await listOf(page)).length === 1, { label: "stored list cleaned" });
  assert.deepEqual(await listOf(page), [{ id: 1, qty: 3 }]);
  await ctx.close();
});

test("the operator panel shows the products of a list request", async () => {
  await insert("quote_requests", [{ name: "E2E Panel Lister", status: "new", phone: "+992900000099", preferred_contact: "whatsapp", language: "en", message: "", product_name: "Gloves +1", created_at: "2026-10-20T10:00:00.000Z",
    items: [{ product_id: 1, sku: "E2E-1", name: "E2E Product 1", quantity: 50 }, { product_id: 3, sku: "E2E-3", name: "E2E Product 3", quantity: 7 }] }]);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await login(page, "health");
  await page.goto(`${BASE}/operator/quotes`, { waitUntil: "networkidle" });
  await page.getByText("E2E Panel Lister").first().click();
  await page.getByText("محصولات درخواستی (2)").waitFor();
  const box = page.locator("li").filter({ hasText: "E2E Product 1" });
  assert.match(await box.innerText(), /E2E-1/);
  assert.match(await box.innerText(), /50/);
  await ctx.close();
});

test("the inquiry page fits a 320px phone with a very long unbroken product name", async () => {
  const [p] = await insert("products", [{ slug: "e2e-long-name", sku: "L".repeat(60), name_en: "W".repeat(140), name_ru: "W".repeat(140), name_tg: "W".repeat(140), name_fa: "W".repeat(140), description_en: "", price: null, currency: "USD", unit: "box", min_order_qty: 1, brand: "E2E", badge: null, category: "gloves", category_id: 1, in_stock: true, is_active: true, is_featured: false, specs: {}, tags: [], views: 0, image_url: null, created_at: "2026-10-01T10:00:00.000Z", updated_at: "2026-10-01T10:00:00.000Z" }]);
  const ctx = await browser.newContext({ viewport: { width: 320, height: 800 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ctx.addInitScript((id) => localStorage.setItem("medoria.inquiry.health.v1", JSON.stringify([{ id, qty: 1000000 }, { id: 1, qty: 12 }])), p.id);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/health/en/inquiry`, { waitUntil: "networkidle" });
  await page.getByText("E2E Product 1").first().waitFor();
  const res = await page.evaluate(measureInPage);
  assert.equal(res.count, 0, JSON.stringify(res.offenders.slice(0, 3)));
  assert.equal(await page.evaluate(() => { window.scrollTo(300, 0); return window.scrollX; }), 0);
  // the mobile menu offers the list
  await page.goto(`${BASE}/health/en`, { waitUntil: "networkidle" });
  await page.locator('button[aria-label="Menu"]').click();
  await page.getByRole("link", { name: /Inquiry list/ }).last().waitFor();
  await ctx.close();
});

test("the Health list does not touch another house's storage key, and the page is closed to search engines", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/health/en/catalog`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Add to inquiry list" }).first().click();
  const keys = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("medoria.inquiry")));
  assert.deepEqual(keys, ["medoria.inquiry.health.v1"]);
  const robots = await (await fetch(`${BASE}/robots.txt`)).text();
  assert.match(robots, /Disallow: \/\*\/inquiry/);
  const html = await (await fetch(`${BASE}/health/en/inquiry`)).text();
  assert.match(html, /<meta name="robots" content="noindex/);
  await ctx.close();
});
