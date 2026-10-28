// Warehouse lots, expiry and quarantine in a real browser (docs/PANEL_WAREHOUSE_LOTS.md), against the fake database whose stock functions mirror
// migrations 36 and 45: stock is received into batches (also straight into quarantine), the stock list tells usable from unusable, a
// quarantined batch cannot be issued and the refusal says how much IS usable, a batch is released with a reason and a history, an expiry date
// that passes makes the stock unusable until it is written off, the alert strip counts and links, Beauty is a separate warehouse, and the screens fit 320 px.
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { BASE, DB, launch, state, resetDb, login, measureInPage } from "./helpers.mjs";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
beforeEach(async () => { await resetDb(); });

const SERVICE = "service-test-key";
const ts = "2026-10-01T10:00:00.000Z";
async function insert(table, rows) {
  const res = await fetch(`${DB}/rest/v1/${table}`, { method: "POST", headers: { apikey: SERVICE, "content-type": "application/json", prefer: "return=representation" }, body: JSON.stringify(rows) });
  assert.equal(res.status, 201);
}
const teamDay = (offset = 0) => new Date(Date.now() + 5 * 3_600_000 + offset * 86_400_000).toISOString().slice(0, 10);
const LOC = "MAIN — Main";
const bal = async (house, loc, prod = 1) => { const b = (await state())[`${house}_stock_balances`]?.find((r) => r.location_id === loc && r.product_id === prod); return b ? `${b.quantity}/${b.reserved}` : "none"; };
const lotRow = async (house, code) => (await state())[`${house}_stock_lots`]?.find((l) => l.lot_code === code);
const lotQty = async (house, code, loc = 1) => { const l = await lotRow(house, code); const b = l && (await state())[`${house}_stock_lot_balances`]?.find((x) => x.lot_id === l.id && x.location_id === loc); return b ? b.quantity : 0; };

async function open(page, house, tab = "stock", query = "") {
  await login(page, house);
  await page.goto(`${BASE}${house === "beauty" ? "/beauty/operator" : "/operator"}/warehouse?tab=${tab}${query}`, { waitUntil: "networkidle" });
}
async function receive(page, { sku, qty, lot, expiry, quarantine }) {
  await page.getByTestId("wh-open-receive").click();
  const form = page.getByTestId("wh-form-receive");
  await form.getByLabel("کد کالا (SKU)").fill(sku);
  await form.getByLabel("مقدار", { exact: false }).first().fill(String(qty));
  if (lot) {
    await form.getByTestId("wh-lot-code").fill(lot);
    if (expiry) await form.getByTestId("wh-lot-expiry-input").fill(expiry);
    if (quarantine) await form.getByTestId("wh-lot-quarantine").check();
  }
  await form.getByRole("button", { name: "ثبت" }).click();
  await form.waitFor({ state: "detached" });
}
async function issueFromRow(page, { lot, qty, expectError }) {
  const row = page.getByTestId("wh-stock-row").first();
  await row.getByRole("button", { name: "خروج" }).click();
  const form = page.getByTestId("wh-form-issue");
  if (lot !== undefined) await form.getByTestId("wh-lot-select").selectOption({ label: lot });
  await form.getByLabel("مقدار", { exact: false }).first().fill(String(qty));
  await form.getByRole("button", { name: "ثبت" }).click();
  if (expectError) { await form.getByRole("alert").waitFor(); return form.getByRole("alert").innerText(); }
  await form.waitFor({ state: "detached" });
  return null;
}
async function changeLot(page, code, { status, expiry, reason }) {
  await page.locator(`[data-testid="wh-lot"][data-lot-code="${code}"]`).getByTestId("wh-lot-edit").click();
  const form = page.getByTestId("wh-form-lot");
  if (status) await form.getByTestId("wh-lot-status").selectOption(status);
  if (expiry) { await form.getByTestId("wh-lot-expiry-toggle").check(); await form.getByTestId("wh-lot-expiry").fill(expiry); }
  await form.getByTestId("wh-lot-reason").fill(reason);
  await form.getByRole("button", { name: "ثبت" }).click();
  const alert = form.getByRole("alert");
  await Promise.race([form.waitFor({ state: "detached" }), alert.waitFor().then(async () => { throw new Error(`the dialog refused: ${await alert.innerText()}`); })]);
}

test("Health: receive into batches (also into quarantine); usable and unusable are told apart; a quarantined batch cannot be issued; release it with a reason", async () => {
  await insert("health_stock_locations", [{ id: 1, code: "MAIN", name: "Main", is_active: true, sort_order: 0, version: 1 }]);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await open(page, "health");

  await receive(page, { sku: "E2E-1", qty: 10 });                                                       // no batch: as before
  await receive(page, { sku: "E2E-1", qty: 6, lot: "LOT-A", expiry: teamDay(20) });
  await receive(page, { sku: "E2E-1", qty: 3, lot: "LOT-Q", expiry: teamDay(200), quarantine: true });   // arrives in quarantine
  assert.equal(await bal("health", 1), "19/0");
  assert.equal(await lotQty("health", "LOT-A"), 6); assert.equal(await lotQty("health", "LOT-Q"), 3);
  assert.equal((await lotRow("health", "LOT-Q")).status, "quarantine");
  assert.equal((await lotRow("health", "LOT-A")).expiry_date, teamDay(20));

  await page.reload({ waitUntil: "networkidle" });
  // the row: 19 on hand, 3 not usable, 16 usable; the batches are listed under the product
  const row = page.getByTestId("wh-stock-row").first();
  assert.match(await row.getByTestId("wh-usable").innerText(), /(16|۱۶)/);
  assert.match(await row.getByTestId("wh-usable").innerText(), /(3|۳)/);
  assert.equal(await row.locator('[data-lot-state="quarantine"]').count(), 1);
  // alerts: one batch in quarantine and one expiring soon (20 days, window 30), linking to the lots tab
  await page.getByTestId("wh-alerts").waitFor();
  assert.equal(await page.getByTestId("wh-alert-quarantine").count(), 1);
  assert.equal(await page.getByTestId("wh-alert-expiring").count(), 1);
  assert.equal(await page.getByTestId("wh-alert-expired").count(), 0);

  // 17 of the 19 cannot be issued: 3 are in quarantine; the refusal says how much IS usable; nothing changes
  const refused = await issueFromRow(page, { qty: 17, expectError: true });
  assert.match(refused, /موجودی قابل استفاده کافی نیست/); assert.match(refused, /(16|۱۶)/);
  assert.equal(await bal("health", 1), "19/0");
  await page.getByRole("button", { name: "انصراف" }).click();
  // the quarantined batch is in the list but cannot be chosen for an issue
  await page.getByTestId("wh-stock-row").first().getByRole("button", { name: "خروج" }).click();
  const opt = page.getByTestId("wh-form-issue").getByTestId("wh-lot-select").locator("option", { hasText: "LOT-Q" });
  assert.equal(await opt.evaluate((o) => o.disabled), true);                 // (Playwright's isDisabled does not look at <option>)
  await page.getByRole("button", { name: "انصراف" }).click();
  // 2 from LOT-A: the batch goes down with the product
  await issueFromRow(page, { lot: "LOT-A · 6 · " + teamDay(20), qty: 2 });
  assert.equal(await lotQty("health", "LOT-A"), 4); assert.equal(await bal("health", 1), "17/0");

  // the lots tab: filtered by the alert's link; release LOT-Q with a reason; the history shows who and why
  await page.getByTestId("wh-alert-quarantine").click();
  await page.waitForURL(/view=quarantine/);
  const lots = page.getByTestId("wh-lot");
  assert.equal(await lots.count(), 1);
  assert.equal(await lots.first().getAttribute("data-lot-code"), "LOT-Q");
  await changeLot(page, "LOT-Q", { status: "active", reason: "inspection passed" });
  assert.equal((await lotRow("health", "LOT-Q")).status, "active");
  assert.equal((await lotRow("health", "LOT-Q")).version, 2);
  const events = (await state()).health_stock_lot_events.filter((e) => e.kind === "status");
  assert.deepEqual(events.map((e) => [e.from_value, e.to_value, e.reason]), [["quarantine", "active", "inspection passed"]]);
  const logged = (await state()).operator_audit_log.filter((r) => r.action === "stock.lot_update" && r.result === "success");
  assert.equal(logged.length, 1);
  await page.goto(`${BASE}/operator/warehouse?tab=lots&lot=${(await lotRow("health", "LOT-Q")).id}`, { waitUntil: "networkidle" });
  const detail = page.getByTestId("wh-lot-detail");
  assert.match(await detail.innerText(), /inspection passed/);
  assert.match(await detail.getByTestId("wh-lot-moves").innerText(), /\+(3|۳)/, "the receipt is in the batch's history");
  // 17 on hand and nothing unusable now: a plain issue of 17 works
  await page.goto(`${BASE}/operator/warehouse?tab=stock`, { waitUntil: "networkidle" });
  assert.equal(await page.getByTestId("wh-usable").count(), 0);
  await ctx.close();
});

test("Health: an expiry date that passes makes the stock unusable; correcting the date is logged; expired stock is written off through its batch", async () => {
  await insert("health_stock_locations", [{ id: 1, code: "MAIN", name: "Main", is_active: true, sort_order: 0, version: 1 }]);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await open(page, "health");
  await receive(page, { sku: "E2E-1", qty: 4 });
  await receive(page, { sku: "E2E-1", qty: 5, lot: "OLD-1", expiry: teamDay(10) });
  await page.goto(`${BASE}/operator/warehouse?tab=lots`, { waitUntil: "networkidle" });
  assert.equal(await page.getByTestId("wh-lot").first().getAttribute("data-lot-state"), "active");
  // somebody finds the label was wrong: the real date was yesterday
  await changeLot(page, "OLD-1", { expiry: teamDay(-1), reason: "label was misread" });
  const lot = await lotRow("health", "OLD-1");
  assert.equal(lot.expiry_date, teamDay(-1));
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.locator('[data-testid="wh-lot"][data-lot-code="OLD-1"]').getAttribute("data-lot-state"), "expired");
  assert.equal(await page.getByTestId("wh-alert-expired").count(), 1);
  assert.deepEqual((await state()).health_stock_lot_events.filter((e) => e.kind === "expiry").map((e) => [e.from_value, e.to_value]), [[teamDay(10), teamDay(-1)]]);

  // 9 on hand, 5 expired: 6 cannot be issued
  await page.goto(`${BASE}/operator/warehouse?tab=stock`, { waitUntil: "networkidle" });
  const refused = await issueFromRow(page, { qty: 6, expectError: true });
  assert.match(refused, /(4|۴)/, "4 are usable");
  await page.getByRole("button", { name: "انصراف" }).click();
  assert.equal(await bal("health", 1), "9/0");
  // the way out: a write-off (adjust) naming the batch, reason required
  await page.getByTestId("wh-stock-row").first().getByRole("button", { name: "اصلاح" }).click();
  const form = page.getByTestId("wh-form-adjust");
  await form.getByTestId("wh-lot-select").selectOption({ index: 1 });
  await form.getByLabel("مقدار", { exact: false }).first().fill("-5");
  await form.getByLabel("دلیل").fill("expired, destroyed");
  await form.getByRole("button", { name: /ثبت|ارسال برای تأیید/ }).click();
  await form.waitFor({ state: "detached" });
  assert.equal(await bal("health", 1), "4/0"); assert.equal(await lotQty("health", "OLD-1"), 0);
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.getByTestId("wh-usable").count(), 0, "nothing unusable is left");
  await ctx.close();
});

test("Beauty has its own batches; Health's warehouse is untouched", async () => {
  await insert("beauty_products", [{ id: 1, slug: "b1", sku: "BEAUTY-1", name_en: "Serum", name_fa: "Serum", price: 5, in_stock: true, is_active: true, created_at: ts, updated_at: ts }]);
  await insert("beauty_stock_locations", [{ id: 1, code: "MAIN", name: "Main", is_active: true, sort_order: 0, version: 1 }]);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await open(page, "beauty");
  await receive(page, { sku: "BEAUTY-1", qty: 8, lot: "B-LOT-1", expiry: teamDay(5) });
  assert.equal(await bal("beauty", 1), "8/0"); assert.equal(await lotQty("beauty", "B-LOT-1"), 8);
  await page.goto(`${BASE}/beauty/operator/warehouse?tab=lots`, { waitUntil: "networkidle" });
  assert.equal(await page.getByTestId("wh-lot").count(), 1);
  assert.equal(await page.getByTestId("wh-alert-expiring").count(), 1, "5 days left, inside the 30-day window");
  const st = await state();
  assert.equal((st.health_stock_lots || []).length, 0); assert.equal((st.health_stock_movements || []).length, 0);
  await ctx.close();
});

test("the lots tab, its dialog and the stock rows with batches fit a 320 px phone, with a long unbroken batch code", async () => {
  const long = "BATCH".repeat(8);
  await insert("health_stock_locations", [{ id: 1, code: "MAIN", name: "Main", is_active: true, sort_order: 0, version: 1 }]);
  const ctx = await browser.newContext({ viewport: { width: 320, height: 640 } });
  const page = await ctx.newPage();
  await open(page, "health");
  await receive(page, { sku: "E2E-1", qty: 3, lot: long, expiry: teamDay(3) });
  await page.reload({ waitUntil: "networkidle" });
  let wide = await page.evaluate(measureInPage);
  assert.equal(wide.count, 0, JSON.stringify(wide.offenders?.slice(0, 2)));
  await page.goto(`${BASE}/operator/warehouse?tab=lots`, { waitUntil: "networkidle" });
  wide = await page.evaluate(measureInPage);
  assert.equal(wide.count, 0, JSON.stringify(wide.offenders?.slice(0, 2)));
  await page.getByTestId("wh-lot-edit").first().click();
  await page.getByTestId("wh-form-lot").waitFor();
  wide = await page.evaluate(measureInPage);
  assert.equal(wide.count, 0, JSON.stringify(wide.offenders?.slice(0, 2)));
  await ctx.close();
});
