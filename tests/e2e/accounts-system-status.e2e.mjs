// The System status screen (N13, docs/PANEL_SYSTEM_STATUS.md) with personal accounts, against the fake database: with no report from the server's scripts EVERYTHING
// is "unknown" and the headline asks for attention (never green); a report posted with the token turns that one row to "reported healthy"; a failure shows as failed
// (with the last success); a stale or missing heartbeat keeps the headline off green; the alert path stays "not proven" until the main manager says they received the test
// alert, and then it is shown as their statement. A house admin can read but not confirm; a viewer cannot open the page. Both houses; 320 px.
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
const TOKEN = "e2e-ops-report-token-0123456789";
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
const report = (body, token = TOKEN) => fetch(`${BASE}/api/internal/ops-report`, { method: "POST", headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
const st = (page, kind) => page.getByTestId(`sys-${kind}`).getAttribute("data-state");
const open = async (page, base = "/operator") => { await page.goto(`${BASE}${base}/system`, { waitUntil: "networkidle" }); await page.getByTestId("sys-headline").waitFor(); };

test("nothing reported = unknown everywhere, never green; the route needs its token", async () => {
  await addUser({ username: "seed.owner", role: "owner", houses: ["health", "beauty"] });
  const o = await pageAs("seed.owner");
  await open(o.page);
  assert.equal(await o.page.getByTestId("sys-headline").getAttribute("data-state"), "attention");
  for (const k of ["backup", "backup_check", "restore_drill", "heartbeat"]) assert.equal(await st(o.page, k), "unknown", k);
  assert.equal(await o.page.getByTestId("sys-alert").getAttribute("data-state"), "never_tested");
  assert.equal(await o.page.getByTestId("sys-confirm").count(), 0, "nothing to confirm before a test alert was sent");
  assert.equal(await o.page.getByTestId("sys-db").getAttribute("data-state"), "ok", "the app really read its database");
  assert.equal(await o.page.getByTestId("sys-cfg-opsToken").getAttribute("data-set"), "1");
  assert.ok(await o.page.getByTestId("sys-mig-34").count() === 1 && await o.page.getByTestId("sys-mig-51").getAttribute("data-state") === "no_probe");
  // the route
  assert.equal((await report({ kind: "backup", status: "pass" }, null)).status, 401);
  assert.equal((await report({ kind: "backup", status: "pass" }, "wrong-wrong-wrong-wrong-wrong")).status, 401);
  assert.equal((await report({ kind: "disk", status: "pass" })).status, 400);
  assert.equal((await report({ kind: "alert_confirmed", status: "confirmed" })).status, 400, "a script cannot confirm an alert");
  assert.equal((await state()).ops_status?.length || 0, 0, "nothing was stored by the refused ones");
  await o.ctx.close();
});

test("reports change only their own row; a failure shows the last success; an unheard heartbeat keeps the headline off green", async () => {
  await addUser({ username: "seed.owner", role: "owner", houses: ["health", "beauty"] });
  const o = await pageAs("seed.owner");
  assert.equal((await report({ kind: "backup", status: "pass", detail: "snapshot 20261028T023001Z" })).status, 200);
  await open(o.page);
  assert.equal(await st(o.page, "backup"), "ok");
  assert.match(await o.page.getByTestId("sys-backup").innerText(), /20261028T023001Z/);
  assert.equal(await st(o.page, "restore_drill"), "unknown");
  assert.equal(await o.page.getByTestId("sys-headline").getAttribute("data-state"), "attention");
  // every monitored one reports success: only now "reported ok" — and the text says it is not a promise
  for (const kind of ["backup_check", "restore_drill", "heartbeat"]) assert.equal((await report({ kind, status: "pass" })).status, 200);
  await open(o.page);
  assert.equal(await o.page.getByTestId("sys-headline").getAttribute("data-state"), "reported_ok");
  assert.match(await o.page.getByTestId("sys-headline").innerText(), /بازیابی‌شدنی|restorable|барқарор/i, "it says what 'healthy' does not mean");
  // a failure
  assert.equal((await report({ kind: "backup", status: "fail", detail: "failed at step: database dump (exit 1)" })).status, 200);
  await open(o.page);
  assert.equal(await st(o.page, "backup"), "fail");
  assert.equal(await o.page.getByTestId("sys-headline").getAttribute("data-state"), "problem");
  assert.match(await o.page.getByTestId("sys-backup").innerText(), /database dump/);
  const row = (await state()).ops_status.find((r) => r.kind === "backup");
  assert.ok(row.last_pass_at, "the last success is remembered through the failure");
  // a URL in a detail is never stored
  await report({ kind: "heartbeat", status: "fail", detail: "ping https://hc-ping.com/secret-key-123 failed" });
  assert.ok(!JSON.stringify((await state()).ops_status).includes("secret-key-123"));
  await o.ctx.close();
});

test("the alert path is never proven by the app: a test alert awaits the manager's word; their word is shown as their statement; others cannot give it", async () => {
  await addUser({ username: "seed.owner", role: "owner", houses: ["health", "beauty"] });
  await addUser({ username: "house.admin", role: "house_admin", houses: ["health"] });
  await addUser({ username: "just.viewer", role: "viewer", houses: ["health"] });
  assert.equal((await report({ kind: "alert_test", status: "sent", detail: "deliberate failure signal sent" })).status, 200);
  const o = await pageAs("seed.owner");
  await open(o.page);
  assert.equal(await o.page.getByTestId("sys-alert").getAttribute("data-state"), "awaiting");
  await o.page.getByTestId("sys-confirm-note").fill("arrived on Telegram and by email");
  await o.page.getByTestId("sys-confirm").click();
  await o.page.getByTestId("sys-confirm-msg").waitFor();
  await poll(async () => (await state()).ops_status.some((r) => r.kind === "alert_confirmed"), { label: "confirmed" });
  await open(o.page);
  assert.equal(await o.page.getByTestId("sys-alert").getAttribute("data-state"), "confirmed");
  const text = await o.page.getByTestId("sys-alert").innerText();
  assert.match(text, /seed\.owner/); assert.match(text, /Telegram/);
  assert.match(text, /راستی‌آزمایی نشده|not verified|санҷида нашудааст/i, "labelled as a statement, not as proof");
  const conf = (await state()).ops_status.find((r) => r.kind === "alert_confirmed");
  assert.deepEqual([conf.status, conf.reported_by], ["confirmed", "seed.owner"]);
  assert.ok((await state()).operator_audit_log.some((l) => l.action === "ops.alert_confirmed"));
  // a new test alert makes the old confirmation obsolete
  await new Promise((r) => setTimeout(r, 30));
  await report({ kind: "alert_test", status: "sent" });
  await open(o.page);
  assert.equal(await o.page.getByTestId("sys-alert").getAttribute("data-state"), "awaiting");
  await o.ctx.close();

  const a = await pageAs("house.admin");
  await open(a.page);
  assert.equal(await a.page.getByTestId("sys-confirm").count(), 0, "a house admin can read but not confirm");
  await a.ctx.close();
  const v = await pageAs("just.viewer");
  await v.page.goto(`${BASE}/operator/system`, { waitUntil: "networkidle" });
  assert.match(v.page.url(), /no-access/, "a viewer cannot open it");
  await v.ctx.close();
});

test("Beauty shows the same truth; the settings page links to it; 320 px", async () => {
  await addUser({ username: "seed.owner", role: "owner", houses: ["health", "beauty"] });
  await report({ kind: "heartbeat", status: "pass" });
  const o = await pageAs("seed.owner", "beauty");
  await open(o.page, "/beauty/operator");
  assert.equal(await st(o.page, "heartbeat"), "ok");
  assert.equal(await st(o.page, "backup"), "unknown");
  await o.page.goto(`${BASE}/beauty/operator/settings`, { waitUntil: "networkidle" });
  await o.page.getByTestId("link-system").click();
  await o.page.waitForURL(/\/beauty\/operator\/system$/);
  await o.ctx.close();
  const m = await pageAs("seed.owner", "health", 320);
  await open(m.page);
  const res = await m.page.evaluate(measureInPage);
  assert.equal(res.count, 0, JSON.stringify(res.offenders?.slice(0, 3)));
  await m.ctx.close();
});
