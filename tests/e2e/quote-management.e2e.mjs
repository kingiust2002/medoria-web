// End-to-end: customer-request management. A visitor sends the contact form → the stored request
// gets an unguessable tracking code the visitor never sees; the panel shows code, "waiting" and
// "notice did not arrive" markers, assigns a request to someone, filters; answering a request is
// recorded; the reminder endpoint is closed without the token; the dashboard counts what waits.
// Real Chromium against the production build and a fake database (which emulates migration 32's
// insert and first-response triggers). The data is reset before every test.
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { BASE, launch, state, dbLog, resetDb, poll, login, measureInPage } from "./helpers.mjs";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
beforeEach(async () => { await resetDb(); });

const quote = async (id) => (await state()).quote_requests.find((q) => q.id === id);
const CODE = /^MH-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/;

async function panelPage(house = "health", viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await login(page, house);
  return { ctx, page };
}

async function solveCaptcha(page) {
  const q = page.locator('span[aria-live="polite"]').filter({ hasText: /\d\s*[+−-]\s*\d/ });
  await q.waitFor({ timeout: 15000 });
  const m = (await q.innerText()).match(/(\d+)\s*([+−-])\s*(\d+)/);
  const [a, op, b] = [Number(m[1]), m[2], Number(m[3])];
  return String(op === "+" ? a + b : a - b);
}

test("a contact-form request gets a tracking code the visitor never sees, and the notice result is recorded", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/health/en/contact`, { waitUntil: "networkidle" });
  const required = page.locator("form input[required]");     // name, phone, captcha answer
  await required.nth(0).fill("E2E Form Visitor");
  await required.nth(1).fill("+992900123456");
  await page.locator("form textarea").fill("Please send a quotation for 500 boxes of gloves.");
  await required.nth(2).fill(await solveCaptcha(page));
  await page.locator('form button[type="submit"]').click();
  await poll(async () => (await state()).quote_requests.some((q) => q.name === "E2E Form Visitor"), { label: "the request to be stored" });

  const row = (await state()).quote_requests.find((q) => q.name === "E2E Form Visitor");
  assert.match(row.tracking_code, CODE);
  assert.equal(row.status, "new");
  assert.equal(row.first_response_at ?? null, null);
  assert.equal(row.notify_status, "skipped", "Telegram is not configured in the e2e app: the result is 'skipped', recorded");
  assert.equal(row.notify_detail ?? null, null);
  assert.ok(!(await page.content()).includes(row.tracking_code), "the visitor must not be shown the internal tracking code");
  // the stored row was written with the service key only
  const writes = (await dbLog()).filter((l) => /quote_requests/.test(l.path) && l.method !== "GET");
  assert.ok(writes.length >= 2, "an insert and the notice-result update");
  assert.deepEqual([...new Set(writes.map((l) => l.kind))], ["service"]);
  await ctx.close();
});

test("panel: code, waiting and failed-notice markers, filter, search by code", async () => {
  const { ctx, page } = await panelPage();
  await page.goto(`${BASE}/operator/quotes`, { waitUntil: "networkidle" });

  // seeded: requests 1 and 2 are new and old (waiting), request 2's notice failed
  assert.equal(await page.getByText(/^بدون پاسخ/).count(), 2);
  assert.equal(await page.getByText("اعلان تلگرام نرسید").count(), 1);
  await page.getByRole("button", { name: /نیازمند پیگیری/ }).waitFor();
  assert.match(await page.getByRole("button", { name: /نیازمند پیگیری/ }).innerText(), /2/);

  // the filter keeps exactly those two
  await page.getByRole("button", { name: /نیازمند پیگیری/ }).click();
  await page.getByLabel("انتخاب E2E Customer 1", { exact: true }).waitFor();
  assert.equal(await page.getByLabel(/^انتخاب E2E Customer/).count(), 2);
  await page.getByRole("button", { name: /نیازمند پیگیری/ }).click();

  // the code is in the opened request and searchable
  await page.getByPlaceholder(/کد پیگیری/).fill("MH-0000-0000-0002");
  assert.equal(await page.getByLabel(/^انتخاب E2E Customer/).count(), 1);
  await page.getByLabel("انتخاب E2E Customer 2", { exact: true }).waitFor();
  await page.getByText("E2E Customer 2").first().click();
  await page.getByText("MH-0000-0000-0002").first().waitFor();
  await ctx.close();
});

test("panel: assigning a request is saved, shown, filterable and removable", async () => {
  const { ctx, page } = await panelPage();
  await page.goto(`${BASE}/operator/quotes`, { waitUntil: "networkidle" });
  await page.getByText("E2E Customer 1").first().click();
  await page.getByLabel("مسئول پیگیری").fill("  سارا  ");
  await page.getByRole("button", { name: "ذخیره مسئول" }).click();
  await page.getByText("مسئول ذخیره شد.").waitFor({ timeout: 10000 });
  assert.equal((await quote(1)).assigned_to, "سارا");

  // the badge and the assignee filter appear; the filter narrows the list
  await page.getByText("مسئول: سارا").waitFor();
  await page.getByLabel("فیلتر مسئول").selectOption("سارا");
  assert.equal(await page.getByLabel(/^انتخاب E2E Customer/).count(), 1);
  await page.getByLabel("فیلتر مسئول").selectOption("__none");
  assert.equal(await page.getByLabel(/^انتخاب E2E Customer/).count(), 2);   // requests 2 and 3 (active tab)
  await page.getByLabel("فیلتر مسئول").selectOption("");

  // remove it again
  await page.getByLabel("مسئول پیگیری").fill("");
  await page.getByRole("button", { name: "ذخیره مسئول" }).click();
  await page.getByText("مسئول برداشته شد.").waitFor({ timeout: 10000 });
  assert.equal((await quote(1)).assigned_to ?? null, null);

  // the Beauty row of the same id is untouched, and the activity log holds no typed name
  const st = await state();
  assert.equal(st.beauty_quote_requests.find((q) => q.id === 1).assigned_to ?? null, null);
  assert.ok(!JSON.stringify(st.operator_audit_log).includes("سارا"), "the assignee's name must not be in the activity log");
  assert.ok(st.operator_audit_log.some((e) => e.action === "quote.assign"), "assigning is logged");
  await ctx.close();
});

test("panel: answering a request records the first response and clears the waiting marker", async () => {
  const { ctx, page } = await panelPage();
  await page.goto(`${BASE}/operator/quotes`, { waitUntil: "networkidle" });
  assert.equal((await quote(1)).first_response_at ?? null, null);
  await page.getByText("E2E Customer 1").first().click();
  await page.locator("div.card").filter({ hasText: "E2E Customer 1" }).locator("select").selectOption("contacted");
  await poll(async () => (await quote(1)).status === "contacted", { label: "status change" });
  assert.ok((await quote(1)).first_response_at, "the first answer is time-stamped");
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await page.getByText(/^بدون پاسخ/).count(), 1, "only request 2 is still waiting");

  // archiving a waiting request is not an answer
  await page.getByText("E2E Customer 2").first().click();
  await page.getByRole("button", { name: "آرشیو", exact: true }).last().click();
  await poll(async () => (await quote(2)).status === "archived", { label: "archive" });
  assert.equal((await quote(2)).first_response_at ?? null, null);
  await ctx.close();
});

test("Beauty panel: the same code/assignee/marker features, on its own table", async () => {
  const { ctx, page } = await panelPage("beauty");
  await page.goto(`${BASE}/beauty/operator/quotes`, { waitUntil: "networkidle" });
  assert.equal(await page.getByText(/^بدون پاسخ/).count(), 1);
  await page.getByText("E2E Beauty Customer").first().click();
  await page.getByText("MB-0000-0000-0001").first().waitFor();
  await page.getByLabel("مسئول پیگیری").fill("Mina");
  await page.getByRole("button", { name: "ذخیره مسئول" }).click();
  await page.getByText("مسئول ذخیره شد.").waitFor({ timeout: 10000 });
  const st = await state();
  assert.equal(st.beauty_quote_requests.find((q) => q.id === 1).assigned_to, "Mina");
  assert.equal(st.quote_requests.find((q) => q.id === 1).assigned_to ?? null, null, "the Health table must not change");
  await ctx.close();
});

test("dashboards count what waits and which notices did not arrive", async () => {
  const { ctx, page } = await panelPage();
  await page.goto(`${BASE}/operator`, { waitUntil: "networkidle" });
  const card = async (label) => (await page.getByText(label).first().locator("xpath=ancestor::div[2]").innerText()).replace(/\s+/g, " ");
  assert.match(await card("بدون پاسخ بیش از ۲۴ ساعت"), /2/);
  assert.match(await card("اعلان تلگرام نرسیده"), /1/);
  await ctx.close();
});

test("a long unbroken assignee name and the new controls fit a 320px phone", async () => {
  const { ctx, page } = await panelPage("health", { width: 320, height: 800 });
  await page.goto(`${BASE}/operator/quotes`, { waitUntil: "networkidle" });
  await page.getByText("E2E Customer 1").first().click();
  await page.getByLabel("مسئول پیگیری").fill("A".repeat(60));
  await page.getByRole("button", { name: "ذخیره مسئول" }).click();
  await page.getByText("مسئول ذخیره شد.").waitFor({ timeout: 10000 });
  await page.waitForTimeout(300);
  const res = await page.evaluate(measureInPage);
  assert.equal(res.count, 0, `${res.count} element(s) past the screen edge: ${JSON.stringify(res.offenders.slice(0, 3))}`);
  assert.equal(await page.evaluate(() => { window.scrollTo(300, 0); return window.scrollX; }), 0);
  await ctx.close();
});

test("the reminder endpoint: closed to a missing or wrong token and to GET; with the token it answers with counts only", async () => {
  const url = `${BASE}/api/internal/quote-reminders`;
  const token = process.env.E2E_REMINDER_TOKEN;
  assert.ok(token && token.length >= 24);
  assert.equal((await fetch(url, { method: "POST" })).status, 401);
  assert.equal((await fetch(url, { method: "POST", headers: { Authorization: "Bearer nope" } })).status, 401);
  assert.equal((await fetch(url, { method: "POST", headers: { Authorization: `Basic ${token}` } })).status, 401);
  assert.equal((await fetch(url, { headers: { Authorization: `Bearer ${token}` } })).status, 405);
  const ok = await fetch(url, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get("cache-control") || "", /no-store/);
  const body = await ok.json();
  assert.equal(body.ok, true);
  assert.deepEqual(body.houses.map((h) => [h.kind, h.skipped]), [["health", "not_configured"], ["beauty", "not_configured"]]);   // no Telegram in the e2e app
  assert.ok(!/E2E Customer|\+99290/.test(JSON.stringify(body)), "no customer data in the answer");
});
