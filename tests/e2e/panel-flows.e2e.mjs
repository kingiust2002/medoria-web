// End-to-end: the operator panels and what the public sees afterwards.
// Runs in a real (emulated-desktop) Chromium against the production build with a fake database
// (tests/e2e/fakeDb.mjs). Covers: access without login, login, price change → public page,
// archive → real 404 → reactivate, the Quotes screen (tabs, bulk, delete), Health/Beauty
// separation. The data is restored at the end of every flow and asserted.
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { BASE, launch, state, dbLog, resetDb, poll, get, login } from "./helpers.mjs";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
beforeEach(async () => { await resetDb(); });

const product = async (id) => (await state()).products.find((p) => p.id === id);
const quote = async (id) => (await state()).quote_requests.find((q) => q.id === id);

async function panelPage(house = "health") {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await login(page, house);
  return { ctx, page };
}

test("panels are closed to anonymous visitors", async () => {
  for (const path of ["/operator", "/operator/products", "/operator/quotes", "/beauty/operator", "/beauty/operator/quotes"]) {
    const r = await get(path);
    assert.ok(r.status >= 300 && r.status < 400, `${path} answered ${r.status} without a session`);
    assert.match(String(r.location), /\/login/, `${path} did not send the visitor to the login page`);
  }
  const bad = await fetch(`${BASE}/api/operator/login`, { method: "POST", headers: { "content-type": "application/json", origin: BASE }, body: JSON.stringify({ username: "x", password: "y" }) });
  assert.equal(bad.status, 401);
});

test("a wrong password is refused, the right one opens the Health panel", async () => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login/health`, { waitUntil: "networkidle" });
  await page.fill('input[name="username"]', process.env.E2E_HEALTH_USER);
  await page.fill('input[name="password"]', "not-the-password");
  await page.click('button[type="submit"]');
  await page.getByText("نام کاربری یا رمز عبور نادرست است.").waitFor({ timeout: 10000 });
  assert.match(page.url(), /\/login\/health/);
  await ctx.close();
  const { ctx: ok, page: p2 } = await panelPage();
  assert.match(p2.url(), /\/operator/);
  await ok.close();
});

test("price change in the panel reaches the public product page, and is restored", async () => {
  const url = "/health/en/catalog/e2e-gloves";
  const before = await get(url);
  assert.equal(before.status, 200);
  assert.ok(before.text.includes("$10.00"), "baseline price not shown");

  const { ctx, page } = await panelPage();
  await page.goto(`${BASE}/operator/products`, { waitUntil: "networkidle" });
  const row = page.locator("div", { hasText: "E2E Product 1" }).filter({ has: page.locator('button[title="ویرایش قیمت"]') }).last();
  await row.locator('button[title="ویرایش قیمت"]').click();
  await row.locator('input[type="number"]').fill("12.5");
  await row.locator('input[type="number"]').press("Enter");
  await page.getByText("قیمت ذخیره شد.").waitFor({ timeout: 10000 });
  assert.equal(Number((await product(1)).price), 12.5, "the database did not receive the new price");

  const shown = await poll(async () => { const r = await get(url); return r.status === 200 && r.text.includes("$12.50") && !r.text.includes("$10.00"); }, { label: "new price on the public page" });
  console.log(`   new price visible on the public page after ${shown.ms} ms`);

  // restore
  await page.goto(`${BASE}/operator/products`, { waitUntil: "networkidle" });
  const row2 = page.locator("div", { hasText: "E2E Product 1" }).filter({ has: page.locator('button[title="ویرایش قیمت"]') }).last();
  await row2.locator('button[title="ویرایش قیمت"]').click();
  await row2.locator('input[type="number"]').fill("10");
  await row2.locator('input[type="number"]').press("Enter");
  await page.getByText("قیمت ذخیره شد.").waitFor({ timeout: 10000 });
  await poll(async () => { const r = await get(url); return r.text.includes("$10.00") && !r.text.includes("$12.50"); }, { label: "original price back on the public page" });
  assert.equal(Number((await product(1)).price), 10);
  await ctx.close();
});

test("archiving gives a real 404 everywhere, reactivating brings the page back", async () => {
  const slug = "e2e-gloves";
  assert.equal((await get(`/health/en/catalog/${slug}`)).status, 200);
  assert.equal((await get("/health/en/catalog/e2e-archived")).status, 404, "a product archived from the start must be a 404");
  assert.ok(!(await get("/sitemap.xml")).text.includes("e2e-archived"), "an archived product is listed in the sitemap");

  const { ctx, page } = await panelPage();
  await page.goto(`${BASE}/operator/products`, { waitUntil: "networkidle" });
  const rowOf = () => page.locator("div", { hasText: "E2E Product 1" }).filter({ has: page.locator('button[title="آرشیو (غیرفعال)"], button[title="فعال‌سازی"]') }).last();
  await rowOf().locator('button[title="آرشیو (غیرفعال)"]').click();
  await page.getByText("آرشیو شد.").first().waitFor({ timeout: 10000 });
  assert.equal((await product(1)).is_active, false);

  for (const lang of ["en", "ru", "tg", "fa"]) {
    const gone = await poll(async () => (await get(`/health/${lang}/catalog/${slug}`)).status === 404, { label: `${lang} product page to become 404` });
    console.log(`   /health/${lang}/catalog/${slug} became 404 after ${gone.ms} ms`);
  }
  assert.ok(!(await get("/sitemap.xml")).text.includes(slug), "the archived product is still in the sitemap");

  await page.goto(`${BASE}/operator/products`, { waitUntil: "networkidle" });
  await rowOf().locator('button[title="فعال‌سازی"]').click();
  await page.getByText("فعال شد.").first().waitFor({ timeout: 10000 });
  assert.equal((await product(1)).is_active, true);
  const back = await poll(async () => (await get(`/health/en/catalog/${slug}`)).status === 200, { label: "product page to come back" });
  console.log(`   page came back after ${back.ms} ms`);
  assert.ok((await get("/sitemap.xml")).text.includes(slug), "the reactivated product is missing from the sitemap");
  await ctx.close();
});

test("Quotes screen: tabs, tick selection, bulk archive/restore/delete, single delete", async () => {
  const { ctx, page } = await panelPage();
  await page.goto(`${BASE}/operator/quotes`, { waitUntil: "networkidle" });
  const tabText = async () => (await page.locator('[role="tab"]').allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
  assert.deepEqual(await tabText(), ["فعال 3", "آرشیو 1", "اسپم 1", "همه 5"]);

  // tick the two "new" requests and archive them in one go
  await page.getByLabel("انتخاب E2E Customer 1", { exact: true }).check();
  await page.getByLabel("انتخاب E2E Customer 2", { exact: true }).check();
  await page.getByText("2 مورد انتخاب شده").waitFor();
  await page.getByRole("button", { name: "آرشیو", exact: true }).first().click();
  await page.getByText("2 درخواست به آرشیو منتقل شد.").waitFor({ timeout: 10000 });
  const st = (await state()).quote_requests.map((q) => `${q.id}:${q.status}`).sort();
  assert.deepEqual(st, ["1:archived", "2:archived", "3:contacted", "4:spam", "5:archived"]);

  // restore both from the archive tab
  await page.getByRole("tab", { name: /آرشیو/ }).click();
  await page.waitForURL(/tab=archived/);                      // the tab is an address now: wait for the server-rendered list of that tab
  await page.getByLabel(/انتخاب همه/).check();
  await page.getByRole("button", { name: /بازگردانی به «جدید»/ }).click();
  await page.getByText("3 درخواست بازگردانی شد.").waitFor({ timeout: 10000 });
  assert.equal((await quote(5)).status, "new");

  // single delete with the confirmation showing the request
  await page.getByRole("tab", { name: /همه/ }).click();
  await page.waitForURL(/tab=all/);
  await page.getByRole("button", { name: "حذف درخواست E2E Customer 3" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText("E2E Customer 3").waitFor();
  await dialog.getByRole("button", { name: "حذف درخواست" }).click();
  await poll(async () => (await quote(3)) === undefined, { label: "request 3 to be deleted" });

  // bulk delete of what is left in the spam tab
  await page.getByRole("tab", { name: /اسپم/ }).click();
  await page.waitForURL(/tab=spam/);
  await page.getByLabel(/انتخاب همه/).check();
  await page.getByRole("button", { name: "حذف", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^حذف \d+ درخواست$/ }).click();
  await poll(async () => (await quote(4)) === undefined, { label: "request 4 to be deleted" });
  await ctx.close();

  // privacy: the customer tables were only ever touched with the service key
  const log = await dbLog();
  const touched = log.filter((l) => /quote_requests/.test(l.path));
  assert.ok(touched.length > 0);
  assert.deepEqual([...new Set(touched.map((l) => l.kind))], ["service"], "a customer-request table was reached with a non-service key");
});

test("a Health session does not open the Beauty panel (and the reverse)", async () => {
  const { ctx, page } = await panelPage("health");
  await page.goto(`${BASE}/beauty/operator/quotes`, { waitUntil: "networkidle" });
  assert.match(page.url(), /\/login/, "Health session reached the Beauty panel");
  await ctx.close();

  const { ctx: b, page: bp } = await panelPage("beauty");
  await bp.goto(`${BASE}/operator/quotes`, { waitUntil: "networkidle" });
  assert.match(bp.url(), /\/login/, "Beauty session reached the Health panel");
  await b.close();
});

test("the public pages never ask the database for customer requests", async () => {
  for (const p of ["/health/en", "/health/en/catalog", "/health/en/catalog/e2e-gloves", "/health/en/contact", "/beauty/en"]) await get(p);
  const log = await dbLog();
  const bad = log.filter((l) => /quote_requests|contact_inquiries/.test(l.path) && l.kind !== "service");
  assert.deepEqual(bad, []);
});
