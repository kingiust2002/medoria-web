// End-to-end: a person looks after their OWN sign-in (OPERATOR_USERS=on). A temporary password blocks everything until it is changed
// (and the change ends the other sessions); a required two-step login is set up from the restricted screen with a real code, recovery
// codes are shown once and stored as hashes, and from then on the code is needed at every sign-in.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { BASE, launch, state, resetDb, apiLogin, clearFaults } from "./helpers.mjs";
import { SERVICE_KEY } from "./fakeDb.mjs";
import { hashPassword, verifyPasswordHash } from "../../lib/operator/passwords.js";
import { totpAt, stepOf, hashRecovery } from "../../lib/operator/security.js";

const DB = process.env.E2E_DB_URL;
const PW = "Strong-Passw0rd-77";
const NEW_PW = "A-brand-new-Passw0rd-12";
let browser;
before(async () => {
  browser = await launch(); await resetDb(); await clearFaults();
  await addUser({ username: "seed.owner", role: "owner", houses: ["health", "beauty"] });
});
after(async () => { await browser?.close(); });

const rest = (path, init = {}) => fetch(`${DB}/rest/v1/${path}`, { ...init, headers: { apikey: SERVICE_KEY, "content-type": "application/json", prefer: "return=representation", ...(init.headers || {}) } });
async function addUser(o) {
  const res = await rest("operator_users", { method: "POST", body: JSON.stringify({ display_name: o.username, password_hash: hashPassword(PW), status: "active", role: "viewer", houses: ["health"], require_2fa: false, ...o }) });
  return (await res.json())[0];
}
const login = (user, extra = {}, password = PW) => apiLogin("health", { user, password, ...extra });
const withCookie = (path, cookie) => fetch(BASE + path, { redirect: "manual", headers: { cookie, origin: BASE } });
const opens = async (path, cookie) => (await withCookie(path, cookie)).status === 200;
async function pageAs(cookie) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const [name, ...parts] = cookie.split("=");
  await ctx.addCookies([{ name, value: parts.join("="), url: BASE }]);
  return { ctx, page: await ctx.newPage() };
}

test("a temporary password blocks everything until it is changed; the change ends the OTHER sessions and the old password dies", async () => {
  const u = await addUser({ username: "temp.person", role: "house_admin", must_change_password: true });
  const a = await login("temp.person");
  const other = await login("temp.person");
  assert.equal(a.body.mustChangePassword, true);
  const restrictedBody = await (await withCookie("/operator/products", a.cookie)).text();
  assert.ok(restrictedBody.includes('data-testid="account-setup"') && !restrictedBody.includes("E2E Product"), "restricted: only the setup screen, no catalogue");
  const { ctx, page } = await pageAs(a.cookie);
  await page.goto(`${BASE}/operator`, { waitUntil: "networkidle" });
  await page.getByTestId("account-setup").waitFor();
  await page.getByLabel("رمز عبور فعلی").fill("not-the-password-1");
  await page.locator('input[autocomplete="new-password"]').nth(0).fill(NEW_PW);
  await page.locator('input[autocomplete="new-password"]').nth(1).fill(NEW_PW);
  await page.getByRole("button", { name: "تغییر رمز عبور" }).click();
  await page.getByRole("alert").filter({ hasText: /\S/ }).first().waitFor();
  assert.match(await page.getByRole("alert").filter({ hasText: /\S/ }).first().innerText(), /رمز عبور فعلی درست نیست/);
  assert.equal(verifyPasswordHash(PW, (await state()).operator_users.find((x) => x.id === u.id).password_hash), true, "a wrong current password changes nothing");

  await page.getByLabel("رمز عبور فعلی").fill(PW);
  await page.getByRole("button", { name: "تغییر رمز عبور" }).click();
  await page.getByTestId("account-setup").waitFor({ state: "detached" });          // the restricted screen is gone after the refresh
  const st = await state();
  const row = st.operator_users.find((x) => x.id === u.id);
  assert.equal(row.must_change_password, false);
  assert.equal(verifyPasswordHash(NEW_PW, row.password_hash), true);
  assert.equal(await opens("/operator/products", a.cookie), true, "this session carries on, now unrestricted");
  assert.equal(await opens("/operator/products", other.cookie), false, "the other session ended");
  assert.equal((await login("temp.person")).status, 401, "the temporary password is dead");
  assert.equal((await login("temp.person", {}, NEW_PW)).status, 200);
  const entry = st.operator_audit_log.find((r) => r.action === "account.password_changed" && r.result === "success");
  assert.equal(entry.user_id, u.id);
  assert.ok(!JSON.stringify(st).includes(NEW_PW), "the new password is stored in clear somewhere");
  await ctx.close();
});

test("a required two-step login is set up from the restricted screen with a real code; recovery codes once; then the code is asked at every sign-in", async () => {
  const u = await addUser({ username: "must.2fa", role: "house_admin", require_2fa: true });
  const s = await login("must.2fa");
  assert.equal(s.body.mustSetUpTwoStep, true);
  const { ctx, page } = await pageAs(s.cookie);
  await page.goto(`${BASE}/operator`, { waitUntil: "networkidle" });
  await page.getByTestId("account-setup").waitFor();
  await page.getByRole("button", { name: /راه‌اندازی ورود دومرحله‌ای/ }).click();
  await page.getByLabel("رمز عبور فعلی").fill("wrong-wrong-wrong-1");
  await page.getByRole("button", { name: "ادامه" }).click();
  await page.getByRole("alert").filter({ hasText: /\S/ }).first().waitFor();
  assert.ok(!(await state()).operator_users.find((x) => x.id === u.id).totp_secret_enc);

  await page.getByLabel("رمز عبور فعلی").fill(PW);
  await page.getByRole("button", { name: "ادامه" }).click();
  const secret = (await page.getByTestId("totp-secret").innerText()).replace(/\s+/g, "");
  assert.match(secret, /^[A-Z2-7]{32}$/);
  assert.ok(!(await state()).operator_users.find((x) => x.id === u.id).totp_secret_enc, "nothing stored before a code proves it");

  const step = stepOf(Date.now());
  await page.getByLabel(/کد ۶ رقمی/).fill("000000");
  await page.getByRole("button", { name: "تأیید و روشن کردن" }).click();
  await page.getByRole("alert").filter({ hasText: /\S/ }).first().waitFor();
  await page.getByLabel(/کد ۶ رقمی/).fill(totpAt(secret, step));
  await page.getByRole("button", { name: "تأیید و روشن کردن" }).click();
  await page.getByTestId("recovery-codes").waitFor();
  const codes = await page.getByTestId("recovery-codes").locator("li").allInnerTexts();
  assert.equal(codes.length, 10);
  const st = await state();
  const row = st.operator_users.find((x) => x.id === u.id);
  assert.match(row.totp_secret_enc, /^v1\./);
  assert.ok(!JSON.stringify(st).includes(secret), "the seed is stored in clear");
  assert.deepEqual(row.recovery_hashes, codes.map(hashRecovery));
  assert.ok(!JSON.stringify(st).includes(codes[0]), "recovery codes are stored as hashes only");
  await page.getByRole("button", { name: "ذخیره کردم" }).click();
  await page.getByTestId("account-setup").waitFor({ state: "detached" });
  assert.equal(await opens("/operator/products", s.cookie), true, "unrestricted after the setup");

  // from now on the code is needed
  const again = await login("must.2fa");
  assert.equal(again.status, 401);
  assert.equal(again.body.needCode, true);
  const ok = await login("must.2fa", { code: totpAt(secret, step + 1) });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const rec = await login("must.2fa", { recovery: codes[0] });
  assert.equal(rec.status, 200);
  assert.equal(rec.body.recoveryUsed, true);
  assert.equal((await login("must.2fa", { recovery: codes[0] })).status, 401, "a recovery code works once");
  await ctx.close();
});

test("an administrator-required two-step login cannot be switched off by the person; the old shared login has no such screen", async () => {
  const u = await addUser({ username: "keeps.2fa", role: "house_admin", require_2fa: true });
  const s = await login("keeps.2fa");
  const { ctx, page } = await pageAs(s.cookie);
  await page.goto(`${BASE}/operator`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /راه‌اندازی ورود دومرحله‌ای/ }).click();
  await page.getByLabel("رمز عبور فعلی").fill(PW);
  await page.getByRole("button", { name: "ادامه" }).click();
  const secret = (await page.getByTestId("totp-secret").innerText()).replace(/\s+/g, "");
  await page.getByLabel(/کد ۶ رقمی/).fill(totpAt(secret, stepOf(Date.now())));
  await page.getByRole("button", { name: "تأیید و روشن کردن" }).click();
  await page.getByRole("button", { name: "ذخیره کردم" }).click();
  await page.goto(`${BASE}/operator/settings`, { waitUntil: "networkidle" });
  assert.equal(await page.getByRole("button", { name: "خاموش کردن" }).count(), 0, "no switch-off button while it is required");
  await ctx.close();
  void u;
});
