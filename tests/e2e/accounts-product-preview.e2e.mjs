// Previewing a pending approval request's proposal on the real public page (docs/PANEL_DRAFT_PREVIEW.md). Personal accounts are needed
// (OPERATOR_USERS=on, which the runner gives files named accounts-*), because approvals exist only with them.
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { BASE, DB, launch, state, resetDb, apiLogin } from "./helpers.mjs";
import { hashPassword } from "../../lib/operator/passwords.js";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
beforeEach(async () => { await resetDb(); });

const SERVICE = "service-test-key";
const ts = "2026-10-01T10:00:00.000Z";
async function insert(table, rows) {
  const res = await fetch(`${DB}/rest/v1/${table}`, { method: "POST", headers: { apikey: SERVICE, "content-type": "application/json", prefer: "return=representation" }, body: JSON.stringify(rows) });
  assert.equal(res.status, 201);
  return res.json();
}
const PW = "Strong-Passw0rd-77";
async function addUser(o) {
  const res = await fetch(`${DB}/rest/v1/operator_users`, { method: "POST", headers: { apikey: SERVICE, "content-type": "application/json", prefer: "return=representation" }, body: JSON.stringify({ display_name: o.username, password_hash: hashPassword(PW), status: "active", role: "viewer", houses: ["health"], require_2fa: false, ...o }) });
  return (await res.json())[0];
}
const bodyText = (page) => page.locator("body").innerText();

test("Health: a pending request's proposal can be previewed from the approvals screen; another house's request cannot", async () => {
  await addUser({ username: "seed.owner", role: "owner", houses: ["health", "beauty"] });
  const requester = await addUser({ username: "pm.requester", role: "product_manager" });
  await addUser({ username: "rev.admin", role: "house_admin" });
  const [req] = await insert("operator_change_requests", [{ house: "health", operation: "products.price", resource: "products", entity: "products", entity_id: 3, status: "pending", proposed: { price: 4321 }, before: { price: 5 }, subject: "E2E-3", requested_by: requester.id, requested_at: ts, base_updated_at: ts }]);
  const [other] = await insert("operator_change_requests", [{ house: "beauty", operation: "products.price", resource: "products", entity: "beauty_products", entity_id: 3, status: "pending", proposed: { price: 1 }, subject: "B", requested_by: requester.id, requested_at: ts }]);
  const s = await apiLogin("health", { user: "rev.admin", password: PW });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  assert.ok(s.cookie, `login failed: ${s.status} ${JSON.stringify(s.body)}`);
  const [name, ...parts] = s.cookie.split("=");
  await ctx.addCookies([{ name, value: parts.join("="), url: BASE }]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/operator/approvals`, { waitUntil: "networkidle" });
  const link = page.getByTestId("request-preview").first();
  await link.waitFor({ timeout: 8000 }).catch(async (e) => { throw new Error((await bodyText(page)).slice(0, 1500) + "\n" + JSON.stringify((await state()).operator_change_requests)); });
  const href = await link.getAttribute("href");
  assert.match(href, new RegExp(`/health/tg/preview/3\\?request=${req.id}`));
  await page.goto(BASE + href.replace("/tg/", "/en/"), { waitUntil: "networkidle" });
  await page.getByTestId("preview-banner").waitFor();
  assert.match(await page.getByTestId("preview-source").innerText(), /درخواست تأیید|approval request|тасдиқ/i);
  assert.match(await bodyText(page), /4,?321/, "the proposed price is on the real page");
  assert.equal((await state()).products.find((p) => p.id === 3).price, 5, "the proposal is not applied");
  assert.equal((await page.goto(`${BASE}/health/en/preview/3?request=${other.id}`)).status(), 404, "another house's request");
  assert.equal((await page.goto(`${BASE}/health/en/preview/1?request=${req.id}`)).status(), 404, "a request for another product");
  await ctx.close();
});

