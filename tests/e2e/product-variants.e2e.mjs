// Product variants in a real browser, both houses (docs/PANEL_VARIANTS.md): a variant is added on its product's edit page, appears nowhere as a
// product of its own (panel list, public catalogue), is chosen on the public product page where price / SKU / stock follow the choice, a
// duplicate SKU is refused in words, an archived variant can be deleted with its SKU, and the form fits a 320 px phone.
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { BASE, DB, launch, state, resetDb, poll, login, get, measureInPage } from "./helpers.mjs";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
beforeEach(async () => { await resetDb(); });

const SERVICE = "service-test-key";
const ts = "2026-10-01T10:00:00.000Z";
async function insert(table, rows) {
  const res = await fetch(`${DB}/rest/v1/${table}`, { method: "POST", headers: { apikey: SERVICE, "content-type": "application/json", prefer: "return=representation" }, body: JSON.stringify(rows) });
  assert.equal(res.status, 201);
  return res.json();
}
const beautyProduct = { id: 11, slug: "e2e-serum", sku: "B-11", name_en: "E2E Serum", name_fa: "E2E Serum", name_ru: "E2E Serum", name_tg: "E2E Serum", price: 30, in_stock: true, is_active: true, brand: "Luxe", unit: "pcs", min_order_qty: 1, specs: {}, tags: [], gallery_urls: [], created_at: ts, updated_at: ts };

async function addVariant(page, { key, value, sku, price }) {
  await page.getByTestId("variant-add").click();
  const form = page.getByTestId("variant-form");
  await form.waitFor();
  await form.getByPlaceholder(/^نام \(/).first().fill(key);
  await form.getByPlaceholder(/^مقدار \(/).first().fill(value);
  await form.getByLabel(/کد کالا \(SKU\) این تنوع/).fill(sku);
  if (price) await form.getByLabel("قیمت", { exact: true }).fill(price);
  await form.getByRole("button", { name: "ذخیره تنوع" }).click();
}
const variantsOf = async (table, parent) => (await state())[table].filter((r) => r.variant_of === parent).sort((a, b) => a.id - b.id);

test("Health: add variants, they are not products anywhere, the public page offers the choice and the price / SKU / stock follow it", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await login(page, "health");
  await page.goto(`${BASE}/operator/products/1/edit`, { waitUntil: "networkidle" });
  await page.getByTestId("variants-empty").waitFor();

  await addVariant(page, { key: "Size", value: "M", sku: "E2E-1-M", price: "12" });
  await page.getByTestId("variants-list").waitFor();
  await addVariant(page, { key: "Size", value: "L", sku: "E2E-1-L", price: "14" });
  await poll(async () => (await variantsOf("products", 1)).length === 2, { label: "two variants stored" });
  const [m, l] = await variantsOf("products", 1);
  assert.deepEqual(m.variant_options, { Size: "M" }); assert.equal(m.price, 12); assert.equal(m.name_en, "E2E Product 1 — M"); assert.equal(m.category_id, 1);
  assert.equal(l.sku, "E2E-1-L");
  const trail = (await state()).operator_audit_log.filter((r) => r.action === "product.variant.create");
  assert.equal(trail.length, 2, "both creations are in the activity log");

  // the panel list shows products with their variant count, not the variants
  await page.goto(`${BASE}/operator/products`, { waitUntil: "networkidle" });
  assert.equal(await page.getByTestId("variant-count").count(), 1);
  assert.match(await page.getByTestId("variant-count").innerText(), /تنوع/);
  const rowsText = await page.locator("main").innerText();
  assert.ok(!rowsText.includes("E2E-1-M"), "a variant is not a row of the list");
  // …but searching its SKU finds it, and its edit address opens the product it belongs to
  await page.goto(`${BASE}/operator/products?q=E2E-1-M`, { waitUntil: "networkidle" });
  assert.equal(await page.getByTestId("variant-tag").count(), 1);
  await page.goto(`${BASE}/operator/products/${m.id}/edit`, { waitUntil: "networkidle" });
  assert.match(new URL(page.url()).pathname, /\/operator\/products\/1\/edit$/);

  // the public catalogue never lists a variant; the product page offers the choice
  const catalog = await get("/health/en/catalog");
  assert.equal(catalog.status, 200);
  const pub = await ctx.newPage();
  await pub.goto(`${BASE}/health/en/catalog/e2e-gloves`, { waitUntil: "networkidle" });
  await pub.getByTestId("variant-picker").waitFor();
  assert.equal(await pub.locator("[data-variant-value]").count(), 2);
  const info = pub.locator("dl").first();
  assert.match(await info.innerText(), /E2E-1-M/, "it opens on the first variant (both in stock)");
  await pub.locator('[data-variant-value="L"]').click();
  await poll(async () => /E2E-1-L/.test(await info.innerText()), { label: "SKU follows the choice" });
  assert.match(await pub.locator("main, body").first().innerText(), /14/, "and so does the price");
  const ld = (await pub.locator('script[type="application/ld+json"]').allInnerTexts()).join("\n");        // the layout has its own (Organization) block too
  assert.match(ld, /ProductGroup/); assert.match(ld, /E2E-1-L/);
  // a variant is not a page, a search result or in the sitemap
  assert.equal((await get(`/health/en/catalog/${m.slug}`)).status, 404);
  assert.ok(!(await get("/sitemap.xml")).text.includes(m.slug));
  await ctx.close();
});

test("Health: a SKU already used (any case, also a product's) is refused in words; the same options twice too", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await login(page, "health");
  await page.goto(`${BASE}/operator/products/1/edit`, { waitUntil: "networkidle" });
  await addVariant(page, { key: "Size", value: "M", sku: "E2E-1-M" });
  await poll(async () => (await variantsOf("products", 1)).length === 1);

  await addVariant(page, { key: "Size", value: "L", sku: "e2e-1-m" });
  await page.getByRole("alert").filter({ hasText: "قبلاً" }).waitFor();
  await page.getByTestId("variant-form").getByLabel(/کد کالا \(SKU\) این تنوع/).fill("E2E-3");          // another PRODUCT's SKU
  await page.getByTestId("variant-form").getByRole("button", { name: "ذخیره تنوع" }).click();
  await page.getByRole("alert").filter({ hasText: "قبلاً" }).waitFor();
  await page.getByTestId("variant-form").getByLabel(/کد کالا \(SKU\) این تنوع/).fill("E2E-1-X");
  await page.getByTestId("variant-form").getByPlaceholder(/^مقدار \(/).first().fill("m");                  // same options as the first one
  await page.getByTestId("variant-form").getByRole("button", { name: "ذخیره تنوع" }).click();
  await page.getByRole("alert").filter({ hasText: "همین مشخصه" }).waitFor();
  assert.equal((await variantsOf("products", 1)).length, 1, "nothing was stored by the refusals");
  await ctx.close();
});

test("Health: archive a variant, then delete it by typing its SKU; the product with variants cannot be deleted from under them", async () => {
  await insert("products", [{ id: 21, slug: "e2e-v-m", sku: "E2E-1-V", name_en: "E2E Product 1 — V", name_fa: "x", price: 3, in_stock: true, is_active: true, variant_of: 1, variant_options: { Size: "V" }, variant_sort: 0, created_at: ts, updated_at: ts }]);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await login(page, "health");
  await page.goto(`${BASE}/operator/products/1/edit`, { waitUntil: "networkidle" });
  assert.equal(await page.getByRole("button", { name: /^حذف$/ }).count(), 0, "an active variant has no delete button");
  await page.locator('[data-variant-sku="E2E-1-V"]').getByRole("button", { name: /آرشیو/ }).click();
  await poll(async () => (await state()).products.find((p) => p.id === 21).is_active === false, { label: "archived" });
  await page.reload({ waitUntil: "networkidle" });
  await page.locator('[data-variant-sku="E2E-1-V"]').getByRole("button", { name: /^حذف$/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/برای تأیید/).fill("E2E-1-V");
  await dialog.getByRole("button", { name: "حذف دائمی" }).click();
  await poll(async () => !(await state()).products.some((p) => p.id === 21), { label: "variant deleted" });
  const trail = (await state()).operator_audit_log.filter((r) => /^product\.delete/.test(r.action)).map((r) => r.action);
  assert.deepEqual(trail, ["product.delete_attempt", "product.delete"]);
  await ctx.close();
});

test("Beauty: the same, in its own table; the public product page shows the variant card and the choice changes SKU and price", async () => {
  await insert("beauty_products", [beautyProduct]);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await login(page, "beauty");
  await page.goto(`${BASE}/beauty/operator/products/11/edit`, { waitUntil: "networkidle" });
  await addVariant(page, { key: "Volume", value: "30 ml", sku: "B-11-30", price: "30" });
  await poll(async () => (await variantsOf("beauty_products", 11)).length === 1, { label: "beauty variant stored" });
  await addVariant(page, { key: "Volume", value: "50 ml", sku: "B-11-50", price: "45" });
  await poll(async () => (await variantsOf("beauty_products", 11)).length === 2);
  assert.equal((await state()).products.filter((p) => p.variant_of != null).length, 0, "Health's table is untouched");

  const pub = await ctx.newPage();
  await pub.goto(`${BASE}/beauty/en/catalog/e2e-serum`, { waitUntil: "networkidle" });
  const box = pub.getByTestId("variant-buy");
  await box.waitFor();
  assert.match(await box.innerText(), /B-11-30/);
  await box.locator('[data-variant-value="50 ml"]').click();
  await poll(async () => /B-11-50/.test(await box.innerText()), { label: "SKU follows the choice" });
  assert.match(await box.innerText(), /45/);
  assert.match((await pub.locator('script[type="application/ld+json"]').allInnerTexts()).join("\n"), /ProductGroup/);
  const catalog = (await get("/beauty/en/catalog")).text;
  assert.ok(!catalog.includes("B-11-50"));
  await ctx.close();
});

test("the variants section and its form fit a 320 px phone in the panel and on the public page, long text included", async () => {
  const long = "Unbroken".repeat(6);
  await insert("products", [{ id: 31, slug: "e2e-long", sku: `LONG-${long}`, name_en: "E2E Product 1 — x", name_fa: "x", price: 3, in_stock: true, is_active: true, variant_of: 1, variant_options: { [`Axis${long}`]: long }, variant_sort: 0, created_at: ts, updated_at: ts }]);
  const ctx = await browser.newContext({ viewport: { width: 320, height: 640 } });
  const page = await ctx.newPage();
  await login(page, "health");
  await page.goto(`${BASE}/operator/products/1/edit`, { waitUntil: "networkidle" });
  await page.getByTestId("variants-list").waitFor();
  assert.equal((await page.evaluate(measureInPage)).count, 0, JSON.stringify((await page.evaluate(measureInPage)).offenders?.slice(0, 2)));
  await page.getByTestId("variant-add").click();
  await page.getByTestId("variant-form").waitFor();
  assert.equal((await page.evaluate(measureInPage)).count, 0, JSON.stringify((await page.evaluate(measureInPage)).offenders?.slice(0, 2)));
  const pub = await ctx.newPage();
  await pub.goto(`${BASE}/health/en/catalog/e2e-gloves`, { waitUntil: "networkidle" });
  await pub.getByTestId("variant-picker").waitFor();
  assert.equal((await pub.evaluate(measureInPage)).count, 0, JSON.stringify((await pub.evaluate(measureInPage)).offenders?.slice(0, 2)));
  await ctx.close();
});
