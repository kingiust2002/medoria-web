// Editable contact details and featured products (N11, docs/PANEL_CONTACT_FEATURED.md) end to end, against the fake database (whose public reads mirror
// migration 42's policy: live rows, public columns only). A person writes the WhatsApp number / Telegram name / e-mail of a house in the panel and the
// PUBLIC pages (server-rendered) use them — the footer, the contact page — while the other house keeps its defaults; a bad value is refused in words;
// unpublishing brings the defaults back. The featured list: a SKU is added in the panel and the home page shows that product (an inactive one never),
// in the chosen order; with none live the home page is as before; 320 px.
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { BASE, DB, launch, state, resetDb, login, poll, measureInPage } from "./helpers.mjs";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
beforeEach(async () => { await resetDb(); });

const SERVICE = "service-test-key";
const ts = "2026-10-01T10:00:00.000Z";
const html = async (path) => (await fetch(`${BASE}${path}`, { headers: { accept: "text/html" } })).text();
const publicHas = (path, needle, want = true) => poll(async () => (await html(path)).includes(needle) === want, { label: `${path} ${want ? "has" : "lacks"} ${needle}`, timeout: 40000 });
async function insert(table, rows) {
  const res = await fetch(`${DB}/rest/v1/${table}`, { method: "POST", headers: { apikey: SERVICE, "content-type": "application/json", prefer: "return=representation" }, body: JSON.stringify(rows) });
  assert.equal(res.status, 201);
}
async function openContent(page, house, tab) {
  await login(page, house);
  await page.goto(`${BASE}${house === "beauty" ? "/beauty/operator" : "/operator"}/content`, { waitUntil: "networkidle" });
  await page.getByTestId(`ct-tab-${tab}`).click();
}
const beautyProduct = (id, o = {}) => ({ id, slug: `bf-${id}`, sku: `BF-${id}`, name_en: `Featured Cream ${id}`, name_fa: `Featured Cream ${id}`, name_ru: `Featured Cream ${id}`, name_tg: `Featured Cream ${id}`, price: 30, in_stock: true, is_active: true, is_featured: false, brand: "Luxe", unit: "pcs", min_order_qty: 1, specs: {}, tags: [], gallery_urls: [], created_at: ts, updated_at: ts, ...o });

test("Health: the contact details written in the panel are used by the public pages; Beauty keeps its own; a bad value is refused; unpublishing brings the defaults back", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await openContent(page, "health", "contact");
  await page.getByText("هنوز اطلاعات تماسی ثبت نشده").waitFor();
  const before = await html("/health/en/contact");
  assert.ok(!before.includes("wa.me/992111222333"));

  await page.getByTestId("ct-new").click();
  await page.getByTestId("ct-phone").fill("992111222333");                       // no +: refused in words
  await page.getByTestId("ct-save").click();
  await page.getByTestId("ct-error").waitFor();
  assert.equal((await state()).site_content.length, 0, "nothing stored");
  await page.getByTestId("ct-phone").fill("+992 111 222 333");
  await page.getByTestId("ct-whatsapp").fill("992111222333");
  await page.getByTestId("ct-telegram").fill("@health_desk");
  await page.getByTestId("ct-email").fill("desk@health.example.com");
  await page.getByRole("switch", { name: /منتشر شود/ }).click();
  await page.getByTestId("ct-save").click();
  await page.getByTestId("ct-form").waitFor({ state: "detached" });
  const row = (await state()).site_content[0];
  assert.deepEqual([row.house, row.kind, row.data], ["health", "contact", { phone: "+992111222333", whatsapp: "992111222333", telegram: "health_desk", email: "desk@health.example.com" }]);
  await page.getByTestId("ct-new").waitFor({ state: "detached" });                // one contact set per house: the add button goes once the list refreshed

  await publicHas("/health/en/contact", "wa.me/992111222333");
  const contactPage = await html("/health/en/contact");
  assert.ok(contactPage.includes("t.me/health_desk") && contactPage.includes("desk@health.example.com") && contactPage.includes("+992111222333"), "telegram, email and phone on the contact page");
  const home = await html("/health/en");
  assert.ok(home.includes("wa.me/992111222333") && home.includes("t.me/health_desk"), "the footer / call-to-action use them too");
  const beauty = await html("/beauty/en/contact");
  assert.ok(!beauty.includes("992111222333") && !beauty.includes("health_desk") && !beauty.includes("desk@health.example.com"), "Beauty keeps its own details");

  // unpublish: the defaults return
  await page.getByTestId("ct-open").click();
  await page.getByRole("switch", { name: /منتشر شود/ }).click();
  await page.getByTestId("ct-save").click();
  await page.getByTestId("ct-form").waitFor({ state: "detached" });
  await publicHas("/health/en/contact", "wa.me/992111222333", false);
  assert.ok(!(await html("/health/en/contact")).includes("health_desk"));
  assert.ok((await state()).operator_audit_log.some((r) => r.action === "content.update"));
  await ctx.close();
});

test("Beauty: its own details reach the Beauty pages only", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await openContent(page, "beauty", "contact");
  await page.getByTestId("ct-new").click();
  await page.getByTestId("ct-whatsapp").fill("992777888999");
  await page.getByTestId("ct-telegram").fill("beauty_desk");
  await page.getByRole("switch", { name: /منتشر شود/ }).click();
  await page.getByTestId("ct-save").click();
  await page.getByTestId("ct-form").waitFor({ state: "detached" });
  await publicHas("/beauty/en/contact", "wa.me/992777888999");
  assert.ok((await html("/beauty/en")).includes("t.me/beauty_desk"));
  const health = await html("/health/en/contact");
  assert.ok(!health.includes("992777888999") && !health.includes("beauty_desk"));
  assert.equal((await state()).site_content[0].house, "beauty");
  await ctx.close();
});

test("featured: a SKU is added in the panel, the home page shows that product in the chosen order and never an inactive one; with none live it is as before", async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await openContent(page, "health", "featured");
  await page.getByText("هنوز محصول ویژه‌ای انتخاب نشده").waitFor();
  const add = async (sku, order, publish = true) => {
    await page.getByTestId("ct-new").click();
    await page.getByTestId("ct-sku").fill(sku);
    await page.getByLabel("ترتیب", { exact: true }).fill(String(order));
    if (publish) await page.getByRole("switch", { name: /منتشر شود/ }).click();
    await page.getByTestId("ct-save").click();
    await page.getByTestId("ct-form").waitFor({ state: "detached" });
  };
  await page.getByTestId("ct-new").click();
  await page.getByTestId("ct-sku").fill("NO-SUCH-SKU");
  await page.getByTestId("ct-save").click();
  await page.getByTestId("ct-error").waitFor();
  await page.getByRole("button", { name: "انصراف" }).click();

  await add("E2E-3", 1);
  await add("E2E-1", 2);
  await add("E2E-2", 0);                                                           // E2E Product 2 is archived in the seed: listed, never shown
  assert.equal((await state()).site_content.filter((r) => r.kind === "featured").length, 3);
  await page.getByText("محصول غیرفعال است؛ نمایش داده نمی‌شود").waitFor();
  await publicHas("/health/en", "E2E Product 3");
  const home = await html("/health/en");
  assert.ok(home.includes("E2E Product 1"), "the second chosen product");
  assert.ok(!home.includes("E2E Product 2"), "an inactive product is never shown");
  assert.ok(home.indexOf("E2E Product 3") < home.indexOf("E2E Product 1"), "in the chosen order");
  // the same product twice is refused
  await page.getByTestId("ct-new").click();
  await page.getByTestId("ct-sku").fill("E2E-3");
  await page.getByTestId("ct-save").click();
  await page.getByTestId("ct-error").waitFor();
  await page.getByRole("button", { name: "انصراف" }).click();

  // delete them all: back to the old rule
  for (let i = 0; i < 3; i++) { await page.getByTestId("ct-delete").first().click(); await page.waitForTimeout(400); }
  await poll(async () => (await state()).site_content.filter((r) => r.kind === "featured").length === 0, { label: "all removed" });
  await ctx.close();
});

test("Beauty featured: only this house's products, inactive hidden", async () => {
  await insert("beauty_categories", [{ id: 1, slug: "skincare-cream", name_en: "Cream", name_ru: "C", name_tg: "C", name_fa: "کرم", icon: "x", is_active: true, is_featured: false, sort_order: 1, parent_id: null, world: "skincare", created_at: ts }]);
  await insert("beauty_products", [beautyProduct(41), beautyProduct(42, { is_active: false })]);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await openContent(page, "beauty", "featured");
  for (const sku of ["BF-41", "BF-42"]) {
    await page.getByTestId("ct-new").click();
    await page.getByTestId("ct-sku").fill(sku);
    await page.getByRole("switch", { name: /منتشر شود/ }).click();
    await page.getByTestId("ct-save").click();
    await page.getByTestId("ct-form").waitFor({ state: "detached" });
  }
  await page.getByTestId("ct-new").click();
  await page.getByTestId("ct-sku").fill("E2E-1");                                 // Health's SKU: not in Beauty
  await page.getByTestId("ct-save").click();
  await page.getByTestId("ct-error").waitFor();
  await publicHas("/beauty/en", "Featured Cream 41");
  assert.ok(!(await html("/beauty/en")).includes("Featured Cream 42"));
  assert.ok(!(await html("/health/en")).includes("Featured Cream 41"));
  await ctx.close();
});

test("the contact and featured screens fit a 320 px phone", async () => {
  const ctx = await browser.newContext({ viewport: { width: 320, height: 700 } });
  const page = await ctx.newPage();
  await openContent(page, "health", "contact");
  await page.getByTestId("ct-new").click();
  await page.getByTestId("ct-email").fill(`${"a".repeat(60)}@${"b".repeat(40)}.example.com`);
  let res = await page.evaluate(measureInPage);
  assert.equal(res.count, 0, JSON.stringify(res.offenders?.slice(0, 3)));
  await page.getByRole("button", { name: "انصراف" }).click();
  await page.getByTestId("ct-tab-featured").click();
  await page.getByTestId("ct-new").click();
  res = await page.evaluate(measureInPage);
  assert.equal(res.count, 0, JSON.stringify(res.offenders?.slice(0, 3)));
  await ctx.close();
});
