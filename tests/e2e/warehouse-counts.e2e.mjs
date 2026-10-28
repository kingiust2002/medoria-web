// Stock counts and minimum levels in a real browser against the fake database (whose stock functions mirror migration 36's rules and
// whose tables mirror migration 41's guards): a count snapshots a warehouse, differences are typed, closing posts one adjustment per
// difference (once), a closed count no longer changes (not even from a stale screen), minimum levels flag low stock, and the reports download.
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { BASE, DB, launch, state, resetDb, login } from "./helpers.mjs";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
beforeEach(async () => { await resetDb(); });

const SERVICE = "service-test-key";
async function insert(table, rows) {
  const res = await fetch(`${DB}/rest/v1/${table}`, { method: "POST", headers: { apikey: SERVICE, "content-type": "application/json", prefer: "return=representation" }, body: JSON.stringify(rows) });
  assert.equal(res.status, 201);
}
const ts = "2026-10-01T10:00:00.000Z";
async function seedHealth() {
  await insert("health_stock_locations", [{ id: 1, code: "MAIN", name: "Main warehouse", is_active: true, sort_order: 0, version: 1 }]);
  await insert("health_stock_balances", [{ location_id: 1, product_id: 1, quantity: 10, reserved: 0, updated_at: ts }, { location_id: 1, product_id: 2, quantity: 4, reserved: 0, updated_at: ts }]);
}
async function open(page, house, tab, extra = "") {
  await login(page, house);
  await page.goto(`${BASE}${house === "beauty" ? "/beauty/operator" : "/operator"}/warehouse?tab=${tab}${extra}`, { waitUntil: "networkidle" });
}
const line = (page, sku) => page.locator(`[data-testid="wh-count-line"][data-sku="${sku}"]`);
async function startCount(page, label) {
  await page.getByTestId("wh-count-new").click();
  if (label) await page.getByTestId("wh-count-start-form").getByLabel("انبار").selectOption({ label });
  await page.getByTestId("wh-count-start").click();
  await page.getByTestId("wh-count-lines").waitFor();
}

test("Health: start a count, type quantities, close it — one adjustment per difference, posted once, the count is then frozen", async () => {
  await seedHealth();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  await open(page, "health", "counts");
  await page.getByText("هنوز شمارشی انجام نشده").waitFor();
  await startCount(page, "MAIN — Main warehouse");
  assert.match(page.url(), /tab=counts&count=1/);
  assert.equal(await page.getByTestId("wh-count-line").count(), 2);
  assert.match(await line(page, "E2E-1").innerText(), /10/, "the expected quantity is the stock at the start");

  await line(page, "E2E-1").getByTestId("wh-count-input").fill("8");
  await line(page, "E2E-2").getByTestId("wh-count-input").fill("4");
  assert.match(await line(page, "E2E-1").getByTestId("wh-count-diff").innerText(), /-2/, "the difference is shown while typing");
  await page.getByTestId("wh-count-save").click();
  await page.getByTestId("wh-count-msg").waitFor();
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await line(page, "E2E-1").getByTestId("wh-count-input").inputValue(), "8", "the entry was saved");

  // another person moves stock meanwhile: the count keeps its snapshot, the difference is applied to the NEW balance
  await fetch(`${DB}/rest/v1/rpc/health_stock_post`, { method: "POST", headers: { apikey: SERVICE, "content-type": "application/json" }, body: JSON.stringify({ p_key: "other-person-1", p_kind: "receive", p_product: 1, p_location: 1, p_qty: 5, p_actor_label: "ali" }) });

  await page.getByTestId("wh-count-close").click();
    await page.getByTestId("wh-count-status").filter({ hasText: "بسته" }).waitFor();
  const st = await state();
  const b = st.health_stock_balances.find((r) => r.product_id === 1);
  assert.equal(b.quantity, 13, "10 + 5 received meanwhile − 2 counted difference");
  const adj = st.health_stock_movements.filter((m) => m.kind === "adjust");
  assert.deepEqual(adj.map((m) => [m.product_id, m.delta, m.idempotency_key, m.reference]), [[1, -2, "count-1-1", "count-1"]], "only the line with a difference posts");
  assert.equal(st.health_stock_counts[0].status, "closed");
  assert.equal(st.health_stock_counts[0].differences, 1);
  assert.ok(st.operator_audit_log.some((r) => r.action === "stock.count_close" && r.result === "success"));

  // frozen: read-only now, and the server refuses a save from a stale screen
  assert.equal(await page.getByTestId("wh-count-input").count(), 0);
  const res = await fetch(`${DB}/rest/v1/health_stock_count_lines?count_id=eq.1&product_id=eq.1`, { method: "PATCH", headers: { apikey: SERVICE, "content-type": "application/json" }, body: JSON.stringify({ counted: 99 }) });
  assert.equal(res.status, 400);

  // the count's CSV
  const dl = page.waitForEvent("download");
  await page.getByTestId("wh-count-csv").click();
  const file = await dl;
  assert.match(file.suggestedFilename(), /^stock-count-1\.csv$/);
  const text = await (await import("node:fs/promises")).readFile(await file.path(), "utf8");
  assert.match(text, /^﻿sku,expected,counted,difference/);
  assert.match(text, /E2E-1,10,8,-2/);

  // a new count can start once the first is closed, and the list shows both
  await page.goto(`${BASE}/operator/warehouse?tab=counts`, { waitUntil: "networkidle" });
  await startCount(page, "MAIN — Main warehouse");
  await page.goto(`${BASE}/operator/warehouse?tab=counts`, { waitUntil: "networkidle" });
  assert.equal(await page.getByTestId("wh-count-row").count(), 2);
  await ctx.close();
});

test("Health: one open count per warehouse; nothing counted cannot be closed; a cancelled count posts nothing; a stale screen cannot save into a closed count", async () => {
  await seedHealth();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await open(page, "health", "counts");
  await startCount(page, "MAIN — Main warehouse");
  // a second open count on the same warehouse is refused
  const dup = await fetch(`${DB}/rest/v1/health_stock_counts`, { method: "POST", headers: { apikey: SERVICE, "content-type": "application/json" }, body: JSON.stringify({ location_id: 1 }) });
  assert.equal(dup.status, 409);
  assert.equal(await page.getByTestId("wh-count-close").isDisabled(), true, "nothing counted yet");

  // a second screen closes the count while this one still shows it open
  const other = await ctx.newPage();
  await other.goto(`${BASE}/operator/warehouse?tab=counts&count=1`, { waitUntil: "networkidle" });
  await other.getByTestId("wh-count-cancel").click();
  await other.waitForURL(/tab=counts$/);
  await line(page, "E2E-1").getByTestId("wh-count-input").fill("1");
  await page.getByTestId("wh-count-save").click();
  await page.getByTestId("wh-count-msg").waitFor();
  assert.match(await page.getByTestId("wh-count-msg").innerText(), /بسته یا لغو شده/);
  const st = await state();
  assert.equal(st.health_stock_counts[0].status, "cancelled");
  assert.equal(st.health_stock_movements?.length ?? 0, 0, "a cancelled count posted nothing");
  await ctx.close();
});

test("Health: a difference that cannot be posted keeps the count open and names the product; fixing the stock and closing again works", async () => {
  await seedHealth();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await open(page, "health", "counts");
  await startCount(page, "MAIN — Main warehouse");
  await line(page, "E2E-2").getByTestId("wh-count-input").fill("0");        // −4 …
  // … but 3 of the 4 are reserved meanwhile, so only 1 is usable and the −4 adjustment is refused
  await fetch(`${DB}/rest/v1/rpc/health_stock_reserve`, { method: "POST", headers: { apikey: SERVICE, "content-type": "application/json" }, body: JSON.stringify({ p_key: "reserve-0001", p_product: 2, p_location: 1, p_qty: 3, p_actor_label: "ali" }) });
  await page.getByTestId("wh-count-close").click();
  await page.getByTestId("wh-count-msg").waitFor();
  assert.match(await page.getByTestId("wh-count-msg").innerText(), /E2E-2/);
  assert.equal((await state()).health_stock_counts[0].status, "open");
  // release the reservation, close again
  const r = (await state()).health_stock_reservations[0];
  await fetch(`${DB}/rest/v1/rpc/health_stock_release`, { method: "POST", headers: { apikey: SERVICE, "content-type": "application/json" }, body: JSON.stringify({ p_key: "release-0001", p_reservation: r.id, p_actor_label: "ali" }) });
  await page.getByTestId("wh-count-close").click();
  await page.getByTestId("wh-count-status").filter({ hasText: "بسته" }).waitFor();
  assert.equal((await state()).health_stock_balances.find((x) => x.product_id === 2).quantity, 0);
  await ctx.close();
});

test("Health: minimum levels flag low stock, the filter shows only those, the stock CSV carries them; empty removes the level", async () => {
  await seedHealth();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  await open(page, "health", "stock");
  assert.equal(await page.getByTestId("wh-low").count(), 0);
  const row = page.getByTestId("wh-stock-row").filter({ hasText: "E2E-2" });
  await row.getByTestId("wh-level-open").click();
  const form = page.getByTestId("wh-form-level");
  await form.getByLabel("حداقل موجودی").fill("10");
  await form.getByRole("button", { name: "ذخیره" }).click();
  await form.waitFor({ state: "detached" });
  assert.deepEqual((await state()).health_stock_levels.map((l) => [l.product_id, l.min_level]), [[2, 10]]);
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.getByTestId("wh-low").count(), 1, "4 is below the minimum of 10");

  await page.getByTestId("wh-low-only").check();
  await page.getByRole("main").getByRole("button", { name: "جستجو" }).click();
  await page.waitForURL(/low=1/);
  assert.equal(await page.getByTestId("wh-stock-row").count(), 1);

  const dl = page.waitForEvent("download");
  await page.getByTestId("wh-stock-csv").click();
  const text = await (await import("node:fs/promises")).readFile(await (await dl).path(), "utf8");
  assert.match(text, /E2E-2,E2E Product 2,Main warehouse,4,0,4,10,yes/);

  await page.getByTestId("wh-level-open").click();
  await page.getByTestId("wh-form-level").getByLabel("حداقل موجودی").fill("");
  await page.getByTestId("wh-form-level").getByRole("button", { name: "ذخیره" }).click();
  await page.getByTestId("wh-form-level").waitFor({ state: "detached" });
  assert.equal((await state()).health_stock_levels.length, 0);
  await ctx.close();
});

test("Beauty: its own counts and levels, separate from Health", async () => {
  await insert("beauty_products", [{ id: 1, slug: "b1", sku: "BEAUTY-1", name_en: "Serum", name_fa: "Serum", price: 5, in_stock: true, is_active: true, created_at: ts, updated_at: ts }]);
  await insert("beauty_stock_locations", [{ id: 1, code: "BMAIN", name: "Beauty main", is_active: true, sort_order: 0, version: 1 }]);
  await insert("beauty_stock_balances", [{ location_id: 1, product_id: 1, quantity: 6, reserved: 0, updated_at: ts }]);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await open(page, "beauty", "counts");
  await startCount(page);
  await line(page, "BEAUTY-1").getByTestId("wh-count-input").fill("5");
  await page.getByTestId("wh-count-close").click();
  await page.getByTestId("wh-count-status").filter({ hasText: "بسته" }).waitFor();
  const st = await state();
  assert.equal(st.beauty_stock_balances[0].quantity, 5);
  assert.equal(st.health_stock_counts?.length ?? 0, 0, "Health has no trace of it");
  await ctx.close();
});
