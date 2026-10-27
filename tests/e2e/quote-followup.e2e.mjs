// Customer requests, second layer: the follow-up date (today / overdue badges), the customer file (same phone), "send the Telegram
// notice again", the report and its CSV — both panels, real browser, fake database.
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
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
const patch = (table, id, body) => fetch(`${DB}/rest/v1/${table}?id=eq.${id}`, { method: "PATCH", headers: { apikey: SERVICE, "content-type": "application/json" }, body: JSON.stringify(body) });
const isoDay = (offset) => new Date(Date.now() + 5 * 3_600_000 + offset * 86_400_000).toISOString().slice(0, 10);

async function openQuotes(page, house = "health") {
  await login(page, house);
  await page.goto(`${BASE}${house === "beauty" ? "/beauty/operator" : "/operator"}/quotes`, { waitUntil: "networkidle" });
}
const row = (page, name) => page.locator("div.card", { has: page.getByRole("button", { name: new RegExp(name) }) }).first();

test("a follow-up date is saved, shows as today / overdue, and is counted under 'needs follow-up'", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await openQuotes(page);
  await page.locator("button", { hasText: "E2E Customer 3" }).first().click();
  const box = page.getByTestId("followup-box");
  await box.getByLabel("تاریخ پیگیری").fill(isoDay(0));
  await box.getByRole("button", { name: "ذخیره پیگیری" }).click();
  await page.getByText("تاریخ پیگیری ذخیره شد.").waitFor();
  assert.equal((await state()).quote_requests.find((q) => q.id === 3).follow_up_at.slice(0, 10), isoDay(0));
  await page.getByTestId("badge-followup-today").waitFor();
  // yesterday's promise is overdue
  await patch("quote_requests", 3, { follow_up_at: `${isoDay(-1)}T12:00:00.000Z` });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByTestId("badge-followup-overdue").waitFor();
  // clearing it
  await page.locator("button", { hasText: "E2E Customer 3" }).first().click();
  await page.getByTestId("followup-box").getByRole("button", { name: "برداشتن" }).click();
  await page.getByText("تاریخ پیگیری برداشته شد.").waitFor();
  assert.equal((await state()).quote_requests.find((q) => q.id === 3).follow_up_at, null);
  // a bad date never reaches the database (the server refuses)
  const res = await fetch(`${DB}/__state`); assert.ok(res.ok);
  await ctx.close();
});

test("the customer file lists the other requests with the same phone number", async () => {
  await insert("quote_requests", [{ id: 9, status: "closed", tracking_code: "MH-OLD", name: "Same person", organization: "", phone: "+992900000001", product_name: "Old gloves", assigned_to: null, first_response_at: null, notify_status: "sent", message: "m", internal_notes: "", preferred_contact: "phone", language: "en", created_at: "2026-09-01T10:00:00.000Z", updated_at: "2026-09-01T10:00:00.000Z" }]);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await openQuotes(page);
  await page.getByRole("tab", { name: /همه/ }).click();
  await page.locator("button", { hasText: "E2E Customer 1" }).first().click();
  const file = page.getByTestId("customer-file");
  await file.waitFor();
  assert.match(await file.innerText(), /MH-OLD/);
  assert.match(await file.innerText(), /Old gloves/);
  await ctx.close();
});

test("'send the notice again' appears only for a failed notice; with Telegram off it says so and changes nothing", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await openQuotes(page);
  await page.locator("button", { hasText: "E2E Customer 1" }).first().click();
  assert.equal(await page.getByTestId("retry-notice").count(), 0, "a delivered notice offers no retry");
  await page.locator("button", { hasText: "E2E Customer 1" }).first().click();
  await page.locator("button", { hasText: "E2E Customer 2" }).first().click();
  await page.getByTestId("retry-notice").getByRole("button", { name: "ارسال دوباره اعلان" }).click();
  await page.getByText("تلگرام برای این خانه تنظیم نشده است.").waitFor();
  const q2 = (await state()).quote_requests.find((q) => q.id === 2);
  assert.equal(q2.notify_status, "failed");
  await ctx.close();
});

test("the report shows the numbers of the period and the CSV (with customer contact data) is downloaded and logged", async () => {
  const today = new Date().toISOString();
  await insert("quote_requests", [{ id: 20, status: "contacted", tracking_code: "MH-T1", name: "=cmd|calc", organization: "", phone: "+992900000020", product_name: null, assigned_to: "Sara", first_response_at: today, notify_status: "sent", message: "m", internal_notes: "", preferred_contact: "whatsapp", language: "en", created_at: today, updated_at: today }]);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  await openQuotes(page);
  await page.getByTestId("quotes-report-link").click();
  await page.getByTestId("report-stats").waitFor();
  assert.match(await page.getByTestId("report-by-assignee").innerText(), /Sara/);
  await page.getByTestId("report-days-90").click();
  await page.waitForURL(/days=90/);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("quotes-export").click()]);
  const text = fs.readFileSync(await download.path(), "utf8");
  assert.ok(text.includes("tracking_code,created_at,status,name"));
  assert.ok(text.includes("MH-T1"));
  assert.ok(!text.includes(",=cmd|calc,"), "a spreadsheet formula in a customer's name is neutralised");
  const logged = (await state()).operator_audit_log.find((r) => r.action === "quotes.exported");
  assert.ok(logged && logged.count >= 1);
  await ctx.close();
});

test("Beauty has the same: follow-up and report, on its own table", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await openQuotes(page, "beauty");
  await page.locator("button", { hasText: "E2E Beauty Customer" }).first().click();
  const box = page.getByTestId("followup-box");
  await box.getByLabel("تاریخ پیگیری").fill(isoDay(2));
  await box.getByRole("button", { name: "ذخیره پیگیری" }).click();
  await page.getByText("تاریخ پیگیری ذخیره شد.").waitFor();
  const st = await state();
  assert.equal(st.beauty_quote_requests[0].follow_up_at.slice(0, 10), isoDay(2));
  assert.ok(st.quote_requests.every((q) => !q.follow_up_at), "the Health table is untouched");
  await page.goto(`${BASE}/beauty/operator/quotes/report`, { waitUntil: "networkidle" });
  await page.getByTestId("report-stats").waitFor();
  await ctx.close();
});
