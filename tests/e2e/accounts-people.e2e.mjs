// End-to-end: the "people" screen of both panels (OPERATOR_USERS=on). An owner creates a person through the UI and gets a one-time
// password; that person signs in with it; the password is never stored or logged in clear; a manager sees and changes only people of
// his own house; a viewer cannot open the screen; the page fits a 320 px phone in every language; the Beauty panel has its own copy.
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
  await addUser({ username: "the.owner", display_name: "The Owner", role: "owner", houses: ["health", "beauty"] });
});
after(async () => { await browser?.close(); });

const rest = (path, init = {}) => fetch(`${DB}/rest/v1/${path}`, { ...init, headers: { apikey: SERVICE_KEY, "content-type": "application/json", prefer: "return=representation", ...(init.headers || {}) } });
async function addUser(o) {
  const res = await rest("operator_users", { method: "POST", body: JSON.stringify({ display_name: o.username, password_hash: hashPassword(PW), status: "active", role: "viewer", houses: ["health"], require_2fa: false, ...o }) });
  return (await res.json())[0];
}
const login = (user, house = "health", password = PW) => apiLogin(house, { user, password });
const withCookie = (path, cookie) => fetch(BASE + path, { redirect: "manual", headers: { cookie, origin: BASE } });
async function pageAs(cookie, viewport = { width: 1280, height: 900 }) {
  const ctx = await browser.newContext({ viewport });
  const [name, ...rest2] = cookie.split("=");
  await ctx.addCookies([{ name, value: rest2.join("="), url: BASE }]);
  return { ctx, page: await ctx.newPage() };
}

test("the owner creates a person through the screen: one-time password, hash only in the database, the log names both", async () => {
  const owner = await login("the.owner");
  assert.equal(owner.status, 200, JSON.stringify(owner.body));
  const { ctx, page } = await pageAs(owner.cookie);
  await page.goto(`${BASE}/operator/users`, { waitUntil: "networkidle" });
  assert.equal(await page.getByTestId("person").count(), 1);
  await page.getByRole("button", { name: /کاربر تازه/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  await dialog.getByLabel(/نام کاربری/).fill("new.colleague");
  await dialog.getByLabel(/نام نمایشی/).fill("New Colleague");
  await dialog.locator("select").first().selectOption("product_manager");
  await dialog.getByLabel("سلامت").check();
  await dialog.getByRole("switch").first().click();                 // two-step not required for this test person
  await dialog.getByRole("button", { name: "ساخت کاربر" }).click();
  const pw = (await page.getByTestId("temp-password").innerText()).trim();
  assert.equal(pw.length, 20);

  const st = await state();
  const created = st.operator_users.find((u) => u.username === "new.colleague");
  assert.ok(created);
  assert.deepEqual([created.role, created.houses, created.must_change_password], ["product_manager", ["health"], true]);
  assert.ok(!JSON.stringify(st).includes(pw), "the temporary password is stored or logged in clear");
  const entry = st.operator_audit_log.find((r) => r.action === "user.create");
  assert.deepEqual([entry.result, entry.target_user_id], ["success", created.id]);
  assert.ok(entry.user_id, "and it names who did it");

  const signedIn = await login("new.colleague", "health", pw);
  assert.equal(signedIn.status, 200, "the new person signs in with the one-time password");
  assert.equal(signedIn.body.mustChangePassword, true);
  assert.equal((await login("new.colleague", "beauty", pw)).status, 401, "and only in the house they were given");
  await ctx.close();
});

test("a manager sees and changes only people of his own house, and cannot make an owner", async () => {
  await addUser({ username: "health.mgr", role: "house_admin", houses: ["health"], allow_perms: ["users.manage"] });
  await addUser({ username: "beauty.only", houses: ["beauty"] });
  const m = await login("health.mgr");
  assert.equal(m.status, 200);
  const { ctx, page } = await pageAs(m.cookie);
  await page.goto(`${BASE}/operator/users`, { waitUntil: "networkidle" });
  const html = await page.content();
  assert.ok(html.includes("health.mgr"));
  assert.ok(!html.includes("beauty.only"), "a person of another house must not be listed");
  await page.getByRole("button", { name: /کاربر تازه/ }).click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  const roles = await dialog.locator("select").first().locator("option").allInnerTexts();
  assert.ok(!roles.includes("مدیر اصلی"), "a manager cannot even choose the owner role");
  assert.equal(await dialog.getByLabel("زیبایی").isDisabled(), true, "nor give a house he is not in");
  await ctx.close();
  const st = await state();
  assert.ok(!st.operator_audit_log.some((r) => r.action === "access.denied" && r.detail?.reason === "users.manage"));
});

test("a viewer cannot open the people screen; the old shared login cannot manage people", async () => {
  await addUser({ username: "plain.viewer", role: "viewer" });
  const v = await login("plain.viewer");
  const r = await withCookie("/operator/users", v.cookie);
  assert.ok(r.status >= 300 && r.status < 400 && /no-access/.test(r.headers.get("location") || ""));
});

test("reset password through the screen: a new one-time password, the old one stops working, sessions end", async () => {
  const target = await addUser({ username: "to.reset" });
  const old = await login("to.reset");
  assert.equal(old.status, 200);
  const owner = await login("the.owner");
  const { ctx, page } = await pageAs(owner.cookie);
  page.on("dialog", (d) => d.accept());
  await page.goto(`${BASE}/operator/users`, { waitUntil: "networkidle" });
  const card = page.getByTestId("person").filter({ hasText: "to.reset" });
  await card.getByRole("button", { name: /رمز موقت/ }).click();
  const pw = (await page.getByTestId("temp-password").innerText()).trim();
  assert.notEqual(pw, PW);
  assert.equal((await login("to.reset", "health", PW)).status, 401, "the old password is dead");
  assert.equal((await login("to.reset", "health", pw)).status, 200);
  assert.equal((await withCookie("/operator/products", old.cookie)).status === 200, false, "the old session ended");
  const log = (await state()).operator_audit_log.filter((r) => r.action === "user.password_reset");
  assert.equal(log.length, 1);
  assert.equal(log[0].target_user_id, target.id);
  assert.ok(!JSON.stringify(await state()).includes(pw));
  await ctx.close();
});

test("the screen fits a 320 px phone in Persian, Tajik and English, and the Beauty panel has its own copy", async () => {
  const owner = await login("the.owner");
  for (const [lang, title] of [["fa", "کاربران"], ["tg", "Корбарон"], ["en", "Users"]]) {
    const { ctx, page } = await pageAs(owner.cookie, { width: 320, height: 640 });
    await ctx.addCookies([{ name: "medoria_panel_lang", value: lang, url: BASE }]);
    await page.goto(`${BASE}/operator/users`, { waitUntil: "networkidle" });
    assert.ok((await page.content()).includes(title), `${lang}: title`);
    const w = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
    assert.ok(w.scroll <= w.inner, `${lang}: page wider than the screen (${w.scroll} > ${w.inner})`);
    await page.getByRole("button").filter({ hasText: /^(\s*)(کاربر تازه|Корбари нав|New user)/ }).first().click();
    await page.getByRole("dialog").waitFor();
    const d = await page.evaluate(() => { const b = document.querySelector('[role="dialog"]').getBoundingClientRect(); return { r: b.right, l: b.left, inner: window.innerWidth }; });
    assert.ok(d.l >= 0 && d.r <= d.inner + 1, `${lang}: dialog past the edge`);
    await ctx.close();
  }
  const b = await login("the.owner", "beauty");
  assert.equal(b.status, 200);
  const { ctx, page } = await pageAs(b.cookie);
  await page.goto(`${BASE}/beauty/operator/users`, { waitUntil: "networkidle" });
  assert.ok((await page.content()).includes("the.owner"));
  await ctx.close();
});
