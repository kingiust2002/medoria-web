// "My columns" with personal accounts (N9, round 3, docs/PANEL_SAVED_VIEWS_BULK_SCOPE.md): a person chooses which fields every row of the product list and the
// request list shows and in which order; the choice survives a reload and is theirs alone (another person, the other house and the other list keep
// the defaults); "back to the default" removes it; the chooser fits a 320 px phone with a row of long data.
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
async function addUser(o) { const res = await rest("operator_users", { method: "POST", body: JSON.stringify({ display_name: o.username, password_hash: hashPassword(PW), status: "active", role: "viewer", houses: ["health"], require_2fa: false, ...o }) }); assert.equal(res.status, 201); return (await res.json())[0]; }
async function pageAs(user, house = "health", width = 1280) {
  const s = await apiLogin(house, { user, password: PW });
  assert.ok(s.cookie, `login failed: ${s.status}`);
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const [name, ...parts] = s.cookie.split("=");
  await ctx.addCookies([{ name, value: parts.join("="), url: BASE }]);
  return { ctx, page: await ctx.newPage() };
}
const stored = async () => (await state()).operator_table_columns || [];
const count = (page, col) => page.locator(`[data-testid="row-meta"] [data-col="${col}"], [data-col="${col}"]`).count();
const choose = async (page, keys) => {                                       // tick exactly these fields, in this order
  if (!(await page.getByTestId("columns-panel").isVisible())) await page.getByTestId("columns-toggle").click();
  const boxes = page.getByTestId("columns-panel").locator("input[type=checkbox]");
  for (const el of await boxes.all()) if (await el.isChecked()) await el.uncheck();
  for (const k of keys) await page.locator(`[data-testid="columns-panel"] input[data-column="${k}"]`).check();
};

test("Health products: choose fields → the rows follow, it is saved for this person only, survives a reload, and 'default' removes it", async () => {
  await addUser({ username: "seed.owner", role: "owner", houses: ["health", "beauty"] });
  const ann = await addUser({ username: "ann.admin", role: "house_admin", houses: ["health", "beauty"] });
  await addUser({ username: "bob.admin", role: "house_admin" });
  const a = await pageAs("ann.admin");
  await a.page.goto(`${BASE}/operator/products`, { waitUntil: "networkidle" });
  await a.page.getByTestId("columns-chooser").waitFor();
  assert.ok((await count(a.page, "price")) > 0 && (await count(a.page, "sku")) > 0, "the defaults are what the list always showed");
  assert.equal(await count(a.page, "updated"), 0);

  await choose(a.page, ["updated", "sku"]);
  await a.page.getByTestId("columns-save").click();
  await a.page.getByTestId("columns-panel").waitFor({ state: "detached" });
  assert.equal(await count(a.page, "price"), 0, "price is hidden now");
  assert.equal(await count(a.page, "stock"), 0);
  assert.ok((await count(a.page, "updated")) > 0);
  assert.deepEqual((await stored()).map((r) => [r.user_id, r.house, r.list, r.columns]), [[ann.id, "health", "products", ["updated", "sku"]]]);
  // the order is the person's: "updated" comes before the code in the line under the name
  assert.deepEqual(await a.page.getByTestId("row-meta").first().evaluate((el) => [...el.querySelectorAll("[data-col]")].map((e) => e.dataset.col)), ["updated", "sku"]);

  // a reload keeps it; another person has the defaults
  await a.page.reload({ waitUntil: "networkidle" });
  assert.equal(await count(a.page, "price"), 0);
  const b = await pageAs("bob.admin");
  await b.page.goto(`${BASE}/operator/products`, { waitUntil: "networkidle" });
  assert.ok((await count(b.page, "price")) > 0, "bob still has the defaults");
  await b.ctx.close();

  // Beauty is another house: its list is untouched
  const bt = await pageAs("ann.admin", "beauty");
  await bt.page.goto(`${BASE}/beauty/operator/products`, { waitUntil: "networkidle" });
  await bt.page.getByTestId("columns-toggle").click();
  assert.equal(await bt.page.locator('[data-testid="columns-panel"] input[data-column="price"]').isChecked(), true, "Beauty keeps its defaults (price is ticked)");
  assert.equal(await bt.page.locator('[data-testid="columns-panel"] input[data-column="updated"]').isChecked(), false);
  await bt.ctx.close();

  // back to the default
  await a.page.getByTestId("columns-toggle").click();
  await a.page.getByTestId("columns-reset").click();
  await a.page.getByTestId("columns-panel").waitFor({ state: "detached" });
  assert.deepEqual(await stored(), []);
  assert.ok((await count(a.page, "price")) > 0);
  await a.ctx.close();
});

test("at least one field must stay; nothing is saved without it", async () => {
  await addUser({ username: "seed.owner", role: "owner", houses: ["health", "beauty"] });
  await addUser({ username: "ann.admin", role: "house_admin" });
  const a = await pageAs("ann.admin");
  await a.page.goto(`${BASE}/operator/products`, { waitUntil: "networkidle" });
  await choose(a.page, []);
  await a.page.getByTestId("columns-save").click();
  await a.page.getByTestId("columns-error").waitFor();
  assert.deepEqual(await stored(), []);
  await a.ctx.close();
});

test("requests: their own fields; Beauty's request list keeps its own choice", async () => {
  await addUser({ username: "seed.owner", role: "owner", houses: ["health", "beauty"] });
  await addUser({ username: "ann.admin", role: "house_admin", houses: ["health", "beauty"] });
  const ts = "2026-10-01T10:00:00.000Z";
  for (const [t, code] of [["quote_requests", "MH-COL-1"], ["beauty_quote_requests", "MB-COL-1"]]) {
    const res = await rest(t, { method: "POST", body: JSON.stringify([{ name: "Col Person", phone: "+99290111222", tracking_code: code, status: "new", product_name: "Item", quantity: 3, created_at: ts, updated_at: ts }]) });
    assert.equal(res.status, 201, await res.clone().text());
  }
  const a = await pageAs("ann.admin");
  await a.page.goto(`${BASE}/operator/quotes`, { waitUntil: "networkidle" });
  await a.page.getByTestId("columns-chooser").waitFor();
  assert.equal(await count(a.page, "phone"), 0, "the phone is not in the default row");
  await choose(a.page, ["tracking", "phone", "status"]);
  await a.page.getByTestId("columns-save").click();
  await a.page.getByTestId("columns-panel").waitFor({ state: "detached" });
  assert.ok((await count(a.page, "phone")) > 0 && (await count(a.page, "tracking")) > 0 && (await count(a.page, "status")) > 0);
  assert.equal(await count(a.page, "product"), 0); assert.equal(await count(a.page, "date"), 0);
  assert.deepEqual((await stored()).map((r) => [r.house, r.list]), [["health", "quotes"]]);
  const mine = a.page.getByTestId("row-meta").filter({ hasText: "MH-COL-1" });
  assert.deepEqual(await mine.first().evaluate((el) => [...el.querySelectorAll("[data-col]")].map((e) => e.dataset.col)), ["tracking", "phone"], "in the chosen order");
  assert.match(await mine.first().innerText(), /\+99290111222/);
  await a.ctx.close();

  const b = await pageAs("ann.admin", "beauty");
  await b.page.goto(`${BASE}/beauty/operator/quotes`, { waitUntil: "networkidle" });
  assert.equal(await count(b.page, "phone"), 0, "Beauty's request list has the defaults");
  await b.ctx.close();
});

test("the chooser fits a 320 px phone, open, with long labels and a row of long data", async () => {
  await addUser({ username: "seed.owner", role: "owner", houses: ["health", "beauty"] });
  await addUser({ username: "ann.admin", role: "house_admin" });
  const a = await pageAs("ann.admin", "health", 320);
  await a.page.goto(`${BASE}/operator/products`, { waitUntil: "networkidle" });
  await a.page.getByTestId("columns-toggle").click();
  await a.page.getByTestId("columns-panel").waitFor();
  assert.equal((await a.page.evaluate(measureInPage)).count, 0, "chooser open at 320 px");
  await choose(a.page, ["sku", "category", "price", "updated", "status", "gaps", "schedule", "stock", "featured"]);
  await a.page.getByTestId("columns-save").click();
  await a.page.getByTestId("columns-panel").waitFor({ state: "detached" });
  assert.equal((await a.page.evaluate(measureInPage)).count, 0, "list with every field at 320 px");
  await a.ctx.close();
});
