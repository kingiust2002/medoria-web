// Personal settings, round 3 (N10, docs/PANEL_PERSONAL_SETTINGS.md): a person's own rows per page for the product and request lists and the blocks of their
// dashboard. The size they choose is what a plain list address shows, an explicit size in the address still wins (also the standard 25), the dashboard
// shows only the chosen blocks in the chosen order, other people and the other house keep the defaults, and the settings card fits a 320 px phone.
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
const dashOrder = (page) => page.locator("[data-dash]").evaluateAll((els) => els.map((e) => e.getAttribute("data-dash")));

test("rows per page: saved per person, used by a plain list address, an explicit size still wins; another person is unaffected", async () => {
  await addUser({ username: "seed.owner", role: "owner", houses: ["health", "beauty"] });
  const ann = await addUser({ username: "ann.admin", role: "house_admin", houses: ["health", "beauty"] });
  await addUser({ username: "bob.admin", role: "house_admin" });
  const many = Array.from({ length: 60 }, (_, i) => ({ id: 8100 + i, slug: `e2e-size-${i}`, sku: `SZ-${i}`, name_en: `Sized ${i}`, name_fa: `Sized ${i}`, price: 1, in_stock: true, is_active: true, created_at: "2026-10-01T10:00:00.000Z", updated_at: `2026-10-01T10:${String(i).padStart(2, "0")}:00.000Z` }));
  assert.equal((await rest("products", { method: "POST", body: JSON.stringify(many) })).status, 201);

  const a = await pageAs("ann.admin");
  await a.page.goto(`${BASE}/operator/settings`, { waitUntil: "networkidle" });
  await a.page.getByTestId("prefs-size-products").selectOption("50");
  await a.page.getByTestId("prefs-save").click();
  await a.page.getByTestId("prefs-msg").waitFor();
  const [row] = await prefs();
  assert.deepEqual([row.user_id, row.house, row.page_size_products, row.page_size_quotes], [ann.id, "health", 50, null]);

  await a.page.goto(`${BASE}/operator/products`, { waitUntil: "networkidle" });
  assert.equal(await a.page.getByTestId("list-size").inputValue(), "50", "a plain address uses the person's size");
  assert.match(await a.page.getByTestId("list-range").innerText(), /۱–۵۰/, "rows 1–50 are shown");
  // choosing the standard 25 explicitly puts it in the address and sticks
  await a.page.getByTestId("list-size").selectOption("25");
  await a.page.waitForURL(/size=25/);
  assert.equal(await a.page.getByTestId("list-size").inputValue(), "25");
  // choosing 50 again drops the size from the address (it IS the default)
  await a.page.getByTestId("list-size").selectOption("50");
  await a.page.waitForURL((u) => !u.search.includes("size="));
  assert.equal(await a.page.getByTestId("list-size").inputValue(), "50");
  await a.ctx.close();

  const b = await pageAs("bob.admin");
  await b.page.goto(`${BASE}/operator/products`, { waitUntil: "networkidle" });
  assert.equal(await b.page.getByTestId("list-size").inputValue(), "25", "another person keeps the standard size");
  await b.ctx.close();

  // the other house and the other list are separate
  const bt = await pageAs("ann.admin", "beauty");
  await bt.page.goto(`${BASE}/beauty/operator/products`, { waitUntil: "networkidle" });
  if (await bt.page.getByTestId("list-size").count()) assert.equal(await bt.page.getByTestId("list-size").inputValue(), "25");
  await bt.ctx.close();
});

test("dashboard blocks: hide and reorder; other people and the other house keep the default; at least one block stays", async () => {
  await addUser({ username: "seed.owner", role: "owner", houses: ["health", "beauty"] });
  await addUser({ username: "ann.admin", role: "house_admin", houses: ["health", "beauty"] });
  await addUser({ username: "bob.admin", role: "house_admin", houses: ["health"] });
  const a = await pageAs("ann.admin");
  await a.page.goto(`${BASE}/operator`, { waitUntil: "networkidle" });
  assert.deepEqual(await dashOrder(a.page), ["stats", "actions", "quotes", "products"], "the default dashboard");

  await a.page.goto(`${BASE}/operator/settings`, { waitUntil: "networkidle" });
  await a.page.locator('[data-testid="prefs-dashboard"] input[data-block="actions"]').uncheck();           // hide the quick actions
  await a.page.locator('[data-testid="prefs-dashboard"] [data-testid="dash-on"]').last().getByTestId("dash-up").click();   // products above quotes
  await a.page.getByTestId("prefs-save").click();
  await a.page.getByTestId("prefs-msg").waitFor();
  assert.deepEqual((await prefs())[0].dashboard, ["stats", "products", "quotes"]);
  await a.page.goto(`${BASE}/operator`, { waitUntil: "networkidle" });
  assert.deepEqual(await dashOrder(a.page), ["stats", "products", "quotes"]);
  await a.ctx.close();

  const b = await pageAs("bob.admin");
  await b.page.goto(`${BASE}/operator`, { waitUntil: "networkidle" });
  assert.deepEqual(await dashOrder(b.page), ["stats", "actions", "quotes", "products"], "another person keeps the default");
  await b.ctx.close();

  const bt = await pageAs("ann.admin", "beauty");
  await bt.page.goto(`${BASE}/beauty/operator`, { waitUntil: "networkidle" });
  assert.deepEqual(await dashOrder(bt.page), ["stats", "actions", "quotes", "products"], "the other house is untouched");
  await bt.ctx.close();

  // the last block cannot be unticked
  const c = await pageAs("ann.admin");
  await c.page.goto(`${BASE}/operator/settings`, { waitUntil: "networkidle" });
  for (const k of ["stats", "products"]) await c.page.locator(`[data-testid="prefs-dashboard"] input[data-block="${k}"]`).uncheck();
  assert.equal(await c.page.locator('[data-testid="prefs-dashboard"] [data-testid="dash-on"]').count(), 1, "one block always stays");
  await c.ctx.close();
});

test("the settings card with the new parts fits a 320 px phone", async () => {
  await addUser({ username: "seed.owner", role: "owner", houses: ["health", "beauty"] });
  await addUser({ username: "ann.admin", role: "house_admin", houses: ["health", "beauty"] });
  const a = await pageAs("ann.admin", "health", 320);
  await a.page.goto(`${BASE}/operator/settings`, { waitUntil: "networkidle" });
  await a.page.getByTestId("prefs-dashboard").scrollIntoViewIfNeeded();
  assert.equal((await a.page.evaluate(measureInPage)).count, 0);
  await a.ctx.close();
});
