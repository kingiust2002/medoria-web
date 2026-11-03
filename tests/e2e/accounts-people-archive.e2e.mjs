// End-to-end (real browser, fake database, OPERATOR_USERS=on): archiving a person and everything around it.
//   1  archive with an open session: later requests and a new login are refused, the account, the id and the name stay
//   2  the list: "current" by default, "archived" and "all" filters, an archived badge; the difference archive / block / disable is on screen
//   3  the activity page keeps the name and adds a small "archived" mark; the username of an archived person is not free
//   4  restore: the manager reviews the role, a fresh login works with the NEW permissions, the old session stays dead, a new password is demanded
//   5  open requests of the person: counted, moved on purpose to an active person; a request still in their hands shows the mark
//   6  nothing happens without the manager's password; and nothing happens when the history cannot be written
//   7  an owner recovers somebody who lost phone and codes (no second-factor bypass); a manager cannot
//   8  320 px in Persian, Tajik and English
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { BASE, launch, state, resetDb, apiLogin, clearFaults, setFault, measureInPage } from "./helpers.mjs";
import { SERVICE_KEY } from "./fakeDb.mjs";
import { hashPassword } from "../../lib/operator/passwords.js";

const DB = process.env.E2E_DB_URL;
const PW = "Strong-Passw0rd-77";
let browser;
before(async () => {
  browser = await launch(); await resetDb(); await clearFaults();
  await addUser({ username: "the.owner", display_name: "The Owner", role: "owner", houses: ["health", "beauty"] });
});
after(async () => { await clearFaults(); await browser?.close(); });

const rest = (path, init = {}) => fetch(`${DB}/rest/v1/${path}`, { ...init, headers: { apikey: SERVICE_KEY, "content-type": "application/json", prefer: "return=representation", ...(init.headers || {}) } });
async function addUser(o) {
  const res = await rest("operator_users", { method: "POST", body: JSON.stringify({ display_name: o.username, password_hash: hashPassword(PW), status: "active", role: "viewer", houses: ["health"], require_2fa: false, ...o }) });
  return (await res.json())[0];
}
const login = (user, house = "health", password = PW) => apiLogin(house, { user, password });
const withCookie = (path, cookie) => fetch(BASE + path, { redirect: "manual", headers: { cookie, origin: BASE } });
async function pageAs(cookie, viewport = { width: 1280, height: 900 }, lang) {
  const ctx = await browser.newContext({ viewport });
  const [name, ...rest2] = cookie.split("=");
  await ctx.addCookies([{ name, value: rest2.join("="), url: BASE }]);
  if (lang) await ctx.addCookies([{ name: "medoria_panel_lang", value: lang, url: BASE }]);
  return { ctx, page: await ctx.newPage() };
}
const card = (page, username) => page.getByTestId("person").filter({ hasText: username });
const userRow = async (username) => (await state()).operator_users.find((u) => u.username === username);
const openUsers = async (cookie, viewport, lang) => {
  const p = await pageAs(cookie, viewport, lang);
  await p.page.goto(`${BASE}/operator/users`, { waitUntil: "networkidle" });
  return p;
};

test("1+2+3: archive with an open session — the person is out at once, the record stays, the list and the history show it", async () => {
  const leaver = await addUser({ username: "leaver", display_name: "Layla Leaver", role: "product_manager" });
  const open = await login("leaver");
  assert.equal(open.status, 200);
  assert.equal((await withCookie("/operator/products", open.cookie)).status, 200, "the session works before");

  const owner = await login("the.owner");
  const { ctx, page } = await openUsers(owner.cookie);
  assert.equal(await page.getByTestId("people-filter").count(), 1);
  await card(page, "leaver").getByTestId("archive-open").click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  assert.equal(await dialog.getByTestId("status-help").count(), 1, "the difference archive / block / disable is on the dialog");
  const help = await dialog.getByTestId("status-help").innerText();
  assert.ok(/بایگانی/.test(help) && /مسدود/.test(help) && /غیرفعال/.test(help));
  await dialog.getByTestId("responsibilities-none").waitFor();
  await dialog.getByTestId("reauth-password").fill(PW);
  await dialog.getByTestId("dialog-confirm").click();
  await dialog.waitFor({ state: "hidden" });

  // out at once
  const after1 = await userRow("leaver");
  assert.deepEqual([after1.status, after1.id, after1.username, after1.display_name], ["archived", leaver.id, "leaver", "Layla Leaver"], "the account, id and name are kept");
  assert.ok(after1.archived_at && after1.archived_by);
  assert.notEqual((await withCookie("/operator/products", open.cookie)).status, 200, "the open session no longer works");
  assert.equal((await login("leaver")).status, 401, "and a new login is refused");
  assert.ok((await state()).operator_sessions.filter((s) => s.user_id === leaver.id).every((s) => s.revoked_at), "every session of the person is ended");

  // the list: current by default
  await page.reload({ waitUntil: "networkidle" });
  assert.equal(await card(page, "leaver").count(), 0, "not among the current people");
  await page.locator('[data-filter="archived"]').click();
  assert.equal(await card(page, "leaver").count(), 1);
  assert.equal(await card(page, "leaver").getByText("بایگانی‌شده").count() > 0, true, "the badge");
  assert.equal(await card(page, "leaver").getByTestId("archived-at").count(), 1);
  assert.equal(await card(page, "leaver").getByTestId("restore-open").count(), 1);
  assert.equal(await card(page, "leaver").getByTestId("archive-open").count(), 0);
  await page.locator('[data-filter="all"]').click();
  assert.equal(await page.getByTestId("person").count(), 2);

  // the history: attempt → success, names kept, a small mark next to the archived person
  const log = (await state()).operator_audit_log.filter((r) => r.action === "user.archive");
  assert.deepEqual(log.map((r) => r.result), ["attempt", "success"]);
  assert.ok(log.every((r) => r.target_user_id === leaver.id && r.user_id));
  await page.goto(`${BASE}/operator/activity`, { waitUntil: "networkidle" });
  const row = page.getByTestId("audit-row").filter({ has: page.locator('[data-action="user.archive"]') }).or(page.locator('[data-action="user.archive"]')).first();
  assert.ok((await row.innerText()).includes("Layla Leaver"), "the name stays in the history");
  assert.equal(await row.getByTestId("archived-mark").count(), 1);

  // the username is not free
  await page.goto(`${BASE}/operator/users`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /کاربر تازه/ }).click();
  const create = page.getByRole("dialog");
  await create.getByLabel(/نام کاربری/).fill("leaver");
  await create.getByLabel(/نام نمایشی/).fill("Somebody Else");
  await create.getByLabel("سلامت").check();
  await create.getByTestId("reauth-password").fill(PW);
  await create.getByTestId("person-submit").click();
  await create.getByTestId("access-summary").waitFor();
  await create.getByTestId("person-submit").click();
  await create.getByTestId("dialog-error").waitFor();
  assert.equal((await state()).operator_users.filter((u) => u.username === "leaver").length, 1);
  await ctx.close();
});

test("4: restore — the manager reviews the role, a fresh login follows the CURRENT permissions, the old session stays dead, a new password is demanded", async () => {
  const before1 = await userRow("leaver");
  const owner = await login("the.owner");
  const { ctx, page } = await openUsers(owner.cookie);
  await page.locator('[data-filter="archived"]').click();
  await card(page, "leaver").getByTestId("restore-open").click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  assert.equal(await dialog.getByTestId("restore-note").count(), 1);
  await dialog.locator("select").first().selectOption("viewer");                  // reviewed: fewer rights than before
  await dialog.getByTestId("reauth-password").fill(PW);
  await dialog.getByTestId("person-submit").click();
  await dialog.getByTestId("access-summary").waitFor();              // the review before the restore
  await dialog.getByTestId("person-submit").click();
  await dialog.waitFor({ state: "hidden" });
  const back = await userRow("leaver");
  assert.deepEqual([back.status, back.role, back.must_change_password], ["active", "viewer", true]);
  assert.ok(back.authz_version > before1.authz_version, "a session of the archived time can never match again");
  const fresh = await login("leaver");
  assert.equal(fresh.status, 200, "a fresh login works");
  assert.equal(fresh.body.mustChangePassword, true);
  const log = (await state()).operator_audit_log.filter((r) => r.action === "user.restore");
  assert.deepEqual(log.map((r) => r.result), ["attempt", "success"]);
  await ctx.close();
});

test("5: open requests — counted, moved on purpose to an active person, closed ones keep their history; a request left behind shows the mark", async () => {
  const helper = await addUser({ username: "helper", display_name: "Hana Helper", role: "quote_manager" });
  const gone = await addUser({ username: "gone", display_name: "Gul Gone", role: "quote_manager" });
  const quote = (name, status, who) => ({ name, status, phone: "+992900000010", preferred_contact: "whatsapp", language: "en", message: "", product_name: "Gloves", created_at: "2026-10-20T10:00:00.000Z", assigned_to: who.display_name, assigned_user_id: who.id });
  await rest("quote_requests", { method: "POST", body: JSON.stringify([quote("Open One", "new", gone), quote("Open Two", "in_progress", gone), quote("Closed One", "closed", gone)]) });
  const owner = await login("the.owner");
  const { ctx, page } = await openUsers(owner.cookie);
  await card(page, "gone").getByTestId("archive-open").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByTestId("responsibilities-count").waitFor();
  assert.ok(/2/.test(await dialog.getByTestId("responsibilities-count").innerText()), "two open requests are counted (the closed one is not)");
  await dialog.getByTestId("transfer-to").selectOption(helper.id);
  await dialog.getByTestId("reauth-password").fill(PW);
  await dialog.getByTestId("dialog-confirm").click();
  await dialog.waitFor({ state: "hidden" });
  const quotes = (await state()).quote_requests;
  const by = (n) => quotes.find((q) => q.name === n);
  assert.deepEqual([by("Open One").assigned_user_id, by("Open Two").assigned_user_id, by("Closed One").assigned_user_id], [helper.id, helper.id, gone.id], "open requests moved; the closed one keeps its history");
  assert.deepEqual([by("Open One").assigned_to, by("Closed One").assigned_to], ["Hana Helper", "Gul Gone"]);
  // a request left in the hands of an archived person: name kept, small mark
  await page.goto(`${BASE}/operator/quotes?tab=all`, { waitUntil: "networkidle" });
  const row = page.getByText("Closed One").first();
  await row.waitFor();
  assert.equal(await page.getByTestId("badge-assignee-archived").count() > 0, true, "the request still held by the archived person is marked");
  await ctx.close();
});

test("6: without the manager's password nothing happens — and when the history cannot be written, nothing happens either", async () => {
  await addUser({ username: "keep.me", display_name: "Keep Me", role: "viewer" });
  const owner = await login("the.owner");
  const { ctx, page } = await openUsers(owner.cookie);
  await card(page, "keep.me").getByTestId("archive-open").click();
  let dialog = page.getByRole("dialog");
  await dialog.waitFor();
  assert.equal(await dialog.getByTestId("dialog-confirm").isDisabled(), true, "the button waits for the password");
  await dialog.getByTestId("reauth-password").fill("wrong-password-1");
  await dialog.getByTestId("dialog-confirm").click();
  await dialog.getByTestId("dialog-error").waitFor();
  assert.equal((await userRow("keep.me")).status, "active", "a wrong password changes nothing");
  assert.ok((await state()).operator_audit_log.some((r) => r.action === "user.reauth_failed"), "…and is on record");
  // the history is down: the right password is not enough
  await setFault("operator_audit_log", "POST", 500, "XX000", "log is down");
  await dialog.getByTestId("reauth-password").fill(PW);
  await dialog.getByTestId("dialog-confirm").click();
  await dialog.getByTestId("dialog-error").waitFor();
  assert.equal((await userRow("keep.me")).status, "active", "no history entry, no change");
  await clearFaults();
  await ctx.close();
});

test("7: an owner recovers a person who lost phone and codes — no bypass; a manager has no such button", async () => {
  await addUser({ username: "lost.phone", display_name: "Lina Lost", role: "product_manager", require_2fa: true, totp_secret_enc: "v1.not.a.seed", recovery_hashes: ["a".repeat(64)] });
  await addUser({ username: "the.manager", role: "house_admin", houses: ["health"], allow_perms: ["users.manage"] });
  const mgr = await login("the.manager");
  const m = await openUsers(mgr.cookie);
  assert.equal(await card(m.page, "lost.phone").getByTestId("reset2fa-open").count(), 0, "a manager cannot recover a second factor");
  await m.ctx.close();

  const owner = await login("the.owner");
  const { ctx, page } = await openUsers(owner.cookie);
  await card(page, "lost.phone").getByTestId("reset2fa-open").click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await dialog.getByTestId("reauth-password").fill(PW);
  await dialog.getByTestId("dialog-confirm").click();
  const pw = (await page.getByTestId("temp-password").innerText()).trim();
  const u = await userRow("lost.phone");
  assert.deepEqual([u.totp_secret_enc, u.recovery_hashes, u.require_2fa, u.must_change_password], [null, [], true, true]);
  assert.equal((await login("lost.phone", "health", PW)).status, 401, "the old password is dead too");
  const next = await login("lost.phone", "health", pw);
  assert.equal(next.status, 200);
  assert.deepEqual([next.body.mustChangePassword, next.body.mustSetUpTwoStep], [true, true], "the new sign-in is restricted until a NEW second factor exists");
  const restricted = await (await withCookie("/operator/products", next.cookie)).text();
  assert.ok(restricted.includes('data-testid="account-setup"') && !restricted.includes("E2E Product"), "only the set-up screen opens before that, no catalogue");
  assert.ok(!JSON.stringify(await state()).includes(pw));
  await ctx.close();
});

test("8: the screen, the archive dialog and the restore dialog fit a 320 px phone in Persian, Tajik and English", async () => {
  const owner = await login("the.owner");
  for (const lang of ["fa", "tg", "en"]) {
    const { ctx, page } = await openUsers(owner.cookie, { width: 320, height: 640 }, lang);
    const wide = async (label) => {
      const m = await page.evaluate(measureInPage);          // every element, not just the page: the clip on <html> must not hide a cut-off button
      assert.equal(m.count, 0, `${lang} ${label}: ${JSON.stringify(m.offenders)}`);
    };
    await wide("list");
    await page.locator('[data-filter="all"]').click();
    await wide("all");
    await page.locator('[data-testid="archive-open"]').first().click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    const box = async (label) => {
      const d = await page.evaluate(() => { const b = document.querySelector('[role="dialog"]').getBoundingClientRect(); const over = [...document.querySelectorAll('[role="dialog"] *')].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1).length; return { r: b.right, l: b.left, inner: window.innerWidth, over }; });
      assert.ok(d.l >= 0 && d.r <= d.inner + 1 && d.over === 0, `${lang} ${label}: dialog content past the edge ${JSON.stringify(d)}`);
    };
    await box("archive dialog");
    await wide("archive dialog (whole page)");
    await dialog.getByRole("button").first().click();                       // close
    await page.locator('[data-filter="archived"]').click();
    if (await page.getByTestId("restore-open").count()) {
      await page.getByTestId("restore-open").first().click();
      await page.getByRole("dialog").waitFor();
      await box("restore dialog");
      await wide("restore dialog (whole page)");
    }
    await ctx.close();
  }
});
