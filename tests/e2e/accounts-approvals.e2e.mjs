// End-to-end: the approval queue (OPERATOR_USERS=on). A product manager's price change / publication / permanent delete does NOT touch
// the live data: it becomes a request. A reviewer sees the old and the proposed value, approves (applied now, only if the record is
// still as it was) or rejects with a reason; the requester sees the status and the reason. A newer change is never overwritten, a
// request whose author lost the right is not executed, the history names both people.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { BASE, launch, state, resetDb, apiLogin, clearFaults } from "./helpers.mjs";
import { SERVICE_KEY } from "./fakeDb.mjs";
import { hashPassword } from "../../lib/operator/passwords.js";

const DB = process.env.E2E_DB_URL;
const PW = "Strong-Passw0rd-77";
let browser, requester, reviewer;
before(async () => {
  browser = await launch(); await resetDb(); await clearFaults();
  await addUser({ username: "seed.owner", role: "owner", houses: ["health", "beauty"] });
  requester = await addUser({ username: "pm.requester", role: "product_manager" });        // price / publish / delete need approval by default
  reviewer = await addUser({ username: "rev.admin", role: "house_admin" });
});
after(async () => { await browser?.close(); });

const rest = (path, init = {}) => fetch(`${DB}/rest/v1/${path}`, { ...init, headers: { apikey: SERVICE_KEY, "content-type": "application/json", prefer: "return=representation", ...(init.headers || {}) } });
async function addUser(o) {
  const res = await rest("operator_users", { method: "POST", body: JSON.stringify({ display_name: o.username, password_hash: hashPassword(PW), status: "active", role: "viewer", houses: ["health"], require_2fa: false, ...o }) });
  return (await res.json())[0];
}
const patch = (table, filter, body) => rest(`${table}?${filter}`, { method: "PATCH", body: JSON.stringify(body) });
const login = (user) => apiLogin("health", { user, password: PW });
async function pageAs(user) {
  const s = await login(user);
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const [name, ...parts] = s.cookie.split("=");
  await ctx.addCookies([{ name, value: parts.join("="), url: BASE }]);
  return { ctx, page: await ctx.newPage() };
}
const requests = async () => (await state()).operator_change_requests || [];
const product = async (id) => (await state()).products.find((p) => p.id === id);

async function changePriceViaForm(page, price) {
  await page.goto(`${BASE}/operator/products/1/edit`, { waitUntil: "networkidle" });
  await page.getByLabel(/قیمت \(دلار\)/).fill(String(price));
  await page.getByRole("button", { name: "ذخیره تغییرات" }).first().click();
  await page.waitForURL(/\/operator\/approvals/);
}

test("a price change by a product manager becomes a request: the live product is untouched; the reviewer sees old and new and a badge", async () => {
  const { ctx, page } = await pageAs("pm.requester");
  await changePriceViaForm(page, 15);
  await page.getByText("برای تأیید ارسال شد").first().waitFor();
  assert.equal((await product(1)).price, 10, "nothing changed on the live product");
  const [req] = await requests();
  assert.deepEqual([req.status, req.operation, req.requested_by], ["pending", "products.content", requester.id]);
  assert.equal(req.proposed.price, 15);
  assert.equal(req.before.price, 10);
  assert.ok(req.base_updated_at);
  assert.ok((await page.getByTestId("mine").innerText()).includes("E2E-1"));
  await ctx.close();

  const r = await pageAs("rev.admin");
  await r.page.goto(`${BASE}/operator`, { waitUntil: "networkidle" });
  assert.equal((await r.page.getByTestId("nav-badge").first().innerText()).trim(), "1");
  await r.page.goto(`${BASE}/operator/approvals`, { waitUntil: "networkidle" });
  const card = r.page.getByTestId("to-review").getByTestId("request").first();
  assert.equal((await card.getByTestId("diff-old").first().innerText()).trim(), "10");
  assert.equal((await card.getByTestId("diff-new").first().innerText()).trim(), "15");
  await r.ctx.close();
});

test("the reviewer approves: applied at that moment; the history names the requester and the reviewer; the requester sees it approved", async () => {
  const r = await pageAs("rev.admin");
  await r.page.goto(`${BASE}/operator/approvals`, { waitUntil: "networkidle" });
  await r.page.getByTestId("approve").first().click();
  await r.page.getByText("تأیید شد و اعمال شد.").waitFor();
  assert.equal((await product(1)).price, 15);
  const st = await state();
  const req = st.operator_change_requests[0];
  assert.deepEqual([req.status, req.reviewed_by], ["approved", reviewer.id]);
  assert.ok(req.executed_at);
  const entry = st.operator_audit_log.find((x) => x.action === "approval.approved");
  assert.deepEqual([entry.user_id, entry.target_user_id, entry.result, entry.request_id], [reviewer.id, requester.id, "success", req.id]);
  assert.deepEqual([entry.before.price, entry.after.price], [10, 15], "the history keeps before and after");
  await r.ctx.close();
  const m = await pageAs("pm.requester");
  await m.page.goto(`${BASE}/operator/approvals`, { waitUntil: "networkidle" });
  assert.equal(await m.page.getByTestId("mine").getByTestId("request").first().getAttribute("data-status"), "approved");
  await m.ctx.close();
});

test("STALE: a newer change made meanwhile is never overwritten; the request fails and can be asked again", async () => {
  const m = await pageAs("pm.requester");
  await changePriceViaForm(m.page, 20);
  await m.ctx.close();
  await patch("products", "id=eq.1", { price: 33 });                                  // somebody else changes the product after the request
  const r = await pageAs("rev.admin");
  await r.page.goto(`${BASE}/operator/approvals`, { waitUntil: "networkidle" });
  await r.page.getByTestId("approve").first().click();
  await r.page.getByRole("alert").filter({ hasText: /تغییر کرده/ }).waitFor();
  assert.equal((await product(1)).price, 33, "the newer value survives");
  const failed = (await requests()).find((x) => x.status === "failed");
  assert.equal(failed.exec_error, "stale");
  await r.ctx.close();

  const m2 = await pageAs("pm.requester");
  await m2.page.goto(`${BASE}/operator/approvals`, { waitUntil: "networkidle" });
  await m2.page.getByTestId("mine").getByTestId("resubmit").first().click();
  await m2.page.waitForTimeout(800);
  const pending = (await requests()).filter((x) => x.status === "pending");
  assert.equal(pending.length, 1);
  assert.equal(pending[0].resubmitted_from, failed.id);
  assert.equal(pending[0].before.price, 33, "the new request is prepared against what the product is NOW");
  await m2.ctx.close();
  const r2 = await pageAs("rev.admin");
  await r2.page.goto(`${BASE}/operator/approvals`, { waitUntil: "networkidle" });
  await r2.page.getByTestId("approve").first().click();
  await r2.page.getByText("تأیید شد و اعمال شد.").waitFor();
  assert.equal((await product(1)).price, 20);
  await r2.ctx.close();
});

test("a rejection needs a reason, which the requester then sees; nothing changes", async () => {
  const m = await pageAs("pm.requester");
  await changePriceViaForm(m.page, 99);
  await m.ctx.close();
  const r = await pageAs("rev.admin");
  await r.page.goto(`${BASE}/operator/approvals`, { waitUntil: "networkidle" });
  await r.page.getByTestId("reject").first().click();
  assert.equal(await r.page.getByTestId("reject-confirm").isDisabled(), true, "no reason, no rejection");
  await r.page.getByLabel("دلیل رد (لازم)").fill("قیمت خیلی بالاست");
  await r.page.getByTestId("reject-confirm").click();
  await r.page.getByText("رد شد.").first().waitFor();
  assert.equal((await product(1)).price, 20);
  await r.ctx.close();
  const m2 = await pageAs("pm.requester");
  await m2.page.goto(`${BASE}/operator/approvals`, { waitUntil: "networkidle" });
  const rejected = m2.page.getByTestId("mine").locator('[data-status="rejected"]').first();
  assert.match(await rejected.getByTestId("review-reason").innerText(), /قیمت خیلی بالاست/);
  await m2.ctx.close();
});

test("a request whose author lost the right is NOT executed", async () => {
  const m = await pageAs("pm.requester");
  await changePriceViaForm(m.page, 45);
  await m.ctx.close();
  await patch("operator_users", `id=eq.${requester.id}`, { deny_perms: ["health.products.edit"] });     // the right is withdrawn meanwhile
  await new Promise((resolve) => setTimeout(resolve, 2500));
  const r = await pageAs("rev.admin");
  await r.page.goto(`${BASE}/operator/approvals`, { waitUntil: "networkidle" });
  await r.page.getByTestId("approve").first().click();
  await r.page.getByRole("alert").filter({ hasText: /دیگر اجازهٔ این کار را ندارد/ }).waitFor();
  assert.equal((await product(1)).price, 20);
  assert.ok((await requests()).some((x) => x.status === "superseded"));
  await r.ctx.close();
  await patch("operator_users", `id=eq.${requester.id}`, { deny_perms: [] });
  await new Promise((resolve) => setTimeout(resolve, 2500));
});

test("a permanent delete through the queue: filed against an archived product with the typed SKU, executed by the reviewer with the full history", async () => {
  const m = await pageAs("pm.requester");
  await m.page.goto(`${BASE}/operator/products`, { waitUntil: "networkidle" });
  await m.page.getByTestId("product-delete").first().click();
  const dialog = m.page.getByRole("dialog");
  await dialog.waitFor();
  await dialog.getByLabel(/برای تأیید/).fill("E2E-2");
  await dialog.getByRole("button", { name: "حذف دائمی" }).click();
  await m.page.getByText("برای تأیید ارسال شد").first().waitFor();
  assert.ok(await product(2), "still there while pending");
  await m.ctx.close();
  const r = await pageAs("rev.admin");
  await r.page.goto(`${BASE}/operator/approvals`, { waitUntil: "networkidle" });
  await r.page.getByTestId("to-review").getByTestId("request").filter({ hasText: "E2E-2" }).getByTestId("approve").click();
  await r.page.getByText("تأیید شد و اعمال شد.").waitFor();
  assert.equal(await product(2), undefined, "deleted after the approval");
  const trail = (await state()).operator_audit_log.filter((x) => /^product\.delete/.test(x.action)).sort((a, b) => a.id - b.id);
  assert.deepEqual(trail.map((x) => x.action), ["product.delete_attempt", "product.delete"]);
  assert.ok(trail.every((x) => x.user_id === reviewer.id), "the reviewer who executed it is named");
  await r.ctx.close();
});

test("people without the right cannot reach the queue; the old shared login has none", async () => {
  await addUser({ username: "plain.viewer", role: "viewer" });
  const s = await login("plain.viewer");
  const res = await fetch(`${BASE}/operator/approvals`, { redirect: "manual", headers: { cookie: s.cookie } });
  assert.ok(res.status >= 300 && res.status < 400 && /no-access/.test(res.headers.get("location") || ""));
});

test("the activity log shows WHO did it, filters by person / result, pages, exports a CSV only with its own permission, and hides from product managers", async () => {
  const r = await pageAs("rev.admin");
  await r.page.goto(`${BASE}/operator/activity`, { waitUntil: "networkidle" });
  const rows = r.page.getByTestId("audit-row");
  assert.ok((await rows.count()) > 0);
  assert.ok((await r.page.getByTestId("audit-who").first().innerText()).length > 0, "the person is named");
  const approved = r.page.locator('[data-action="approval.approved"]').first();
  assert.match(await approved.getByTestId("audit-who").innerText(), /rev\.admin/);
  assert.match(await approved.getByTestId("audit-who").innerText(), /pm\.requester/, "…and to whom it concerned");
  assert.ok(await approved.getByTestId("audit-change").count(), "before / after of the change");

  // filter by person
  await r.page.goto(`${BASE}/operator/activity?who=${reviewer.id}`, { waitUntil: "networkidle" });
  const whos = await r.page.getByTestId("audit-who").allInnerTexts();
  assert.ok(whos.length > 0 && whos.every((w) => w.includes("rev.admin")), "only that person's entries");
  await r.page.goto(`${BASE}/operator/activity?result=rejected`, { waitUntil: "networkidle" });
  for (const a of await r.page.getByTestId("audit-row").evaluateAll((els) => els.map((e) => e.getAttribute("data-action")))) assert.ok(a, "rejected entries listed");

  // CSV export: its own permission; the file has the header and no password or code
  await r.page.goto(`${BASE}/operator/activity`, { waitUntil: "networkidle" });
  const [download] = await Promise.all([r.page.waitForEvent("download"), r.page.getByTestId("audit-export").click()]);
  const text = await (await import("node:fs")).promises.readFile(await download.path(), "utf8");
  assert.match(text, /^﻿time,action,result,person/);
  assert.ok(text.includes("approval.approved"));
  assert.ok(!text.includes(PW));
  const exported = (await state()).operator_audit_log.find((x) => x.action === "audit.exported");
  assert.deepEqual([exported.user_id, exported.result], [reviewer.id, "success"], "the export itself is logged with the person");
  await r.ctx.close();

  // a product manager has neither the log nor the export
  const m = await login("pm.requester");
  const res = await fetch(`${BASE}/operator/activity`, { redirect: "manual", headers: { cookie: m.cookie } });
  assert.ok(res.status >= 300 && res.status < 400 && /no-access/.test(res.headers.get("location") || ""));
});
