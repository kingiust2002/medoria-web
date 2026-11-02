// Bulk edits and imports under approval (N12, docs/PANEL_BULK_IMPORT_APPROVAL.md) with personal accounts: a product manager whose policy says "needs approval" for
// bulk edits and imports files ONE request for the whole change instead of being refused; nothing changes while it is pending; the reviewer reads a summary
// and approves; then the change is applied. A direct person is unaffected. Both houses; 320 px.
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { BASE, DB, launch, state, resetDb, poll, apiLogin, measureInPage } from "./helpers.mjs";
import { hashPassword } from "../../lib/operator/passwords.js";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
beforeEach(async () => { await resetDb(); });

const SERVICE = "service-test-key";
const PW = "Strong-Passw0rd-77";
const ts = "2026-10-01T10:00:00.000Z";
const rest = (path, init = {}) => fetch(`${DB}/rest/v1/${path}`, { ...init, headers: { apikey: SERVICE, "content-type": "application/json", prefer: "return=representation", ...(init.headers || {}) } });
async function addUser(o) { const res = await rest("operator_users", { method: "POST", body: JSON.stringify({ display_name: o.username, password_hash: hashPassword(PW), status: "active", role: "viewer", houses: ["health"], require_2fa: false, ...o }) }); return (await res.json())[0]; }
async function pageAs(user, house = "health", width = 1280) {
  const s = await apiLogin(house, { user, password: PW });
  assert.ok(s.cookie, `login failed: ${s.status}`);
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const [name, ...parts] = s.cookie.split("=");
  await ctx.addCookies([{ name, value: parts.join("="), url: BASE }]);
  return { ctx, page: await ctx.newPage() };
}
const PM_POLICY = { health: ["products.bulk", "products.import"], beauty: ["products.bulk", "products.import"] };
const reqs = async () => (await state()).operator_change_requests || [];
const active = async (table = "products") => (await state())[table].filter((p) => p.is_active !== false).length;
const beautyProduct = (id, o = {}) => ({ id, slug: `bb-${id}`, sku: `BB-${id}`, name_en: `Beauty ${id}`, name_fa: `Beauty ${id}`, name_ru: `Beauty ${id}`, name_tg: `Beauty ${id}`, price: 30, in_stock: true, is_active: true, is_featured: false, brand: "Luxe", unit: "pcs", min_order_qty: 1, specs: {}, tags: [], gallery_urls: [], image_url: "a.png", created_at: ts, updated_at: ts, ...o });

test("bulk edit: filed as ONE request (nothing changes), summarised for the reviewer, applied on approval", async () => {
  await addUser({ username: "seed.owner", role: "owner", houses: ["health", "beauty"] });
  await addUser({ username: "pm.asker", role: "product_manager", houses: ["health", "beauty"], approval: PM_POLICY });
  await addUser({ username: "rev.admin", role: "house_admin", houses: ["health", "beauty"] });
  const pm = await pageAs("pm.asker");
  await pm.page.goto(`${BASE}/operator/products`, { waitUntil: "networkidle" });
  assert.equal(await active(), 2, "the seed: two active products, one archived");
  await pm.page.locator("input[type=checkbox]").first().check();                         // the whole page
  await pm.page.getByTestId("needs-approval").first().waitFor();                          // the buttons are there, marked
  await pm.page.getByRole("button", { name: /غیرفعال/ }).first().click();
  await poll(async () => (await reqs()).length === 1, { label: "one request" });
  const r = (await reqs())[0];
  assert.deepEqual([r.operation, r.status, r.proposed.patch], ["products.bulk", "pending", { is_active: false }]);
  assert.equal(r.proposed.ids.length, 3, "the three products of the page, in one request");
  assert.equal(await active(), 2, "nothing changed yet");
  await pm.ctx.close();

  const rev = await pageAs("rev.admin");
  await rev.page.goto(`${BASE}/operator/approvals`, { waitUntil: "networkidle" });
  const card = rev.page.getByTestId("request").first();
  await card.waitFor();
  assert.ok(!(await card.innerText()).includes("[{"), "a summary, not raw JSON of ids");
  await rev.page.getByTestId("approve").first().click();
  await poll(async () => (await reqs())[0].status === "approved", { label: "approved" });
  assert.equal(await active(), 0, "applied to all three at the moment of approval");
  assert.ok((await state()).operator_audit_log.some((l) => l.action === "approval.approved"));
  await rev.ctx.close();
});

test("a direct person still changes the whole selection at once (no request)", async () => {
  await addUser({ username: "seed.owner", role: "owner", houses: ["health", "beauty"] });
  await addUser({ username: "dir.admin", role: "house_admin", houses: ["health"] });
  const d = await pageAs("dir.admin");
  await d.page.goto(`${BASE}/operator/products`, { waitUntil: "networkidle" });
  await d.page.locator("input[type=checkbox]").first().check();
  assert.equal(await d.page.getByTestId("needs-approval").count(), 0);
  await d.page.getByRole("button", { name: /غیرفعال/ }).first().click();
  await poll(async () => (await active()) === 0, { label: "all inactive" });
  assert.equal((await reqs()).length, 0);
  await d.ctx.close();
});

test("import: the file is read and checked as usual, filed as ONE request, imported only when approved", async () => {
  await addUser({ username: "seed.owner", role: "owner", houses: ["health", "beauty"] });
  await addUser({ username: "pm.asker", role: "product_manager", houses: ["health", "beauty"], approval: PM_POLICY });
  await addUser({ username: "rev.admin", role: "house_admin", houses: ["health", "beauty"] });
  const pm = await pageAs("pm.asker");
  await pm.page.goto(`${BASE}/operator/products/import`, { waitUntil: "networkidle" });
  const csv = "name_en,sku,price\nImported Mask,IMP-1,5\nImported Glove,IMP-2,6\n";
  await pm.page.locator("input[type=file]").first().setInputFiles({ name: "stock.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
  await pm.page.getByRole("button", { name: /بررسی فایل/ }).click();
  const send = pm.page.getByRole("button", { name: /ارسال برای تأیید/ });
  await send.waitFor({ timeout: 30000 });
  assert.equal((await state()).products.length, 3, "the dry run wrote nothing");
  pm.page.once("dialog", (dlg) => dlg.accept());
  await send.click();
  await pm.page.getByTestId("import-filed").waitFor({ timeout: 30000 });
  const r = (await reqs())[0];
  assert.deepEqual([r.operation, r.status, r.proposed.rows.length], ["products.import", "pending", 2]);
  assert.equal((await state()).products.length, 3, "still nothing imported");
  await pm.ctx.close();

  const rev = await pageAs("rev.admin");
  await rev.page.goto(`${BASE}/operator/approvals`, { waitUntil: "networkidle" });
  await rev.page.getByTestId("request").first().waitFor();
  await rev.page.getByTestId("approve").first().click();
  await poll(async () => (await state()).products.length === 5, { label: "imported" });
  const skus = (await state()).products.map((p) => p.sku);
  assert.ok(skus.includes("IMP-1") && skus.includes("IMP-2"));
  assert.equal((await reqs())[0].status, "approved");
  await rev.ctx.close();
});

test("Beauty: a bulk edit of a Beauty person goes through the same path; Health's products are untouched", async () => {
  await rest("beauty_categories", { method: "POST", body: JSON.stringify([{ id: 1, slug: "skincare-cream", name_en: "Cream", name_ru: "C", name_tg: "C", name_fa: "کرم", icon: "x", is_active: true, is_featured: false, sort_order: 1, parent_id: null, world: "skincare", created_at: ts }]) });
  await rest("beauty_products", { method: "POST", body: JSON.stringify([beautyProduct(41), beautyProduct(42)]) });
  await addUser({ username: "seed.owner", role: "owner", houses: ["health", "beauty"] });
  await addUser({ username: "pm.asker", role: "product_manager", houses: ["health", "beauty"], approval: PM_POLICY });
  await addUser({ username: "rev.admin", role: "house_admin", houses: ["health", "beauty"] });
  const pm = await pageAs("pm.asker", "beauty");
  await pm.page.goto(`${BASE}/beauty/operator/products`, { waitUntil: "networkidle" });
  await pm.page.locator("input[type=checkbox]").first().check();
  await pm.page.getByRole("button", { name: /غیرفعال/ }).first().click();
  await poll(async () => (await reqs()).length === 1, { label: "one request" });
  assert.equal((await reqs())[0].house, "beauty");
  assert.equal(await active("beauty_products"), 2);
  await pm.ctx.close();
  const rev = await pageAs("rev.admin", "beauty");
  await rev.page.goto(`${BASE}/beauty/operator/approvals`, { waitUntil: "networkidle" });
  await rev.page.getByTestId("approve").first().click();
  await poll(async () => (await active("beauty_products")) === 0, { label: "beauty inactive" });
  assert.equal(await active(), 2, "Health's products were not touched");
  await rev.ctx.close();
});

test("the filed-for-approval screens fit a 320 px phone", async () => {
  await addUser({ username: "seed.owner", role: "owner", houses: ["health", "beauty"] });
  await addUser({ username: "pm.asker", role: "product_manager", houses: ["health", "beauty"], approval: PM_POLICY });
  const pm = await pageAs("pm.asker", "health", 320);
  await pm.page.goto(`${BASE}/operator/products`, { waitUntil: "networkidle" });
  await pm.page.locator("input[type=checkbox]").first().check();
  let res = await pm.page.evaluate(measureInPage);
  assert.equal(res.count, 0, JSON.stringify(res.offenders?.slice(0, 3)));
  await pm.page.goto(`${BASE}/operator/products/import`, { waitUntil: "networkidle" });
  await pm.page.locator("input[type=file]").first().setInputFiles({ name: "stock.csv", mimeType: "text/csv", buffer: Buffer.from("name_en,sku,price\nImported Mask,IMP-1,5\n") });
  await pm.page.getByRole("button", { name: /بررسی فایل/ }).click();
  await pm.page.getByRole("button", { name: /ارسال برای تأیید/ }).waitFor({ timeout: 30000 });
  res = await pm.page.evaluate(measureInPage);
  assert.equal(res.count, 0, JSON.stringify(res.offenders?.slice(0, 3)));
  await pm.ctx.close();
});

// ── review R5: the import operation alone never authorises a publication or a price ──────────────────────────────────────────────────────
// This person's IMPORT is direct (the default product manager); only the publication and the price need approval.
test("R5: a direct importer whose file would PUBLISH is switched to 'send for approval'; the same file saved inactive imports directly, with history", async () => {
  await addUser({ username: "seed.owner", role: "owner", houses: ["health", "beauty"] });
  await addUser({ username: "pm.direct", role: "product_manager", houses: ["health", "beauty"] });          // role default: import direct, price + publication need approval
  await addUser({ username: "rev.admin", role: "house_admin", houses: ["health", "beauty"] });
  const before = (await state()).products.length;
  const pm = await pageAs("pm.direct");
  await pm.page.goto(`${BASE}/operator/products/import`, { waitUntil: "networkidle" });
  const upload = async (csv) => {
    await pm.page.locator("input[type=file]").first().setInputFiles({ name: "stock.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await pm.page.getByRole("button", { name: /بررسی فایل/ }).click();
  };
  await upload("name_en,sku,price\nPublished Mask,PUB-1,5\n");                                  // the template's default is ACTIVE = a publication
  const send = pm.page.getByRole("button", { name: /ارسال برای تأیید/ });
  await send.waitFor({ timeout: 30000 });
  assert.equal((await state()).products.length, before, "the check wrote nothing");
  pm.page.once("dialog", (dlg) => dlg.accept());
  await send.click();
  await pm.page.getByTestId("import-filed").waitFor({ timeout: 30000 });
  const [req] = await reqs();
  assert.deepEqual([req.operation, req.status], ["products.import", "pending"]);
  assert.ok(req.proposed.__ops.includes("products.publish"), "the request names the publication it contains");
  assert.equal((await state()).products.length, before, "still nothing imported");

  // the same product saved INACTIVE needs only the right to create: it is imported at once
  await pm.page.reload({ waitUntil: "networkidle" });
  await upload("name_en,sku,price,is_active\nDraft Mask,DRAFT-1,5,no\n");
  const go = pm.page.getByRole("button", { name: /تأیید و ورود/ });
  await go.waitFor({ timeout: 30000 });
  pm.page.once("dialog", (dlg) => dlg.accept());
  await go.click();
  await poll(async () => (await state()).products.some((p) => p.sku === "DRAFT-1"), { label: "draft imported" });
  const created = (await state()).products.find((p) => p.sku === "DRAFT-1");
  assert.equal(created.is_active, false);
  assert.ok(((await state()).product_versions || []).some((v) => v.product_id === created.id && v.kind === "create"), "the new product has its history entry");
  await pm.ctx.close();

  // the reviewer approves the first file: the published product appears and has history under the request
  const rev = await pageAs("rev.admin");
  await rev.page.goto(`${BASE}/operator/approvals`, { waitUntil: "networkidle" });
  await rev.page.getByTestId("approve").first().click();
  await poll(async () => (await state()).products.some((p) => p.sku === "PUB-1"), { label: "published product imported on approval" });
  const pub = (await state()).products.find((p) => p.sku === "PUB-1");
  assert.equal(pub.is_active, true);
  assert.ok(((await state()).product_versions || []).some((v) => v.product_id === pub.id && v.request_id === req.id), "history names the request");
  await rev.ctx.close();
});

for (const house of ["health", "beauty"]) {
  test(`${house}: a newer product survives an old bulk approval and its ID is visible in the result`, async () => {
    if (house === "beauty") await rest("beauty_products", { method: "POST", body: JSON.stringify([beautyProduct(41), beautyProduct(42)]) });
    await addUser({ username: "seed.owner", role: "owner", houses: ["health", "beauty"] });
    await addUser({ username: "pm.asker", role: "product_manager", houses: ["health", "beauty"], approval: PM_POLICY });
    await addUser({ username: "rev.admin", role: "house_admin", houses: ["health", "beauty"] });
    const prefix = house === "beauty" ? "/beauty/operator" : "/operator";
    const table = house === "beauty" ? "beauty_products" : "products";
    const pm = await pageAs("pm.asker", house);
    await pm.page.goto(`${BASE}${prefix}/products`, { waitUntil: "networkidle" });
    await pm.page.locator("input[type=checkbox]").first().check();
    await pm.page.getByRole("button", { name: /غیرفعال/ }).first().click();
    await poll(async () => (await reqs()).length === 1, { label: "filed" });
    await pm.ctx.close();
    const product = (await state())[table].find((p) => p.is_active);
    const changed = await rest(`${table}?id=eq.${product.id}`, { method: "PATCH", body: JSON.stringify({ price: 999, updated_at: "2026-11-02T11:00:00.000009+00:00" }) });
    assert.ok(changed.ok);
    const rev = await pageAs("rev.admin", house, 320);
    await rev.page.goto(`${BASE}${prefix}/approvals`, { waitUntil: "networkidle" });
    await rev.page.getByTestId("approve").first().click();
    const result = rev.page.getByTestId("approval-execution");
    await result.waitFor();
    assert.match(await result.innerText(), /شناسه‌های تغییرکرده در این فاصله/);
    const row = (await state())[table].find((p) => p.id === product.id);
    assert.equal(row.price, 999);
    assert.equal(row.is_active, true);
    const measure = await rev.page.evaluate(measureInPage);
    assert.equal(measure.count, 0, JSON.stringify(measure.offenders));
    await rev.ctx.close();
  });
}
