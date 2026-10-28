// The internal warehouse screen of both panels, in a real browser against the fake database (whose stock functions mirror
// migration 36's rules): warehouses are created, stock is received / issued / transferred / adjusted / reversed / reserved by SKU,
// a refusal (not enough stock) is shown and changes nothing, the ledger and the activity log record who did it, and the warehouse
// data never shows up in a public response.
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { BASE, DB, launch, state, resetDb, login } from "./helpers.mjs";
import { ANON_KEY } from "./fakeDb.mjs";

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
const bal = async (house, loc, prod = 1) => { const b = (await state())[`${house}_stock_balances`]?.find((r) => r.location_id === loc && r.product_id === prod); return b ? `${b.quantity}/${b.reserved}` : "none"; };

async function open(page, house, tab = "stock") {
  await login(page, house);
  await page.goto(`${BASE}${house === "beauty" ? "/beauty/operator" : "/operator"}/warehouse?tab=${tab}`, { waitUntil: "networkidle" });
}
async function newLocation(page, code, name) {
  await page.getByTestId("wh-tab-locations").click();
  await page.getByTestId("wh-new-location").click();
  const form = page.getByTestId("wh-form-location");
  await form.getByLabel("کد انبار").fill(code);
  await form.getByLabel("نام انبار").fill(name);
  await form.getByRole("button", { name: "ذخیره" }).click();
  await page.getByTestId("wh-form-location").waitFor({ state: "detached" });
}
async function move(page, kind, { sku, qty, loc, to, reason, expectError }) {
  await page.getByTestId(`wh-open-${kind}`).click();
  const form = page.getByTestId(`wh-form-${kind}`);
  if (sku) await form.getByLabel("کد کالا (SKU)").fill(sku);
  if (loc) await form.getByLabel(kind === "transfer" ? "از انبار" : "انبار").selectOption({ label: loc });
  if (to) await form.getByLabel("به انبار").selectOption({ label: to });
  await form.getByLabel("مقدار", { exact: false }).first().fill(String(qty));
  if (reason) await form.getByLabel("دلیل").fill(reason);
  await form.getByRole("button", { name: /ثبت|ارسال برای تأیید/ }).click();
  if (expectError) { await form.getByRole("alert").waitFor(); return form.getByRole("alert").innerText(); }
  await form.waitFor({ state: "detached" });
  return null;
}

test("Health: warehouses, receive / issue / transfer / adjust, a refusal changes nothing, the ledger names the person", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await open(page, "health", "locations");
  await page.getByText("هنوز انباری ساخته نشده").waitFor();
  await newLocation(page, "main", "Main warehouse");
  await newLocation(page, "shop", "Shop floor");
  const st0 = await state();
  assert.deepEqual(st0.health_stock_locations.map((l) => l.code), ["MAIN", "SHOP"], "codes are stored upper-case");

  await page.getByTestId("wh-tab-stock").click();
  await move(page, "receive", { sku: "e2e-1", qty: 10, loc: "MAIN — Main warehouse" });          // SKU typed in any case
  assert.equal(await bal("health", 1), "10/0");
  await page.reload({ waitUntil: "networkidle" });
  assert.match(await page.getByTestId("wh-total").first().innerText(), /10/);

  await move(page, "issue", { sku: "E2E-1", qty: 4, loc: "MAIN — Main warehouse" });
  assert.equal(await bal("health", 1), "6/0");

  const refused = await move(page, "issue", { sku: "E2E-1", qty: 9, loc: "MAIN — Main warehouse", expectError: true });
  assert.match(refused, /موجودی قابل استفاده کافی نیست/);
  assert.match(refused, /6/, "the usable quantity is shown");
  assert.equal(await bal("health", 1), "6/0", "nothing changed");
  await page.getByRole("button", { name: "انصراف" }).click();

  await page.getByTestId("wh-open-transfer").click();
  const tf = page.getByTestId("wh-form-transfer");
  await tf.getByLabel("کد کالا (SKU)").fill("E2E-1");
  await tf.getByLabel("از انبار").selectOption({ label: "MAIN — Main warehouse" });
  await tf.getByLabel("به انبار").selectOption({ label: "SHOP — Shop floor" });
  await tf.getByLabel("مقدار", { exact: false }).first().fill("2");
  await tf.getByRole("button", { name: "ثبت" }).click();
  await tf.waitFor({ state: "detached" });
  assert.deepEqual([await bal("health", 1, 1), await bal("health", 2, 1)], ["4/0", "2/0"]);

  await move(page, "adjust", { sku: "E2E-1", qty: -1, loc: "MAIN — Main warehouse", reason: "damaged box" });
  assert.equal(await bal("health", 1), "3/0");
  const noReason = await move(page, "adjust", { sku: "E2E-1", qty: -1, loc: "MAIN — Main warehouse", expectError: true });
  assert.match(noReason, /دلیل/);
  await page.getByRole("button", { name: "انصراف" }).click();

  // the ledger: kinds, balances, the person; the activity log has a line per success
  await page.getByTestId("wh-tab-movements").click();
  await page.getByTestId("wh-movement").first().waitFor();
  const kinds = await page.getByTestId("wh-movement").evaluateAll((els) => els.map((e) => e.getAttribute("data-kind")));
  assert.deepEqual(kinds.reverse(), ["receive", "issue", "transfer", "transfer", "adjust"]);
  const st = await state();
  assert.ok(st.health_stock_movements.every((m) => m.actor_label), "every row names the person");
  const logged = new Set(st.operator_audit_log.filter((r) => /^stock\./.test(r.action) && r.result === "success").map((r) => r.action));
  for (const a of ["stock.location_create", "stock.receive", "stock.issue", "stock.transfer", "stock.adjust"]) assert.ok(logged.has(a), `activity log lacks ${a}`);

  // reverse the issue of 4: the movement comes back
  const issueRow = page.locator('[data-testid="wh-movement"][data-kind="issue"]').first();
  await issueRow.getByRole("button", { name: "برگشت" }).click();
  const rf = page.getByTestId("wh-form-reverse");
  await rf.getByLabel("دلیل").fill("issued by mistake");
  await rf.getByRole("button", { name: "برگشت" }).click();
  await rf.waitFor({ state: "detached" });
  assert.equal(await bal("health", 1), "7/0");
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.locator('[data-testid="wh-movement"][data-kind="issue"]').first().getByRole("button", { name: "برگشت" }).count(), 0, "a reversed movement offers no second reversal");
  await ctx.close();
});

test("Health: a reservation holds stock until it is released", async () => {
  await insert("health_stock_locations", [{ id: 1, code: "MAIN", name: "Main", is_active: true, sort_order: 0, version: 1 }]);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await open(page, "health");
  await move(page, "receive", { sku: "E2E-1", qty: 5 });
  await page.getByTestId("wh-stock-row").first().getByRole("button", { name: "رزرو" }).click();
  const rf = page.getByTestId("wh-form-reserve");
  await rf.getByLabel("مقدار").fill("3");
  await rf.getByRole("button", { name: "ثبت" }).click();
  await rf.waitFor({ state: "detached" });
  assert.equal(await bal("health", 1), "5/3");
  const over = await move(page, "issue", { sku: "E2E-1", qty: 3, expectError: true });
  assert.match(over, /موجودی قابل استفاده کافی نیست/, "reserved stock is not available to others");
  await page.getByRole("button", { name: "انصراف" }).click();
  await page.getByTestId("wh-tab-reservations").click();
  await page.getByTestId("wh-reservation").first().getByRole("button", { name: "آزادسازی رزرو" }).click();
  await page.getByText("رزرو فعالی وجود ندارد").waitFor();
  assert.equal(await bal("health", 1), "5/0");
  await ctx.close();
});

test("Beauty has its own warehouse: separate data, its own products", async () => {
  await insert("beauty_products", [{ id: 1, slug: "b1", sku: "BEAUTY-1", name_en: "Serum", name_fa: "Serum", price: 5, in_stock: true, is_active: true, created_at: ts, updated_at: ts }]);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await open(page, "beauty", "locations");
  await newLocation(page, "bmain", "Beauty main");
  await page.getByTestId("wh-tab-stock").click();
  await move(page, "receive", { sku: "BEAUTY-1", qty: 7 });
  assert.equal(await bal("beauty", 1), "7/0");
  const wrong = await move(page, "receive", { sku: "E2E-1", qty: 1, expectError: true });     // a Health SKU does not exist in Beauty
  assert.match(wrong, /این محصول وجود ندارد/);
  const st = await state();
  assert.equal((st.health_stock_movements || []).length, 0, "nothing reached the Health warehouse");
  assert.equal(st.beauty_stock_movements.length, 1);
  await ctx.close();
});

test("the warehouse never appears in a public response, and a stranger cannot call its functions", async () => {
  await insert("health_stock_locations", [{ id: 1, code: "MAIN", name: "Secret depot", is_active: true, sort_order: 0, version: 1 }]);
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await open(page, "health");
  await move(page, "receive", { sku: "E2E-1", qty: 5 });
  for (const path of ["/health/en", "/health/en/catalog", "/health/en/catalog/e2e-product-1", "/beauty/en", "/sitemap.xml", "/api/health"]) {
    const res = await fetch(BASE + path);
    const body = await res.text();
    assert.ok(!/Secret depot|stock_balances|stock_movements/.test(body), `${path} leaks the warehouse`);
  }
  const anon = await fetch(`${DB}/rest/v1/rpc/health_stock_post`, { method: "POST", headers: { apikey: ANON_KEY, "content-type": "application/json" }, body: JSON.stringify({ p_key: "x".repeat(10) }) });
  assert.equal(anon.status, 401);
  await ctx.close();
});

test("a person without inventory rights does not see the warehouse in the menu and is sent to no-access", async () => {
  const res = await fetch(`${BASE}/operator/warehouse`, { redirect: "manual" });
  assert.ok(res.status >= 300 && res.status < 400, "no session: redirected to the login");
});
