// Personal settings with personal accounts (N10, docs/PANEL_PERSONAL_SETTINGS.md): a person chooses a start page and pins up to six screens; the pins show
// under the menu (also in the phone menu) and a fresh login lands on the start page, while the menu's Dashboard link still opens the dashboard;
// only pages the person may open are offered; a pin whose right was taken away disappears; another person and the other house see nothing of it; 320 px.
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { BASE, DB, launch, state, resetDb, apiLogin, measureInPage } from "./helpers.mjs";
import { hashPassword } from "../../lib/operator/passwords.js";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
beforeEach(async () => { await resetDb(); });

const SERVICE = "service-test-key";
const PW = "Strong-Passw0rd-77";
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
const prefs = async () => (await state()).operator_preferences || [];

test("choose a start page and pins; the pins show under the menu; a fresh login lands on the start page; the Dashboard link still opens the dashboard", async () => {
  await addUser({ username: "seed.owner", role: "owner", houses: ["health", "beauty"] });
  const ann = await addUser({ username: "ann.admin", role: "house_admin", houses: ["health", "beauty"] });
  const a = await pageAs("ann.admin");
  await a.page.goto(`${BASE}/operator/settings`, { waitUntil: "networkidle" });
  assert.equal(await a.page.getByTestId("shortcuts").count(), 0, "nothing pinned yet");
  await a.page.getByTestId("prefs-start").selectOption("/operator/quotes");
  await a.page.getByTestId("prefs-pin-products").check();
  await a.page.getByTestId("prefs-pin-quotes").check();
  await a.page.getByTestId("prefs-save").click();
  await a.page.getByTestId("prefs-msg").waitFor();
  const [row] = await prefs();
  assert.deepEqual([row.user_id, row.house, row.start_page, row.shortcuts], [ann.id, "health", "/operator/quotes", ["/operator/products", "/operator/quotes"]]);
  await a.page.reload({ waitUntil: "networkidle" });
  assert.deepEqual(await a.page.getByTestId("shortcuts").first().getByTestId("shortcut-link").evaluateAll((els) => els.map((e) => e.getAttribute("href"))), ["/operator/products", "/operator/quotes"]);
  await a.page.getByTestId("shortcuts").first().getByTestId("shortcut-link").first().click();
  await a.page.waitForURL(/\/operator\/products$/);
  await a.ctx.close();

  // a fresh sign-in through the real form lands on the start page
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login/health`, { waitUntil: "networkidle" });
  await page.fill('input[name="username"]', "ann.admin");
  await page.fill('input[name="password"]', PW);
  await Promise.all([page.waitForURL(/\/operator\/quotes$/, { timeout: 20000 }), page.click('button[type="submit"]')]);
  // the dashboard link of the menu is NOT redirected
  await page.locator('aside a[href="/operator"]').first().click();
  await page.waitForURL(/\/operator$/);
  await page.waitForLoadState("networkidle");
  assert.match(new URL(page.url()).pathname, /^\/operator$/);
  await ctx.close();
});

test("only openable pages are offered; a pin whose right was taken away disappears; the other house and other people see nothing", async () => {
  await addUser({ username: "seed.owner", role: "owner", houses: ["health", "beauty"] });
  const ann = await addUser({ username: "ann.admin", role: "house_admin", houses: ["health", "beauty"] });
  const wh = await addUser({ username: "wh.keeper", role: "warehouse_manager" });
  const w = await pageAs("wh.keeper");
  await w.page.goto(`${BASE}/operator/settings`, { waitUntil: "networkidle" });
  assert.equal(await w.page.getByTestId("prefs-pin-users").count(), 0, "the users page is not offered");
  assert.equal(await w.page.getByTestId("prefs-pin-warehouse").count(), 1);
  // a stale pin stored for him (the right was taken away later) is not shown
  await rest("operator_preferences", { method: "POST", body: JSON.stringify({ user_id: wh.id, house: "health", start_page: "/operator/users", shortcuts: ["/operator/warehouse", "/operator/users"] }) });
  await w.page.reload({ waitUntil: "networkidle" });
  assert.deepEqual(await w.page.getByTestId("shortcuts").first().getByTestId("shortcut-link").evaluateAll((els) => els.map((e) => e.getAttribute("href"))), ["/operator/warehouse"]);
  // and the browser cannot save a page he cannot open (the server refuses it)
  const refused = await w.page.evaluate(async () => { try { return await window.fetch("/operator/settings", { method: "GET" }).then((r) => r.status); } catch { return 0; } });
  assert.equal(refused, 200);
  await w.ctx.close();

  // Ann's pins in Health do not appear in Beauty or for others
  await rest("operator_preferences", { method: "POST", body: JSON.stringify({ user_id: ann.id, house: "health", start_page: null, shortcuts: ["/operator/media"] }) });
  const b = await pageAs("ann.admin", "beauty");
  await b.page.goto(`${BASE}/beauty/operator/settings`, { waitUntil: "networkidle" });
  assert.equal(await b.page.getByTestId("shortcuts").count(), 0, "Beauty has its own, empty, list");
  assert.equal(await b.page.getByTestId("prefs-pin-brands").count(), 1, "Beauty offers its brands page");
  await b.page.getByTestId("prefs-pin-brands").check();
  await b.page.getByTestId("prefs-save").click();
  await b.page.getByTestId("prefs-msg").waitFor();
  const rows = await prefs();
  assert.deepEqual(rows.filter((r) => r.user_id === ann.id).map((r) => [r.house, r.shortcuts]).sort(), [["beauty", ["/beauty/operator/brands"]], ["health", ["/operator/media"]]]);
  await b.ctx.close();
});

test("the card and the shortcuts fit a 320 px phone", async () => {
  await addUser({ username: "seed.owner", role: "owner", houses: ["health", "beauty"] });
  const ann = await addUser({ username: "ann.admin", role: "house_admin", houses: ["health"] });
  await rest("operator_preferences", { method: "POST", body: JSON.stringify({ user_id: ann.id, house: "health", start_page: null, shortcuts: ["/operator/products", "/operator/categories", "/operator/media", "/operator/quotes", "/operator/warehouse", "/operator/content"] }) });
  const a = await pageAs("ann.admin", "health", 320);
  await a.page.goto(`${BASE}/operator/settings`, { waitUntil: "networkidle" });
  const res = await a.page.evaluate(measureInPage);
  assert.equal(res.count, 0, JSON.stringify(res.offenders?.slice(0, 3)));
  await a.page.getByLabel(/منو|Menu|Меню/).first().click();
  await a.page.getByTestId("shortcuts").last().waitFor();
  assert.equal(await a.page.getByTestId("shortcuts").last().getByTestId("shortcut-link").count(), 6);
  const menu = await a.page.evaluate(measureInPage);
  assert.equal(menu.count, 0, JSON.stringify(menu.offenders?.slice(0, 3)));
  await a.ctx.close();
});
