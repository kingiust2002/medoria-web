// End-to-end: permissions on pages and actions for personal accounts (OPERATOR_USERS=on; the runner starts the app that way for the
// accounts*.e2e.mjs files). A viewer, a product manager and a request manager open the pages they may and are sent to "no access" from
// the rest; customers' data does not reach a person who may not see it; a permission taken away is enforced by the server on the next
// click (even from a screen that still shows the button) and the refusal is logged with the person's id.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { BASE, launch, state, resetDb, apiLogin, clearFaults } from "./helpers.mjs";
import { SERVICE_KEY } from "./fakeDb.mjs";
import { hashPassword } from "../../lib/operator/passwords.js";

const DB = process.env.E2E_DB_URL;
const PW = "Strong-Passw0rd-77";
let browser;
before(async () => {
  browser = await launch(); await resetDb(); await clearFaults();
  await addUser({ username: "seed.owner", role: "owner", houses: ["health", "beauty"] });     // an active owner = personal accounts rule
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
const opens = async (path, cookie) => (await withCookie(path, cookie)).status === 200;
const noAccess = async (path, cookie) => {
  const r = await withCookie(path, cookie);
  return r.status >= 300 && r.status < 400 && /no-access/.test(r.headers.get("location") || "");
};

test("a viewer reads products and requests, but not the activity log nor the create / import / bulk pages", async () => {
  await addUser({ username: "just.viewer", role: "viewer" });
  const v = await login("just.viewer");
  assert.equal(v.status, 200);
  assert.equal(await opens("/operator/products", v.cookie), true);
  assert.equal(await opens("/operator/quotes", v.cookie), true);
  assert.equal(await opens("/operator/no-access", v.cookie), true);
  for (const p of ["/operator/activity", "/operator/products/new", "/operator/products/import", "/operator/products/bulk"]) {
    assert.equal(await noAccess(p, v.cookie), true, `viewer ${p}`);
  }
});

test("customers' data never reaches a person who may not see it; the dashboard shows only their blocks", async () => {
  await addUser({ username: "prod.manager", role: "product_manager" });
  await addUser({ username: "quote.manager", role: "quote_manager" });
  const pm = await login("prod.manager");
  const qm = await login("quote.manager");
  assert.equal(await opens("/operator/products/new", pm.cookie), true);
  assert.equal(await noAccess("/operator/quotes", pm.cookie), true, "customers are not for product managers");
  assert.equal(await noAccess("/operator/activity", pm.cookie), true);
  const pmDash = await (await withCookie("/operator", pm.cookie)).text();
  assert.ok(!pmDash.includes("E2E Customer"), "customer names on a product manager's dashboard");
  assert.ok(pmDash.includes("E2E Product"));
  const qmDash = await (await withCookie("/operator", qm.cookie)).text();
  assert.ok(qmDash.includes("E2E Customer"));
  assert.ok(!qmDash.includes("E2E Product"), "the catalogue on a request manager's dashboard");
  assert.equal(await noAccess("/operator/products", qm.cookie), true);
  // the menu offers only what opens
  const pmNav = pmDash.match(/href="\/operator\/[a-z/]*"/g) || [];
  assert.ok(!pmNav.some((h) => /quotes|activity/.test(h)), `menu leaks: ${pmNav.join(",")}`);
});

test("a Health-only role never reaches the Beauty panel, page by page", async () => {
  const s = await login("just.viewer");
  const beautyCookie = s.cookie.replace("medoria_operator=", "medoria_beauty_operator=");
  for (const p of ["/beauty/operator", "/beauty/operator/products", "/beauty/operator/quotes"]) {
    assert.equal(await opens(p, beautyCookie), false, p);
  }
  assert.equal((await login("just.viewer", "beauty")).status, 401);
});

test("stale screen: a permission taken away is enforced by the server on the very next click, and logged with the person", async () => {
  const u = await addUser({ username: "stale.deleter", role: "house_admin", houses: ["health"] });
  const s = await login("stale.deleter");
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const [name, ...parts] = s.cookie.split("=");
  await ctx.addCookies([{ name, value: parts.join("="), url: BASE }]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/operator/products`, { waitUntil: "networkidle" });
  const buttons = page.getByTestId("product-delete");
  assert.equal(await buttons.count(), 1, "the screen shows the delete button (it was allowed when the page loaded)");
  await buttons.first().click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await dialog.getByLabel(/برای تأیید/).fill("E2E-2");
  // the permission is withdrawn WITHOUT touching the session: only the server's per-request check can stop the click
  await patchUser(u.id, { deny_perms: ["health.products.delete"] });
  await new Promise((r) => setTimeout(r, 2500));                       // the short per-person cache
  await dialog.getByRole("button", { name: "حذف دائمی" }).click();
  await dialog.getByRole("alert").waitFor();
  assert.match(await dialog.getByRole("alert").innerText(), /اجازهٔ انجام این کار را ندارید/);
  const st = await state();
  assert.ok(st.products.some((p) => p.id === 2), "the product is still there");
  assert.ok(!st.operator_audit_log.some((r) => r.action === "product.delete_attempt"), "not even a delete attempt was recorded");
  const denied = st.operator_audit_log.filter((r) => r.action === "access.denied" && r.user_id === u.id);
  assert.equal(denied.length, 1);
  assert.equal(denied[0].result, "rejected");
  assert.equal(denied[0].detail.reason, "products.delete");
  await ctx.close();
});

test("the same click works for a person who is allowed, and the log names who did it", async () => {
  const u = await addUser({ username: "allowed.deleter", role: "house_admin", houses: ["health"] });
  const s = await login("allowed.deleter");
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const [name, ...parts] = s.cookie.split("=");
  await ctx.addCookies([{ name, value: parts.join("="), url: BASE }]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/operator/products`, { waitUntil: "networkidle" });
  await page.getByTestId("product-delete").first().click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await dialog.getByLabel(/برای تأیید/).fill("E2E-2");
  await dialog.getByRole("button", { name: "حذف دائمی" }).click();
  await page.getByText("محصول برای همیشه حذف شد.").waitFor();
  const log = (await state()).operator_audit_log.filter((r) => /^product\.delete/.test(r.action) && r.user_id === u.id).sort((a, b) => a.id - b.id);
  assert.deepEqual(log.map((r) => r.action), ["product.delete_attempt", "product.delete"], "both entries carry the person");
  await ctx.close();
});

test("the screens only offer what the person may do (buttons are not rendered), while the server still decides", async () => {
  await addUser({ username: "view.only", role: "viewer" });
  await addUser({ username: "prod.mgr2", role: "product_manager" });
  await addUser({ username: "quote.mgr2", role: "quote_manager" });
  const html = async (path, cookie) => (await withCookie(path, cookie)).text();
  const viewer = (await login("view.only")).cookie, pm = (await login("prod.mgr2")).cookie, qm = (await login("quote.mgr2")).cookie;

  // products list: a viewer sees the products but no create / import / bulk / select / duplicate / archive / delete controls
  const vProducts = await html("/operator/products", viewer);
  assert.ok(vProducts.includes("E2E Product"), "the viewer still reads the catalogue");
  for (const gone of ['href="/operator/products/new"', 'href="/operator/products/import"', 'href="/operator/products/bulk"', "انتخاب همه", 'title="تکثیر"', 'data-testid="product-delete"']) {
    assert.ok(!vProducts.includes(gone), `viewer must not be offered: ${gone}`);
  }
  const pmProducts = await html("/operator/products", pm);
  assert.ok(pmProducts.includes('href="/operator/products/new"'), "a product manager creates products");
  assert.ok(pmProducts.includes("انتخاب همه"), "a product manager selects rows for bulk edits");

  // the edit form: read-only for a viewer, editable for a product manager
  const vForm = await html("/operator/products/1/edit", viewer);
  assert.ok(vForm.includes('data-testid="form-readonly"'));
  assert.ok(!vForm.includes("ذخیره تغییرات"), "no save button for a viewer");
  const pmForm = await html("/operator/products/1/edit", pm);
  assert.ok(!pmForm.includes('data-testid="form-readonly"'));
  assert.ok(pmForm.includes("ذخیره تغییرات"));

  // requests: a viewer reads, a request manager changes and deletes; a product manager may not even open them
  const vQuotes = await html("/operator/quotes", viewer);
  assert.ok(vQuotes.includes("E2E Customer"));
  assert.ok(!vQuotes.includes('title="حذف درخواست"'), "a viewer is not offered 'delete request'");
  const qmQuotes = await html("/operator/quotes", qm);
  assert.ok(qmQuotes.includes('title="حذف درخواست"'), "a request manager deletes requests");

  // hiding is only a convenience: a forged call from the viewer is still refused by the server (covered by the stale-screen test above)
});
