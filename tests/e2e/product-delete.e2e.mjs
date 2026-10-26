// Permanently deleting a product from the panels: only an ARCHIVED product has the button, the SKU must be typed, the
// product disappears from the panel and the public site, the activity log records it, and customer requests keep the
// product's name. Both panels, plus the dialog on a short phone (320x568).
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { BASE, DB, launch, state, resetDb, poll, login, get } from "./helpers.mjs";

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
const ts = "2026-10-01T10:00:00.000Z";
const beautyProduct = (id, sku, active) => ({ id, slug: `e2e-beauty-${id}`, sku, name_en: `Beauty Product ${id}`, name_fa: `Beauty Product ${id}`, price: 5, in_stock: true, is_active: active, created_at: ts, updated_at: ts });

async function openProducts(page, house) {
  await login(page, house);
  await page.goto(`${BASE}${house === "beauty" ? "/beauty/operator" : "/operator"}/products`, { waitUntil: "networkidle" });
}
const names = async (house) => (await state())[house === "beauty" ? "beauty_products" : "products"].map((p) => p.id).sort((a, b) => a - b);
const auditOf = async (action) => (await state()).operator_audit_log.filter((r) => r.action === action);

test("Health: only the archived product has the button; the SKU must be typed; the product is gone from the panel, the site and the log says so", async () => {
  // a customer request that asked about the archived product: it must survive with the product's name
  await insert("quote_requests", [{ name: "Asked About Archived", status: "new", phone: "+992900000042", preferred_contact: "whatsapp", language: "en", message: "", product_id: 2, product_name: "E2E Product 2", product_sku: "E2E-2", created_at: ts }]);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await openProducts(page, "health");

  const buttons = page.getByTestId("product-delete");
  assert.equal(await buttons.count(), 1, "exactly one product is archived, so exactly one delete button");
  await buttons.first().click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  const submit = dialog.getByRole("button", { name: "حذف دائمی" });
  assert.equal(await dialog.getByTestId("del-product-expected").innerText(), "E2E-2");
  assert.equal(await submit.isDisabled(), true, "nothing typed: the button is off");
  await dialog.getByLabel(/برای تأیید/).fill("E2E-1");
  assert.equal(await submit.isDisabled(), true, "the wrong text keeps it off");
  await dialog.getByLabel(/برای تأیید/).fill("e2e-2");
  assert.equal(await submit.isDisabled(), false, "the right text (case does not matter) turns it on");
  await submit.click();

  await page.getByText("محصول برای همیشه حذف شد.").waitFor();
  assert.deepEqual(await names("health"), [1, 3], "only the archived product was removed");
  assert.equal(await page.getByTestId("product-delete").count(), 0);
  const log = await auditOf("product.delete");
  assert.equal(log.length, 1);
  assert.deepEqual(log[0].entity_ids, [2]);
  assert.equal(log[0].entity, "products");
  assert.deepEqual(log[0].detail, { sku: "E2E-2" });
  assert.equal((await get("/health/en/catalog/e2e-archived")).status, 404);
  const asked = (await state()).quote_requests.find((q) => q.name === "Asked About Archived");
  assert.ok(asked, "the customer's request is still there");
  assert.equal(asked.product_name, "E2E Product 2");
  assert.equal(asked.product_sku, "E2E-2");
  await ctx.close();
});

test("Health: archiving first is the only way - a visible product has no delete button and the dialog on a 320x568 phone is fully reachable", async () => {
  const ctx = await browser.newContext({ viewport: { width: 320, height: 568 }, hasTouch: true });
  const page = await ctx.newPage();
  await openProducts(page, "health");
  await page.getByTestId("product-delete").first().click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await dialog.getByLabel(/برای تأیید/).fill("E2E-2");
  for (const b of [dialog.getByRole("button", { name: "حذف دائمی" }), dialog.getByRole("button", { name: "انصراف" })]) {
    await b.scrollIntoViewIfNeeded();
    const box = await b.boundingBox();
    assert.ok(box && box.y >= 0 && box.y + box.height <= 568 && box.x >= 0 && box.x + box.width <= 320, `button outside the phone screen: ${JSON.stringify(box)}`);
  }
  await dialog.getByRole("button", { name: "انصراف" }).click();
  await dialog.waitFor({ state: "detached" });
  assert.deepEqual(await names("health"), [1, 2, 3], "cancelling deletes nothing");
  await ctx.close();
});

test("Beauty: same rules in its own panel and table; the Health catalog is untouched", async () => {
  await insert("beauty_products", [beautyProduct(11, "BP-11", true), beautyProduct(12, "BP-12", false)]);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await openProducts(page, "beauty");

  assert.equal(await page.getByTestId("product-delete").count(), 1);
  await page.getByTestId("product-delete").first().click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await dialog.getByLabel(/برای تأیید/).fill("BP-12");
  await dialog.getByRole("button", { name: "حذف دائمی" }).click();
  await page.getByText("محصول برای همیشه حذف شد.").waitFor();

  assert.deepEqual(await names("beauty"), [11], "the archived Beauty product is gone, the visible one stays");
  assert.deepEqual(await names("health"), [1, 2, 3], "Health products are untouched");
  const log = await auditOf("product.delete");
  assert.equal(log.length, 1);
  assert.equal(log[0].panel, "beauty");
  assert.equal(log[0].entity, "beauty_products");
  assert.deepEqual(log[0].entity_ids, [12]);
  await ctx.close();
});

test("a product that was re-activated or already deleted in the meantime is not removed and the panel says so", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await openProducts(page, "health");
  await page.getByTestId("product-delete").first().click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await dialog.getByLabel(/برای تأیید/).fill("E2E-2");
  // meanwhile someone else re-activates it
  const res = await fetch(`${DB}/rest/v1/products?id=eq.2`, { method: "PATCH", headers: { apikey: SERVICE, "content-type": "application/json" }, body: JSON.stringify({ is_active: true }) });
  assert.ok(res.status < 300);
  await dialog.getByRole("button", { name: "حذف دائمی" }).click();
  await dialog.getByRole("alert").waitFor();
  assert.deepEqual(await names("health"), [1, 2, 3], "a visible product must never be deleted");
  assert.equal((await auditOf("product.delete")).length, 0, "a refused attempt writes no deletion entry");
  await ctx.close();
});

test("a deletion is refused while the activity log cannot be written", async () => {
  const { setFault, clearFaults } = await import("./helpers.mjs");
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await openProducts(page, "health");
  await page.getByTestId("product-delete").first().click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await dialog.getByLabel(/برای تأیید/).fill("E2E-2");
  await setFault("operator_audit_log", "POST", 500, "XX000", "log is down");
  await dialog.getByRole("button", { name: "حذف دائمی" }).click();
  await dialog.getByRole("alert").waitFor();
  await clearFaults();
  assert.deepEqual(await names("health"), [1, 2, 3], "no log, no delete");
  await ctx.close();
});
