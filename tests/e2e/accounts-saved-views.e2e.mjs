// Saved list views with personal accounts (N9, docs/PANEL_SAVED_VIEWS_BULK_SCOPE.md): a person saves the filters on screen under a name, applies them from
// the list, deletes them; the same name twice is refused; another person never sees them; the other house's lists have their own; requests have views too;
// the row fits a 320 px phone.
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
const views = async () => (await state()).operator_saved_views || [];

test("save, apply and delete a product view; the same name twice is refused; another person never sees it", async () => {
  await addUser({ username: "seed.owner", role: "owner", houses: ["health", "beauty"] });
  const ann = await addUser({ username: "ann.admin", role: "house_admin", houses: ["health", "beauty"] });
  await addUser({ username: "bob.admin", role: "house_admin" });

  const a = await pageAs("ann.admin");
  await a.page.goto(`${BASE}/operator/products`, { waitUntil: "networkidle" });
  await a.page.getByTestId("saved-views").waitFor();
  assert.equal(await a.page.getByTestId("saved-view-save").count(), 0, "no filters yet: nothing to save");
  await a.page.goto(`${BASE}/operator/products?stock=out&status=inactive&page=2`, { waitUntil: "networkidle" });
  await a.page.getByTestId("saved-view-save").click();
  await a.page.getByTestId("saved-view-name").fill("Out of stock and archived");
  await a.page.getByTestId("saved-view-confirm").click();
  await a.page.getByTestId("saved-view-delete").waitFor();                       // the saved view is now the active one
  const stored = (await views())[0];
  assert.deepEqual([stored.user_id, stored.house, stored.list, stored.params], [ann.id, "health", "products", { stock: "out", status: "inactive" }], "page number not stored");

  // another visit: choose it from the list
  await a.page.goto(`${BASE}/operator/products`, { waitUntil: "networkidle" });
  await a.page.getByTestId("saved-view-select").selectOption({ label: "Out of stock and archived" });
  await a.page.waitForURL(/stock=out/);
  assert.match(a.page.url(), /status=inactive/); assert.doesNotMatch(a.page.url(), /page=/);

  // the same name again is refused with a message
  await a.page.goto(`${BASE}/operator/products?stock=in`, { waitUntil: "networkidle" });
  await a.page.getByTestId("saved-view-save").click();
  await a.page.getByTestId("saved-view-name").fill("out of STOCK and archived");
  await a.page.getByTestId("saved-view-confirm").click();
  await a.page.getByTestId("saved-view-error").waitFor();
  assert.equal((await views()).length, 1);

  // another person: nothing
  const b = await pageAs("bob.admin");
  await b.page.goto(`${BASE}/operator/products`, { waitUntil: "networkidle" });
  await b.page.getByTestId("saved-views").waitFor();
  assert.deepEqual(await b.page.getByTestId("saved-view-select").locator("option").allInnerTexts(), ["نمایی ذخیره نشده"]);
  await b.ctx.close();

  // delete
  await a.page.goto(`${BASE}/operator/products?stock=out&status=inactive`, { waitUntil: "networkidle" });
  await a.page.getByTestId("saved-view-delete").click();
  await a.page.waitForURL((u) => !u.search);
  assert.equal((await views()).length, 0);
  await a.ctx.close();
});

test("requests have their own views, and each house keeps its own", async () => {
  await addUser({ username: "seed.owner", role: "owner", houses: ["health", "beauty"] });
  await addUser({ username: "ann.admin", role: "house_admin", houses: ["health", "beauty"] });
  const a = await pageAs("ann.admin");
  await a.page.goto(`${BASE}/operator/quotes?tab=spam`, { waitUntil: "networkidle" });
  await a.page.getByTestId("saved-view-save").click();
  await a.page.getByTestId("saved-view-name").fill("Spam box");
  await a.page.getByTestId("saved-view-confirm").click();
  await a.page.getByTestId("saved-view-delete").waitFor();
  assert.deepEqual((await views()).map((v) => [v.house, v.list, v.params]), [["health", "quotes", { tab: "spam" }]]);
  await a.ctx.close();

  // Beauty: signed in there, the Health view is not on offer; a Beauty view is stored for the Beauty house
  const b = await pageAs("ann.admin", "beauty");
  for (const list of ["quotes", "products"]) {
    await b.page.goto(`${BASE}/beauty/operator/${list}`, { waitUntil: "networkidle" });
    await b.page.getByTestId("saved-views").waitFor();
    assert.deepEqual(await b.page.getByTestId("saved-view-select").locator("option").allInnerTexts(), ["نمایی ذخیره نشده"], `${list}: Health's views are not here`);
  }
  await b.page.goto(`${BASE}/beauty/operator/products?stock=out`, { waitUntil: "networkidle" });
  await b.page.getByTestId("saved-view-save").click();
  await b.page.getByTestId("saved-view-name").fill("Beauty out");
  await b.page.getByTestId("saved-view-confirm").click();
  await b.page.getByTestId("saved-view-delete").waitFor();
  const rows = await views();
  assert.deepEqual(rows.map((v) => v.house).sort(), ["beauty", "health"]);
  await b.ctx.close();
});

test("the views row fits a 320 px phone with a long name", async () => {
  await addUser({ username: "seed.owner", role: "owner", houses: ["health", "beauty"] });
  await addUser({ username: "ann.admin", role: "house_admin" });
  const a = await pageAs("ann.admin", "health", 320);
  await a.page.goto(`${BASE}/operator/products?stock=out`, { waitUntil: "networkidle" });
  await a.page.getByTestId("saved-view-save").click();
  assert.equal((await a.page.evaluate(measureInPage)).count, 0, "naming row");
  await a.page.getByTestId("saved-view-name").fill("W".repeat(40));
  await a.page.getByTestId("saved-view-confirm").click();
  await a.page.getByTestId("saved-view-delete").waitFor();
  const res = await a.page.evaluate(measureInPage);
  assert.equal(res.count, 0, JSON.stringify(res.offenders?.slice(0, 3)));
  await a.ctx.close();
});
