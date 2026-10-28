// The publish quality rule in a real browser, both houses (docs/PANEL_PUBLISH_RULES.md): the main manager chooses on the settings page which gaps
// block publishing; the product form shows what is still missing before a save; activating (one, many), a form save and the scheduler all obey the same
// rule; a product that is already live is not stopped for old gaps; Beauty has its own rule; the screen fits a 320 px phone.
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { BASE, DB, launch, state, resetDb, poll, login, measureInPage } from "./helpers.mjs";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
beforeEach(async () => { await resetDb(); });

const SERVICE = "service-test-key";
const TOKEN = process.env.E2E_SCHEDULE_TOKEN;
const ts = "2026-10-01T10:00:00.000Z";
const rest = (path, init = {}) => fetch(`${DB}/rest/v1/${path}`, { ...init, headers: { apikey: SERVICE, "content-type": "application/json", prefer: "return=representation", ...(init.headers || {}) } });
const patch = (table, id, body) => rest(`${table}?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(body) });
const insert = async (table, rows) => { const r = await rest(table, { method: "POST", body: JSON.stringify(rows) }); assert.equal(r.status, 201); return r.json(); };
const product = (id, o = {}) => ({ id, slug: `e2e-p${id}`, sku: `P-${id}`, name_en: `E2E Product ${id}`, name_ru: `E2E Product ${id}`, name_tg: `E2E Product ${id}`, name_fa: `E2E Product ${id}`,
  description_en: "d", description_ru: "d", description_tg: "d", description_fa: "d", price: 10, currency: "USD", unit: "box", min_order_qty: 1, brand: "E2E", category: "gloves", category_id: 1,
  in_stock: true, is_active: false, is_featured: false, specs: { A: "b" }, tags: [], views: 0, image_url: "img.png", created_at: ts, updated_at: ts, ...o });
const rule = async (house) => ((await state()).publish_rules || []).find((r) => r.house === house);

async function chooseRules(page, path, codes) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  const card = page.getByTestId("publish-rules");
  await card.waitFor();
  for (const c of codes) await card.getByTestId(`rule-${c}`).check();
  await card.getByTestId("rules-save").click();
  await card.getByTestId("rules-msg").waitFor();
  assert.match(await card.getByTestId("rules-msg").innerText(), /قوانین ذخیره شد|The rules were saved|Қоидаҳо захира/);
}

test("Health: the rule is chosen on the settings page; one activation, the form and a bulk publish all obey it; a live product keeps its old gaps", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await login(page, "health");
  // before any rule: product 2 (archived, no image) can be activated — the behaviour before this feature is unchanged
  await chooseRules(page, "/operator/settings", ["sku", "image"]);
  assert.deepEqual((await rule("health")).blocking, ["image", "sku"], "stored in the display order");
  assert.equal(await rule("beauty"), undefined, "Beauty has no rule");

  // 1) the list: activating the incomplete archived product is refused in words that name the gap
  await page.goto(`${BASE}/operator/products?status=inactive`, { waitUntil: "networkidle" });
  await page.getByTitle("فعال‌سازی").first().click();
  await page.getByText(/انتشار ممکن نیست/).waitFor();
  assert.match(await page.locator("body").innerText(), /تصویر/);
  assert.equal((await state()).products.find((p) => p.id === 2).is_active, false, "nothing was switched on");

  // 2) the form tells before the save, and the save is refused with the same words; the typed values stay
  await page.goto(`${BASE}/operator/products/2/edit`, { waitUntil: "networkidle" });
  assert.equal(await page.getByTestId("publish-gaps").count(), 0, "a draft is not judged");
  await page.getByText("فعال (نمایش در سایت)").click();
  const hint = page.getByTestId("publish-gaps");
  await hint.waitFor();
  assert.match(await hint.innerText(), /تصویر/);
  await page.getByRole("button", { name: "ذخیره تغییرات" }).first().click();
  await page.getByRole("alert").filter({ hasText: "انتشار ممکن نیست" }).waitFor();
  assert.equal((await state()).products.find((p) => p.id === 2).is_active, false);
  // …and a draft with the same gap still saves (a rule never stops saving drafts)
  await page.getByText("فعال (نمایش در سایت)").click();
  await page.getByLabel(/قیمت \(دلار\)/).fill("21");
  await page.getByRole("button", { name: "ذخیره تغییرات" }).first().click();
  await page.waitForURL(/\/operator\/products$/);
  assert.equal((await state()).products.find((p) => p.id === 2).price, 21);

  // 3) once the gap is closed it goes live
  await patch("products", 2, { image_url: "img.png" });
  await page.goto(`${BASE}/operator/products?status=inactive`, { waitUntil: "networkidle" });
  await page.getByTitle("فعال‌سازی").first().click();
  await poll(async () => (await state()).products.find((p) => p.id === 2).is_active === true, { label: "product 2 live" });

  // 4) a product that is ALREADY live with an old gap (product 1 has no image): an unrelated edit is fine, a NEW gap is not
  await patch("products", 1, { image_url: null });
  await page.goto(`${BASE}/operator/products/1/edit`, { waitUntil: "networkidle" });
  await page.getByLabel(/قیمت \(دلار\)/).fill("11");
  await page.getByRole("button", { name: "ذخیره تغییرات" }).first().click();
  await page.waitForURL(/\/operator\/products$/);
  assert.equal((await state()).products.find((p) => p.id === 1).price, 11, "the old gap did not stop an unrelated edit");
  await page.goto(`${BASE}/operator/products/1/edit`, { waitUntil: "networkidle" });
  await page.getByLabel("کد محصول (SKU)").fill("");
  await page.getByRole("button", { name: "ذخیره تغییرات" }).first().click();
  await page.getByRole("alert").filter({ hasText: "انتشار ممکن نیست" }).waitFor();
  assert.notEqual((await state()).products.find((p) => p.id === 1).name_tg, "", "the new gap was refused");

  // 5) bulk: the complete one is published, the incomplete one is listed with what it lacks
  await insert("products", [product(20), product(21, { image_url: null }), product(22, { image_url: null, sku: "" })]);
  await page.goto(`${BASE}/operator/products?status=inactive`, { waitUntil: "networkidle" });
  await page.getByLabel(/انتخاب همه/).check();
  await page.getByRole("button", { name: "فعال‌سازی" }).first().click();
  await page.getByText(/محصول به‌خاطر ناقص‌بودن منتشر نشد/).waitFor();
  const flash = await page.locator("body").innerText();
  assert.match(flash, /P-21/); assert.match(flash, /#22/);
  const st = (await state()).products;
  assert.deepEqual([20, 21, 22].map((id) => st.find((p) => p.id === id).is_active), [true, false, false]);

  // 6) the scheduler obeys it too: a due product with a gap stays inactive and keeps its date
  const past = new Date(Date.now() - 3_600_000).toISOString();
  await insert("products", [product(30, { publish_at: past, image_url: null }), product(31, { publish_at: past })]);
  const res = await fetch(`${BASE}/api/internal/scheduled-publishing`, { method: "POST", headers: { authorization: `Bearer ${TOKEN}` } });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.houses.health.blocked, 1);
  const st2 = (await state()).products;
  assert.deepEqual([st2.find((p) => p.id === 30).is_active, !!st2.find((p) => p.id === 30).publish_at, st2.find((p) => p.id === 31).is_active], [false, true, true]);
  assert.ok((await state()).operator_audit_log.some((r) => r.action === "publish_rules.update"), "the rule change is in the activity log");
  assert.ok((await state()).operator_audit_log.some((r) => r.action === "product.scheduled_blocked"));
  await ctx.close();
});

test("Beauty: its own rule, its own screen; the Health rule does not reach it; the rules card fits a 320 px phone", async () => {
  await insert("beauty_products", [{ ...product(11), slug: "e2e-serum", sku: "B-11", image_url: null, category_id: null, category: null, brand: "Luxe" }]);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await login(page, "health");
  await chooseRules(page, "/operator/settings", ["image"]);
  const bctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const bpage = await bctx.newPage();
  await login(bpage, "beauty");
  // Health's rule does not touch Beauty: the incomplete Beauty product can still be switched on
  await bpage.goto(`${BASE}/beauty/operator/products`, { waitUntil: "networkidle" });
  await bpage.getByTitle("فعال‌سازی").first().click();
  await poll(async () => (await state()).beauty_products.find((p) => p.id === 11).is_active === true, { label: "Beauty product live without a Beauty rule" });
  await patch("beauty_products", 11, { is_active: false });
  await chooseRules(bpage, "/beauty/operator/settings", ["image", "specs"]);
  assert.deepEqual((await rule("beauty")).blocking, ["image", "specs"]);
  assert.deepEqual((await rule("health")).blocking, ["image"]);
  await bpage.goto(`${BASE}/beauty/operator/products`, { waitUntil: "networkidle" });
  await bpage.getByTitle("فعال‌سازی").first().click();
  await bpage.getByText(/انتشار ممکن نیست/).waitFor();
  assert.equal((await state()).beauty_products.find((p) => p.id === 11).is_active, false);
  // 320 px
  for (const [p, path] of [[bpage, "/beauty/operator/settings"], [page, "/operator/settings"]]) {
    await p.setViewportSize({ width: 320, height: 700 });
    await p.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    await p.getByTestId("publish-rules").waitFor();
    const m = await p.evaluate(measureInPage);
    assert.equal(m.count, 0, `${path}: ${JSON.stringify(m.offenders?.slice(0, 3))}`);
  }
  await ctx.close(); await bctx.close();
});
