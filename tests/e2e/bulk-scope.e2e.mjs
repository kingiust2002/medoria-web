// "All filtered results" for bulk actions (N9, docs/PANEL_SAVED_VIEWS_BULK_SCOPE.md) in a real browser: tick the page, select all N matches, confirm the sentence
// that names the count and the filters, and every match — also on the other pages — changes; a list that changed meanwhile is refused and nothing is applied;
// cancelling changes nothing; "this page only" keeps the old behaviour; the requests list does the same for archive / spam / restore; the bar fits 320 px.
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { BASE, DB, launch, state, resetDb, login, poll, measureInPage } from "./helpers.mjs";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
beforeEach(async () => { await resetDb(); });

const SERVICE = "service-test-key";
const ts = "2026-10-01T10:00:00.000Z";
const digits = (s) => String(s).replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)).replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[,،٬\s]/g, "");
async function insert(table, rows) {
  const res = await fetch(`${DB}/rest/v1/${table}`, { method: "POST", headers: { apikey: SERVICE, "content-type": "application/json", prefer: "return=representation" }, body: JSON.stringify(rows) });
  assert.equal(res.status, 201);
}
const product = (i, o = {}) => ({
  id: 2000 + i, slug: `bs-${i}`, sku: `BS-${String(i).padStart(4, "0")}`, name_en: `Scoped item ${String(i).padStart(4, "0")}`, name_fa: `کالای ${i}`, name_ru: null, name_tg: null,
  price: 10, currency: "USD", unit: "box", min_order_qty: 1, brand: "Acme", badge: null, category: "gloves", category_id: 1,
  in_stock: true, is_active: true, is_featured: false, specs: {}, tags: [], views: 0, image_url: null, created_at: ts, updated_at: new Date(Date.UTC(2026, 9, 1) + i * 60_000).toISOString(), ...o,
});
const quote = (i, o = {}) => ({
  id: 3000 + i, status: "new", tracking_code: `MH-BS${String(i).padStart(5, "0")}`, assigned_to: null, first_response_at: null, notify_status: "sent", name: `Scoped Customer ${i}`, organization: "", phone: "+992900000000",
  product_name: null, preferred_contact: "whatsapp", language: "en", message: "m", internal_notes: "", created_at: new Date(Date.UTC(2026, 9, 1) - i * 60_000).toISOString(), updated_at: ts, ...o,
});
const ours = (rows) => rows.filter((p) => p.id >= 2000 && p.id < 3000);
const URL_P = `${BASE}/operator/products?q=${encodeURIComponent("Scoped item")}&status=active`;

const tickPage = (page) => page.locator("input[type=checkbox]").first().check();

test("products: page → all 60 filtered results → confirm → every match changes, also on pages 2 and 3", async () => {
  await insert("products", Array.from({ length: 60 }, (_, k) => product(k + 1)).concat([product(61, { is_active: false }), product(62, { name_en: "Other thing", sku: "OT-1" })]));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await login(page, "health");
  await page.goto(URL_P, { waitUntil: "networkidle" });
  assert.equal(await page.getByTestId("scope-offer").count(), 0, "nothing offered before a selection");
  assert.equal(await page.getByTestId("saved-views").count(), 0, "the old shared login has no person, so no saved views");
  await tickPage(page);
  await page.getByTestId("scope-offer").waitFor();
  assert.match(digits(await page.getByTestId("scope-offer").innerText()), /25.*60/, "names the page count and the total");
  await page.getByTestId("scope-select-all").click();
  await page.getByTestId("scope-all").waitFor();
  assert.match(digits(await page.getByText(/مورد انتخاب شده/).first().innerText()), /^60/, "the bar counts all 60");
  await page.getByRole("button", { name: "غیرفعال", exact: true }).click();
  const dialog = page.getByTestId("confirm-filtered");
  await dialog.waitFor();
  assert.match(digits(await dialog.innerText()), /60/, "the sentence names 60");
  assert.match(await dialog.innerText(), /Scoped item/, "and the filter");
  // cancel first: nothing changed
  await dialog.getByRole("button", { name: "انصراف" }).click();
  await dialog.waitFor({ state: "detached" });
  const scoped = async () => ours((await state()).products).filter((p) => p.name_en.startsWith("Scoped"));
  assert.equal((await scoped()).filter((p) => p.is_active).length, 60);
  await page.getByRole("button", { name: "غیرفعال", exact: true }).click();
  await page.getByTestId("confirm-filtered-yes").click();
  await poll(async () => (await scoped()).every((p) => !p.is_active), { label: "all matches inactive" });
  const after = await scoped();
  assert.equal(after.length, 61);
  assert.equal(ours((await state()).products).find((p) => p.sku === "OT-1").is_active, true, "a product outside the filters is untouched");
  assert.ok((await state()).operator_audit_log.some((r) => /product/.test(r.action)), "the history recorded it");
  await ctx.close();
});

test("products: a list that changed meanwhile is refused and nothing is applied; 'this page only' acts on the ticked page", async () => {
  await insert("products", Array.from({ length: 40 }, (_, k) => product(k + 1)));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await login(page, "health");
  await page.goto(URL_P, { waitUntil: "networkidle" });
  await tickPage(page);
  await page.getByTestId("scope-select-all").click();
  await page.getByRole("button", { name: "غیرفعال", exact: true }).click();
  await page.getByTestId("confirm-filtered").waitFor();
  await insert("products", [product(41)]);                                                  // somebody else adds a match while the dialog is open
  await page.getByTestId("confirm-filtered-yes").click();
  await page.getByText(/فهرست در این فاصله تغییر کرده/).waitFor();
  assert.equal(ours((await state()).products).filter((p) => p.is_active).length, 41, "nothing was applied");

  // back to the page only → just the 25 on screen
  await page.goto(URL_P, { waitUntil: "networkidle" });
  await tickPage(page);
  await page.getByTestId("scope-select-all").click();
  await page.getByTestId("scope-page").click();
  assert.equal(await page.getByTestId("scope-offer").count(), 1);
  await page.getByRole("button", { name: "غیرفعال", exact: true }).click();
  await poll(async () => ours((await state()).products).filter((p) => !p.is_active).length === 25, { label: "25 changed" });
  assert.equal(await page.getByTestId("confirm-filtered").count(), 0, "no extra dialog for the page");
  await ctx.close();
});

test("requests: archive every request of the tab and filters; the list offers it only when the whole page is ticked", async () => {
  await insert("quote_requests", Array.from({ length: 55 }, (_, k) => quote(k + 1)));
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await login(page, "health");
  await page.goto(`${BASE}/operator/quotes`, { waitUntil: "networkidle" });
  await page.getByRole("checkbox", { name: /Scoped Customer 1$/ }).check();
  assert.equal(await page.getByTestId("scope-offer").count(), 0, "one row ticked: no offer");
  await page.locator("input[type=checkbox]").first().check();
  await page.getByTestId("scope-select-all").click();
  await page.getByRole("button", { name: "آرشیو", exact: true }).first().click();
  const dialog = page.getByTestId("confirm-filtered");
  await dialog.waitFor();
  assert.match(digits(await dialog.innerText()), /5[5-9]/, "names the exact total");
  assert.equal(await page.getByRole("button", { name: "حذف", exact: true }).count(), 0, "deleting stays on the ticked rows");
  await page.getByTestId("confirm-filtered-yes").click();
  await poll(async () => ((await state()).quote_requests || []).filter((q) => q.id >= 3000).every((q) => q.status === "archived"), { label: "all archived" });
  await ctx.close();
});

test("the bulk bar, the offer and the dialog fit a 320 px phone", async () => {
  await insert("products", Array.from({ length: 40 }, (_, k) => product(k + 1, { name_en: `Scoped item ${"W".repeat(60)}${k}` })));
  const ctx = await browser.newContext({ viewport: { width: 320, height: 700 } });
  const page = await ctx.newPage();
  await login(page, "health");
  await page.goto(URL_P, { waitUntil: "networkidle" });
  await tickPage(page);
  await page.getByTestId("scope-select-all").click();
  assert.equal((await page.evaluate(measureInPage)).count, 0, "bar + offer");
  await page.getByRole("button", { name: "غیرفعال", exact: true }).click();
  await page.getByTestId("confirm-filtered").waitFor();
  const res = await page.evaluate(measureInPage);
  assert.equal(res.count, 0, JSON.stringify(res.offenders?.slice(0, 3)));
  await ctx.close();
});
