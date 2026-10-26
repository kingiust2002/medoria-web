// End-to-end, both panels (reproduced 2026-10-26):
//  1. a database / schema-cache OUTAGE (PostgREST PGRST002) must not open the panel: the session check used to read it
//     as "migration 30 not applied" and accepted every signed cookie. A table that is really missing keeps the old
//     behaviour; login is refused during an outage.
//  2. logout must not claim success while the server could not end the session: it answered 200 {ok:true}, cleared the
//     browser cookie, and a copy of the cookie kept opening the panel. Now: a failure is reported (HTTP 503), the cookie
//     is kept so a retry can still end the session, the UI shows the error, and a retry succeeds.
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { BASE, launch, state, resetDb, poll, apiLogin, freshCode, setFault, clearFaults } from "./helpers.mjs";
import { createHash, randomBytes } from "node:crypto";
import { signSession } from "../../lib/operator/session.js";
import { signSession as signBeautySession } from "../../lib/beauty/operator/session.js";
import { credentialsVersion } from "../../lib/operator/auth-version.mjs";

const SECRET = process.env.E2E_BEAUTY_TOTP_SECRET;
const PGRST002 = "Could not query the database for the schema cache. Retrying.";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
beforeEach(async () => { await clearFaults(); await resetDb(); });

const HOUSES = [
  { house: "health", panel: "/operator", logout: "/api/operator/logout", loginPage: "/login/health", cookieName: "medoria_operator" },
  { house: "beauty", panel: "/beauty/operator", logout: "/api/beauty-operator/logout", loginPage: "/login/beauty", cookieName: "medoria_beauty_operator" },
];
// A real, registered session WITHOUT going through the login form: the Beauty login needs a one-time code and the
// app limits second-factor attempts per 15 minutes for the whole process, which would couple these tests to the
// other security tests. The row goes into the registry exactly as the login route would write it.
async function signIn(h) {
  const sid = randomBytes(12).toString("hex");
  const res = await fetch(`${process.env.E2E_DB_URL}/rest/v1/operator_sessions`, {
    method: "POST", headers: { apikey: "service-test-key", "content-type": "application/json" },
    body: JSON.stringify({ sid, panel: h.house, expires_at: new Date(Date.now() + 3600e3).toISOString() }),
  });
  assert.equal(res.status, 201);
  if (h.house === "beauty") {
    process.env.BEAUTY_OPERATOR_SESSION_SECRET = process.env.E2E_BEAUTY_SESSION_SECRET;
    const ver = createHash("sha256").update(`${process.env.E2E_BEAUTY_USER}\u0000${process.env.E2E_BEAUTY_PASSWORD_HASH}`).digest("hex").slice(0, 16);
    return `medoria_beauty_operator=${await signBeautySession({ role: "beauty-admin", ver, sid })}`;
  }
  process.env.OPERATOR_SESSION_SECRET = process.env.E2E_HEALTH_SESSION_SECRET;
  return `medoria_operator=${await signSession({ role: "admin", ver: credentialsVersion({ OPERATOR_USERNAME: process.env.E2E_HEALTH_USER, OPERATOR_PASSWORD_HASH: process.env.E2E_HEALTH_PASSWORD_HASH }), sid })}`;
}
const withCookie = (path, cookie, init = {}) => fetch(BASE + path, { redirect: "manual", ...init, headers: { cookie, origin: BASE, ...(init.headers || {}) } });
const toLogin = (r) => r.status >= 300 && r.status < 400 && /\/login/.test(r.headers.get("location") || "");
const audit = async () => (await state()).operator_audit_log;

for (const h of HOUSES) {
  test(`${h.house}: a database/schema-cache outage does not open the panel; the panel opens again when it ends`, async () => {
    const cookie = await signIn(h);
    await setFault("operator_sessions", "GET", 503, "PGRST002", PGRST002);
    const during = await withCookie(h.panel, cookie);
    assert.ok(toLogin(during), `a real, signed session opened the ${h.house} panel during a PGRST002 outage (HTTP ${during.status})`);
    const quotes = await withCookie(`${h.panel}/quotes`, cookie);
    assert.ok(toLogin(quotes), `${h.panel}/quotes opened during the outage (HTTP ${quotes.status})`);
    await clearFaults();
    assert.equal((await withCookie(h.panel, cookie)).status, 200, "the same session works once the database answers");
  });

  test(`${h.house}: login is refused during an outage and allowed when the registry table does not exist yet`, async () => {
    await setFault("operator_sessions", "POST", 503, "PGRST002", PGRST002);
    const refused = h.house === "beauty" ? await apiLogin("beauty", { code: await freshCode(SECRET) }) : await apiLogin("health");
    assert.equal(refused.status, 503, `login must be refused while sessions cannot be recorded (${JSON.stringify(refused.body)})`);
    assert.equal(refused.cookie, "");
    await clearFaults();
    await setFault("operator_sessions", "POST", 404, "PGRST205", "Could not find the table 'public.operator_sessions' in the schema cache");
    const legacy = h.house === "beauty" ? await apiLogin("beauty", { code: await freshCode(SECRET) }) : await apiLogin("health");
    assert.equal(legacy.status, 200, "migration 30 not applied yet: the previous behaviour (login works)");
  });
}

test("health: a signed session the registry does not know is refused during an outage; with the table really missing the legacy behaviour holds", async () => {
  process.env.OPERATOR_SESSION_SECRET = process.env.E2E_HEALTH_SESSION_SECRET;
  process.env.OPERATOR_USERNAME = process.env.E2E_HEALTH_USER;
  process.env.OPERATOR_PASSWORD_HASH = process.env.E2E_HEALTH_PASSWORD_HASH;
  const token = await signSession({ role: "admin", ver: credentialsVersion(), sid: "0123456789abcdef01234567" });
  const cookie = `medoria_operator=${token}`;
  assert.ok(toLogin(await withCookie("/operator", cookie)), "unknown session, healthy database: refused");
  await setFault("operator_sessions", "GET", 503, "PGRST002", PGRST002);
  assert.ok(toLogin(await withCookie("/operator", cookie)), "unknown session during an outage: still refused (it used to open the panel)");
  await clearFaults();
  await setFault("operator_sessions", "GET", 404, "PGRST205", "Could not find the table 'public.operator_sessions' in the schema cache");
  assert.equal((await withCookie("/operator", cookie)).status, 200, "the registry table does not exist (migration 30 not applied): the legacy behaviour is kept");
});

for (const h of HOUSES) {
  test(`${h.house}: logout during a failing revocation is reported, keeps the cookie, and a retry ends the session`, async () => {
    const cookie = await signIn(h);
    assert.equal((await withCookie(h.panel, cookie)).status, 200);

    await setFault("operator_sessions", "PATCH", 500, "XX000");
    const failed = await withCookie(h.logout, cookie, { method: "POST" });
    assert.notEqual(failed.status, 200, "a logout that could not end the session must not answer 200");
    assert.ok(failed.status >= 500, `expected a server-error status, got ${failed.status}`);
    const body = await failed.json();
    assert.equal(body.ok, false);
    assert.match(String(body.error), /خروج/, "the answer says, in Persian, that the logout did not complete");
    const setCookie = (failed.headers.getSetCookie?.() || []).join(";");
    assert.ok(!new RegExp(`${h.cookieName}=;|${h.cookieName}=\\s*;|Max-Age=0`, "i").test(setCookie), `the cookie was cleared although the server session is still alive: ${setCookie}`);
    assert.ok(!(await audit()).some((r) => r.action === "auth.logout"), "a failed logout must not be logged as a logout");
    assert.ok((await audit()).some((r) => r.action === "auth.logout_failed" && r.panel === h.house), "the failure is logged");
    assert.equal((await withCookie(h.panel, cookie)).status, 200, "while revocation fails, the session still works (so the user must know)");

    await clearFaults();
    const retry = await withCookie(h.logout, cookie, { method: "POST" });
    assert.equal(retry.status, 200);
    assert.equal((await retry.json()).ok, true);
    assert.ok(toLogin(await withCookie(h.panel, cookie)), "after the successful retry the copied cookie no longer opens the panel");
    assert.equal((await audit()).filter((r) => r.action === "auth.logout" && r.panel === h.house).length, 1);
  });

  test(`${h.house}: the logout button shows the failure, stays in the panel, and a retry leaves`, async () => {
    const cookie = await signIn(h);
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const [name, value] = cookie.split("=");
    await ctx.addCookies([{ name, value, url: BASE }]);
    const page = await ctx.newPage();
    await page.goto(BASE + h.panel, { waitUntil: "load" });
    await page.getByRole("button", { name: "خروج", exact: true }).first().waitFor();

    await setFault("operator_sessions", "PATCH", 500, "XX000");
    await page.getByRole("button", { name: "خروج", exact: true }).first().click();
    const alert = page.getByRole("alert").filter({ hasText: /خروج/ });
    await alert.waitFor({ timeout: 10000 });
    assert.ok(!/\/login/.test(page.url()), `the page left the panel although the session was not ended (${page.url()})`);

    await clearFaults();
    await alert.getByRole("button", { name: "تلاش دوباره" }).click();
    await page.waitForURL(new RegExp(h.loginPage), { timeout: 15000 });
    await poll(async () => (await audit()).some((r) => r.action === "auth.logout" && r.panel === h.house), { label: "the logout to be logged" });
    assert.ok(toLogin(await withCookie(h.panel, cookie)), "the copied cookie is dead");
    await ctx.close();
  });
}
