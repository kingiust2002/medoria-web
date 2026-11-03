// End-to-end (real browser, fake database, OPERATOR_USERS=on): the tick-box access editor of the people screen.
//   A  the editor shows the real effective state; unticking a thing the role gives closes it; "reset to role defaults"; the summary before saving
//   B  removing the price right really closes the operation — also from a stale screen, on the very next click
//   C  "needs approval" chosen in the editor: the person cannot apply directly, the live data waits until a reviewer approves
//   D  a Health-only person has no Beauty (and the other way round); the editor offers only the houses given
//   E  a limited manager sees what they cannot hand out, with the reason; direct execution is not offered where they need approval themself
//   F  Persian, Tajik and English: direction, and no sideways overflow at 320 px (every element measured)
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { BASE, launch, state, resetDb, apiLogin, clearFaults, measureInPage } from "./helpers.mjs";
import { SERVICE_KEY } from "./fakeDb.mjs";
import { hashPassword } from "../../lib/operator/passwords.js";

const DB = process.env.E2E_DB_URL;
const PW = "Strong-Passw0rd-77";
let browser;
before(async () => {
  browser = await launch(); await resetDb(); await clearFaults();
  await addUser({ username: "the.owner", display_name: "The Owner", role: "owner", houses: ["health", "beauty"] });
});
after(async () => { await browser?.close(); });

const rest = (path, init = {}) => fetch(`${DB}/rest/v1/${path}`, { ...init, headers: { apikey: SERVICE_KEY, "content-type": "application/json", prefer: "return=representation", ...(init.headers || {}) } });
async function addUser(o) {
  const res = await rest("operator_users", { method: "POST", body: JSON.stringify({ display_name: o.username, password_hash: hashPassword(PW), status: "active", role: "viewer", houses: ["health"], require_2fa: false, ...o }) });
  return (await res.json())[0];
}
const patchUser = (id, patch) => rest(`operator_users?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(patch) });
const login = (user, house = "health") => apiLogin(house, { user, password: PW });
const withCookie = (path, cookie) => fetch(BASE + path, { redirect: "manual", headers: { cookie, origin: BASE } });
async function pageAs(cookie, viewport = { width: 1280, height: 900 }, lang) {
  const ctx = await browser.newContext({ viewport });
  const [name, ...rest2] = cookie.split("=");
  await ctx.addCookies([{ name, value: rest2.join("="), url: BASE }]);
  if (lang) await ctx.addCookies([{ name: "medoria_panel_lang", value: lang, url: BASE }]);
  return { ctx, page: await ctx.newPage() };
}
const userRow = async (username) => (await state()).operator_users.find((u) => u.username === username);
const product = async (id) => (await state()).products.find((p) => p.id === id);
const card = (page, username) => page.getByTestId("person").filter({ hasText: username });
const item = (scope, permission) => scope.locator(`[data-testid="access-item"][data-permission="${permission}"]`);
const openGroup = async (scope, group) => {
  const g = scope.locator(`[data-testid="access-group"][data-group="${group}"]`).first();
  if (!(await g.evaluate((el) => el.open))) await g.locator("summary").click();
  return g;
};
async function openEdit(cookie, username, viewport, lang) {
  const p = await pageAs(cookie, viewport, lang);
  await p.page.goto(`${BASE}/operator/users`, { waitUntil: "networkidle" });
  await card(p.page, username).getByRole("button", { name: /ویرایش|Таҳрир|Edit/ }).click();
  p.dialog = p.page.getByRole("dialog");
  await p.dialog.waitFor();
  return p;
}

test("A: the editor shows the real state, unticking closes a right the role gives, reset goes back, and the summary names exactly what changes", async () => {
  const pm = await addUser({ username: "pm.ticks", role: "product_manager" });
  const owner = await login("the.owner");
  const { ctx, page, dialog } = await openEdit(owner.cookie, "pm.ticks");
  assert.equal(await dialog.getByTestId("access-editor").count(), 1);
  assert.equal(await dialog.getByTestId("access-house").count(), 1, "only the person's own house is shown");
  const products = await openGroup(dialog, "products");
  const price = item(products, "health.products.price");
  assert.equal(await price.getAttribute("data-on"), "1", "the role gives the right to change prices");
  assert.match(await price.getByTestId("access-state").innerText(), /از نقش/);
  assert.equal(await item(products, "health.products.export").getAttribute("data-on"), "1");
  assert.equal(await item(products, "health.products.approve").getAttribute("data-on"), "0");

  await price.getByTestId("access-check").uncheck();
  assert.match(await price.getByTestId("access-state").innerText(), /بسته‌شده/, "closed for this person although the role gives it");
  await dialog.getByTestId("access-reset").click();
  assert.equal(await price.getAttribute("data-on"), "1", "reset: back to the role's defaults");
  await price.getByTestId("access-check").uncheck();
  await item(products, "health.products.approve").getByTestId("access-check").check();
  assert.match(await item(products, "health.products.approve").getByTestId("access-state").innerText(), /اضافه‌شده/);

  await dialog.getByTestId("person-submit").click();
  const summary = dialog.getByTestId("access-summary");
  await summary.waitFor();
  assert.deepEqual(await summary.getByTestId("summary-removed").locator("li").evaluateAll((els) => els.map((e) => e.dataset.permission)), ["health.products.price"]);
  assert.deepEqual(await summary.getByTestId("summary-added").locator("li").evaluateAll((els) => els.map((e) => e.dataset.permission)), ["health.products.approve"]);
  assert.equal((await userRow("pm.ticks")).deny_perms.length, 0, "nothing is saved before the confirmation");
  await dialog.getByTestId("summary-back").click();
  await dialog.getByTestId("access-editor").waitFor();
  await dialog.getByTestId("person-submit").click();
  await dialog.getByTestId("access-summary").waitFor();
  await dialog.getByTestId("reauth-password").fill(PW);              // granting a permission is more power: the manager proves who they are
  await dialog.getByTestId("person-submit").click();
  await dialog.waitFor({ state: "hidden" });
  const saved = await userRow("pm.ticks");
  assert.deepEqual([saved.allow_perms, saved.deny_perms], [["health.products.approve"], ["health.products.price"]], "only the differences from the role are stored");
  const entry = (await state()).operator_audit_log.filter((r) => r.action === "user.update" && r.target_user_id === pm.id);
  assert.deepEqual(entry.map((r) => r.result), ["attempt", "success"]);
  assert.deepEqual(entry[1].detail.perms_added, ["health_products_approve"]);
  assert.deepEqual(entry[1].detail.perms_removed, ["health_products_price"]);
  await ctx.close();
});

test("B: with the price right removed the operation is closed — the old session ends, and a stale screen is refused on the very next click", async () => {
  await addUser({ username: "pm.price", role: "product_manager", approval: { health: [] } });       // may change prices directly (a person with an empty approval list)
  const before1 = await login("pm.price");
  const { ctx, page } = await pageAs(before1.cookie);
  await page.goto(`${BASE}/operator/products/1/edit`, { waitUntil: "networkidle" });
  assert.equal(await page.getByLabel(/قیمت \(دلار\)/).isDisabled(), false, "the screen lets them change the price");
  // the stale screen: the right is withdrawn in the database WITHOUT ending the session, so only the server's per-request check can stop the click
  await patchUser((await userRow("pm.price")).id, { deny_perms: ["health.products.price"] });
  await new Promise((r) => setTimeout(r, 2500));
  await page.getByLabel(/قیمت \(دلار\)/).fill("99");
  await page.getByRole("button", { name: "ذخیره تغییرات" }).first().click();
  await page.getByText(/اجازهٔ انجام این کار را ندارید/).first().waitFor();          // (role=alert alone would find Next's empty route announcer)
  const alertText = await page.getByText(/اجازهٔ انجام این کار را ندارید/).first().innerText();
  assert.equal((await product(1)).price, 10, `the price did not change (screen said: ${alertText})`);
  const denied = (await state()).operator_audit_log.filter((r) => r.action === "access.denied");
  assert.ok(denied.some((r) => r.detail?.reason === "products.price"), `the refusal names the operation: ${JSON.stringify(denied)} / screen: ${alertText}`);
  await ctx.close();

  // through the editor: the session of that person ends at once and a new one cannot change the price
  const owner = await login("the.owner");
  await addUser({ username: "pm.price2", role: "product_manager", approval: { health: [] } });
  const stale = await login("pm.price2");
  assert.equal((await withCookie("/operator/products", stale.cookie)).status, 200);
  const e = await openEdit(owner.cookie, "pm.price2");
  const group = await openGroup(e.dialog, "products");
  await item(group, "health.products.price").getByTestId("access-check").uncheck();
  await e.dialog.getByTestId("person-submit").click();
  await e.dialog.getByTestId("access-summary").waitFor();
  await e.dialog.getByTestId("person-submit").click();
  await e.dialog.waitFor({ state: "hidden" });
  assert.notEqual((await withCookie("/operator/products", stale.cookie)).status, 200, "the open session of the restricted person ended");
  const fresh = await pageAs((await login("pm.price2")).cookie);
  await fresh.page.goto(`${BASE}/operator/products/1/edit`, { waitUntil: "networkidle" });
  assert.equal(await fresh.page.getByLabel(/قیمت \(دلار\)/).isDisabled(), true, "the price field is closed on a fresh screen");
  await fresh.ctx.close(); await e.ctx.close();
});

test("C: 'needs approval' chosen in the editor — the person cannot apply the change directly; the live data waits for a reviewer", async () => {
  await addUser({ username: "direct.pm", role: "product_manager", approval: { health: [] } });
  await addUser({ username: "reviewer.hadmin", role: "house_admin" });
  const owner = await login("the.owner");
  const e = await openEdit(owner.cookie, "direct.pm");
  const group = await openGroup(e.dialog, "products");
  const row = group.locator('[data-testid="access-mode"][data-op="products.price"]');
  assert.equal(await row.getAttribute("data-mode"), "direct");
  await row.locator('[data-mode-set="approval"]').click();
  assert.equal(await row.getAttribute("data-mode"), "approval");
  await e.dialog.getByTestId("person-submit").click();
  const modes = e.dialog.getByTestId("summary-modes");
  await modes.waitFor();
  assert.ok((await modes.locator('li[data-op="products.price"]').innerText()).includes("نیازمند تأیید"), "the summary shows direct → needs approval");
  await e.dialog.getByTestId("person-submit").click();
  await e.dialog.waitFor({ state: "hidden" });
  assert.deepEqual((await userRow("direct.pm")).approval.health.includes("products.price"), true);
  await e.ctx.close();

  const u = await pageAs((await login("direct.pm")).cookie);
  await u.page.goto(`${BASE}/operator/products/1/edit`, { waitUntil: "networkidle" });
  await u.page.getByLabel(/قیمت \(دلار\)/).fill("77");
  await u.page.getByRole("button", { name: "ذخیره تغییرات" }).first().click();
  await u.page.waitForURL(/\/operator\/approvals/);
  assert.equal((await product(1)).price, 10, "the live price is untouched while the request is pending");
  const [req] = (await state()).operator_change_requests;
  assert.equal(req.status, "pending");
  await u.ctx.close();

  const r = await pageAs((await login("reviewer.hadmin")).cookie);
  await r.page.goto(`${BASE}/operator/approvals`, { waitUntil: "networkidle" });
  await r.page.getByTestId("approve").first().click();
  await r.page.getByText("تأیید شد و اعمال شد.").waitFor();
  assert.equal((await product(1)).price, 77, "applied only after the approval");
  await r.ctx.close();
});

test("D: a Health-only person has no Beauty and a Beauty-only person has no Health; the editor offers only the houses given", async () => {
  const owner = await login("the.owner");
  const { ctx, page } = await pageAs(owner.cookie);
  await page.goto(`${BASE}/operator/users`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /کاربر تازه/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  assert.equal(await dialog.getByTestId("access-house").count(), 0, "no house chosen: nothing to tick");
  await dialog.getByLabel("زیبایی").check();
  assert.deepEqual(await dialog.getByTestId("access-house").evaluateAll((els) => els.map((e) => e.dataset.house)), ["beauty"]);
  assert.equal(await dialog.locator('[data-testid="access-group"][data-group="brands"]').count(), 1, "Beauty has brands");
  await dialog.getByLabel("سلامت").check();
  assert.deepEqual(await dialog.getByTestId("access-house").evaluateAll((els) => els.map((e) => e.dataset.house)), ["health", "beauty"]);
  assert.equal(await dialog.locator('[data-testid="access-house"][data-house="health"] [data-group="brands"]').count(), 0, "Health has no brands");
  await ctx.close();

  await addUser({ username: "health.only", role: "house_admin", houses: ["health"] });
  await addUser({ username: "beauty.only", role: "house_admin", houses: ["beauty"] });
  const h = await login("health.only");
  const beautyCookie = h.cookie.replace("medoria_operator=", "medoria_beauty_operator=");
  for (const p of ["/beauty/operator", "/beauty/operator/products", "/beauty/operator/quotes", "/beauty/operator/users"]) assert.notEqual((await withCookie(p, beautyCookie)).status, 200, p);
  assert.equal((await login("health.only", "beauty")).status, 401);
  assert.equal((await login("beauty.only", "health")).status, 401, "and the other way round");
  const b = await login("beauty.only", "beauty");
  assert.equal(b.status, 200);
  const healthCookie = b.cookie.replace("medoria_beauty_operator=", "medoria_operator=");
  for (const p of ["/operator", "/operator/products", "/operator/quotes", "/operator/users"]) assert.notEqual((await withCookie(p, healthCookie)).status, 200, p);
});

test("E: a limited manager sees what they cannot hand out — with the reason — and cannot give direct execution where they need approval themself", async () => {
  await addUser({ username: "limited.mgr", role: "product_manager", allow_perms: ["users.view", "users.manage"] });
  await addUser({ username: "a.viewer", role: "viewer" });
  const m = await login("limited.mgr");
  const { ctx, page } = await pageAs(m.cookie);
  await page.goto(`${BASE}/operator/users`, { waitUntil: "networkidle" });
  await card(page, "a.viewer").getByRole("button", { name: /ویرایش/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  const inventory = await openGroup(dialog, "inventory");
  const adjust = item(inventory, "health.inventory.adjust");
  assert.equal(await adjust.getByTestId("access-check").isDisabled(), true, "they do not hold it, so they cannot give it");
  assert.ok((await adjust.getByTestId("access-why").innerText()).length > 10, "…and the screen says why");
  const prod = await openGroup(dialog, "products");
  assert.equal(await item(prod, "health.products.view").getByTestId("access-check").isDisabled(), false, "what they hold can be given");
  assert.equal(await dialog.getByTestId("access-users").locator('[data-permission="users.manage"] [data-testid="access-check"]').isDisabled(), true, "user management is for an owner to give");
  // give the viewer edit rights: the price mode 'direct' is not offered (the manager's own price change needs approval)
  await item(prod, "health.products.edit").getByTestId("access-check").check();
  const priceMode = prod.locator('[data-testid="access-mode"][data-op="products.price"]');
  assert.equal(await priceMode.locator('[data-mode-set="direct"]').isDisabled(), true);
  assert.equal(await priceMode.locator('[data-mode-set="approval"]').isDisabled(), false);
  await ctx.close();
});

test("F: Persian, Tajik and English — direction, and nothing past the screen edge at 320 px (every element measured, editor fully open)", async () => {
  const owner = await login("the.owner");
  for (const [lang, dir] of [["fa", "rtl"], ["tg", "ltr"], ["en", "ltr"]]) {
    const p = await pageAs(owner.cookie, { width: 320, height: 640 }, lang);
    await p.page.goto(`${BASE}/operator/users`, { waitUntil: "networkidle" });
    assert.equal(await p.page.evaluate(() => document.documentElement.dir || document.querySelector("[dir]")?.getAttribute("dir")), dir, `${lang}: direction`);
    await card(p.page, "pm.ticks").locator("button").first().click();
    const dialog = p.page.getByRole("dialog");
    await dialog.waitFor();
    for (const g of await dialog.locator('[data-testid="access-group"]').all()) await g.locator("summary").click();       // open every group
    const m = await p.page.evaluate(measureInPage);
    assert.equal(m.count, 0, `${lang}: ${JSON.stringify(m.offenders)}`);
    assert.ok(!/[؀-ۿ]/.test(await dialog.getByTestId("access-editor").innerText()) || lang === "fa", `${lang}: no Persian text left in the editor`);
    await item(dialog, "health.products.export").getByTestId("access-check").uncheck();          // a change, so the review step appears
    await dialog.getByTestId("person-submit").click();
    await dialog.getByTestId("access-summary").waitFor();
    const s = await p.page.evaluate(measureInPage);
    assert.equal(s.count, 0, `${lang} summary: ${JSON.stringify(s.offenders)}`);
    await p.ctx.close();
  }
});
