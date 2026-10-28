// The publish quality rule with personal accounts (OPERATOR_USERS=on, which the runner gives files named accounts-*): only a person with the right
// changes the rule (a product manager sees it read-only and the server refuses), a request to publish an incomplete product is not even filed, and an
// approval whose rule was tightened meanwhile fails safely instead of publishing.
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { BASE, DB, launch, state, resetDb, apiLogin } from "./helpers.mjs";
import { hashPassword } from "../../lib/operator/passwords.js";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
beforeEach(async () => { await resetDb(); });

const SERVICE = "service-test-key";
const PW = "Strong-Passw0rd-77";
const rest = (path, init = {}) => fetch(`${DB}/rest/v1/${path}`, { ...init, headers: { apikey: SERVICE, "content-type": "application/json", prefer: "return=representation", ...(init.headers || {}) } });
async function addUser(o) {
  const res = await rest("operator_users", { method: "POST", body: JSON.stringify({ display_name: o.username, password_hash: hashPassword(PW), status: "active", role: "viewer", houses: ["health"], require_2fa: false, ...o }) });
  return (await res.json())[0];
}
async function pageAs(user) {
  const s = await apiLogin("health", { user, password: PW });
  assert.ok(s.cookie, `login failed: ${s.status}`);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const [name, ...parts] = s.cookie.split("=");
  await ctx.addCookies([{ name, value: parts.join("="), url: BASE }]);
  return { ctx, page: await ctx.newPage() };
}
const setRule = (blocking) => rest("publish_rules", { method: "POST", body: JSON.stringify({ house: "health", blocking }) });

test("only a person with the right changes the rule; others see it read-only; the server refuses a forged save", async () => {
  await addUser({ username: "seed.owner", role: "owner", houses: ["health", "beauty"] });
  await addUser({ username: "house.admin", role: "house_admin" });
  await addUser({ username: "pm.viewer", role: "product_manager" });
  // the house administrator chooses
  const adm = await pageAs("house.admin");
  await adm.page.goto(`${BASE}/operator/settings`, { waitUntil: "networkidle" });
  const card = adm.page.getByTestId("publish-rules");
  await card.getByTestId("rule-sku").check();
  await card.getByTestId("rules-save").click();
  await card.getByTestId("rules-msg").waitFor();
  assert.deepEqual(((await state()).publish_rules || [])[0].blocking, ["sku"]);
  const label = (await state()).publish_rules[0].updated_label;
  assert.equal(label, "house.admin", "the screen names who changed it last");
  await adm.ctx.close();
  // a product manager reads it but cannot change it
  const pm = await pageAs("pm.viewer");
  await pm.page.goto(`${BASE}/operator/settings`, { waitUntil: "networkidle" });
  await pm.page.getByTestId("rules-readonly").waitFor();
  assert.equal(await pm.page.getByTestId("rules-save").count(), 0);
  assert.equal(await pm.page.getByTestId("rule-sku").isDisabled(), true);
  assert.equal(await pm.page.getByTestId("rule-sku").isChecked(), true, "…and sees the current choice");
  // (a forged call is refused by the server: tests/publish-rules.test.mjs "saving the rule")
  await pm.ctx.close();
});

test("a request to publish an incomplete product is not filed; a complete one is; a product made incomplete before the approval fails the request safely", async () => {
  await addUser({ username: "seed.owner", role: "owner", houses: ["health", "beauty"] });
  const requester = await addUser({ username: "pm.requester", role: "product_manager" });      // publishing needs approval by default
  await addUser({ username: "rev.admin", role: "house_admin" });
  await setRule(["image"]);
  // product 2 (archived) has no image → the request is refused at once, nothing is filed
  // the seed products have no image: give product 3 one (and take it off the site), so it is complete
  await rest("products?id=eq.3", { method: "PATCH", body: JSON.stringify({ image_url: "img.png", is_active: false }) });
  const pm = await pageAs("pm.requester");
  await pm.page.goto(`${BASE}/operator/products?status=inactive&q=E2E-2`, { waitUntil: "networkidle" });
  await pm.page.getByTitle("فعال‌سازی").click();
  await pm.page.getByText(/انتشار ممکن نیست/).waitFor();
  assert.equal(((await state()).operator_change_requests || []).length, 0, "an impossible request is never filed");
  await pm.page.goto(`${BASE}/operator/products?status=inactive&q=E2E-3`, { waitUntil: "networkidle" });
  await pm.page.getByTitle("فعال‌سازی").click();
  await pm.page.getByText(/برای تأیید ارسال شد/).first().waitFor();
  const [req] = (await state()).operator_change_requests;
  assert.equal(req.operation, "products.publish");
  await pm.ctx.close();
  // meanwhile the product loses its image: the rule is judged again when the reviewer approves
  await rest("products?id=eq.3", { method: "PATCH", body: JSON.stringify({ image_url: null }) });
  const rev = await pageAs("rev.admin");
  await rev.page.goto(`${BASE}/operator/approvals`, { waitUntil: "networkidle" });
  await rev.page.getByTestId("approve").first().click();
  await rev.page.getByText(/قوانین کیفیت انتشار رعایت نشده است/).waitFor();
  const st = await state();
  assert.equal(st.products.find((p) => p.id === 3).is_active, false, "the product was NOT published");
  assert.deepEqual([st.operator_change_requests[0].status, st.operator_change_requests[0].exec_error], ["failed", "quality"]);
  assert.equal(requester.username, "pm.requester");
  await rev.ctx.close();
});
