// End-to-end: personal operator accounts (OPERATOR_USERS=on, migration 34 in the fake database). The runner starts the app for this
// file with the feature on and a data key. Proves: the safe owner bootstrap from the old env account, that old env cookies die once
// an owner exists, personal login (generic failures, houses kept apart), a disabled or changed account loses its cookie, the
// person's own second factor (replay, recovery code once), and that the log says WHO did it.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { BASE, launch, state, resetDb, poll, apiLogin, clearFaults } from "./helpers.mjs";
import { SERVICE_KEY } from "./fakeDb.mjs";
import { signSession } from "../../lib/operator/session.js";
import { credentialsVersion } from "../../lib/operator/auth-version.mjs";
import { hashPassword } from "../../lib/operator/passwords.js";
import { encryptSecret } from "../../lib/operator/userSecrets.js";
import { generateTotpSecret, generateRecoveryCodes, totpAt, stepOf } from "../../lib/operator/security.js";

const DB = process.env.E2E_DB_URL;
const DATA_KEY = Buffer.from(process.env.E2E_DATA_KEY, "base64");
const PW = "Strong-Passw0rd-77";

let browser;
before(async () => { browser = await launch(); await resetDb(); await clearFaults(); });
after(async () => { await browser?.close(); });

const rest = (path, init = {}) => fetch(`${DB}/rest/v1/${path}`, { ...init, headers: { apikey: SERVICE_KEY, "content-type": "application/json", prefer: "return=representation", ...(init.headers || {}) } });
const addUser = async (o) => (await (await rest("operator_users", { method: "POST", body: JSON.stringify({
  display_name: o.username, password_hash: hashPassword(PW), status: "active", role: "viewer", houses: ["health"], require_2fa: false, ...o,
}) })).json())[0];
const patchUser = (id, patch) => rest(`operator_users?id=eq.${id}`, { method: "PATCH", body: JSON.stringify(patch) });
const withCookie = (path, cookie) => fetch(BASE + path, { redirect: "manual", headers: { cookie, origin: BASE } });
const opens = async (path, cookie) => (await withCookie(path, cookie)).status === 200;
const login = (house, user, password = PW, extra = {}) => apiLogin(house, { user, password, ...extra });
const cookiePayload = (cookie) => JSON.parse(Buffer.from(cookie.split("=")[1].split(".")[0], "base64url").toString("utf8"));
const rows = async (t) => (await state())[t] || [];

test("bootstrap: before any owner the old env account still works; its first login makes it the first owner of both houses", async () => {
  // an env-account session issued before personal accounts exist
  process.env.OPERATOR_SESSION_SECRET = process.env.E2E_HEALTH_SESSION_SECRET;
  process.env.OPERATOR_USERNAME = process.env.E2E_HEALTH_USER;
  process.env.OPERATOR_PASSWORD_HASH = process.env.E2E_HEALTH_PASSWORD_HASH;
  const sid = "aaaaaaaaaaaaaaaaaaaaaaaa";
  await rest("operator_sessions", { method: "POST", body: JSON.stringify({ sid, panel: "health", expires_at: new Date(Date.now() + 3600e3).toISOString() }) });
  const legacy = `medoria_operator=${await signSession({ role: "admin", ver: credentialsVersion(), sid })}`;
  assert.equal(await opens("/operator", legacy), true, "bootstrap mode: the old session still opens the panel");

  const r = await apiLogin("health");
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const users = await rows("operator_users");
  assert.equal(users.length, 1);
  assert.deepEqual([users[0].role, users[0].houses, users[0].username, users[0].status], ["owner", ["health", "beauty"], process.env.E2E_HEALTH_USER, "active"]);
  assert.equal(users[0].password_hash, process.env.E2E_HEALTH_PASSWORD_HASH, "the password keeps working: same hash");
  assert.equal(users[0].require_2fa, false, "Health had no second factor: none is invented");
  assert.equal(cookiePayload(r.cookie).uid, users[0].id);
  assert.equal(await opens("/operator", r.cookie), true);
  assert.equal(await opens("/operator/settings", r.cookie), true);

  const log = await rows("operator_audit_log");
  assert.ok(log.some((x) => x.action === "auth.bootstrap_owner" && x.user_id === users[0].id && x.result === "success"));
  const login1 = log.find((x) => x.action === "auth.login");
  assert.equal(login1.user_id, users[0].id, "the log names the person");

  assert.equal(await opens("/operator", legacy), false, "an owner exists: the old env session is dead");
  assert.equal(await opens("/operator", "medoria_operator=junk"), false);
});

test("the bootstrapped owner logs in with the old password; a wrong password and an unknown name get the same answer", async () => {
  const ok = await login("health", process.env.E2E_HEALTH_USER, process.env.E2E_HEALTH_PASSWORD);
  assert.equal(ok.status, 200);
  const wrong = await login("health", process.env.E2E_HEALTH_USER, "wrong-password-123");
  const unknown = await login("health", "nobody.here", PW);
  assert.equal(wrong.status, 401);
  assert.equal(unknown.status, 401);
  assert.deepEqual(wrong.body, unknown.body, "no hint whether the name exists");
  assert.equal(wrong.cookie, "");
  const failed = (await rows("operator_audit_log")).filter((x) => x.action === "auth.login_failed");
  assert.ok(failed.every((x) => x.result === "failure"));
  const everything = JSON.stringify(await state());
  assert.ok(!everything.includes("wrong-password-123") && !everything.includes(PW), "a typed password was stored");
});

test("houses stay apart: a Health account cannot log in to Beauty, nor use its cookie there", async () => {
  const u = await addUser({ username: "health.only", houses: ["health"] });
  const inHealth = await login("health", "health.only");
  assert.equal(inHealth.status, 200);
  const inBeauty = await login("beauty", "health.only");
  assert.equal(inBeauty.status, 401, "Beauty login for a Health account");
  assert.ok((await rows("operator_audit_log")).some((x) => x.user_id === u.id && x.detail?.reason === "house"));
  assert.equal(await opens("/operator", inHealth.cookie), true);
  // the same cookie value presented to the Beauty panel (a different cookie name and role) opens nothing
  const asBeauty = inHealth.cookie.replace("medoria_operator=", "medoria_beauty_operator=");
  assert.equal(await opens("/beauty/operator", asBeauty), false);
});

test("a disabled account loses its cookie at once; so does a changed one; a blocked one cannot log in", async () => {
  const a = await addUser({ username: "to.disable" });
  const s = await login("health", "to.disable");
  assert.equal(await opens("/operator", s.cookie), true);
  await patchUser(a.id, { status: "disabled" });
  await poll(async () => !(await opens("/operator", s.cookie)), { label: "the disabled account's cookie to stop working", timeout: 8000, interval: 300 });
  assert.equal((await login("health", "to.disable")).status, 401);

  const b = await addUser({ username: "to.change" });
  const s2 = await login("health", "to.change");
  assert.equal(await opens("/operator", s2.cookie), true);
  await patchUser(b.id, { role: "quote_manager", authz_version: 2 });
  await poll(async () => !(await opens("/operator", s2.cookie)), { label: "the cookie to die after a change of power", timeout: 8000, interval: 300 });

  await addUser({ username: "is.blocked", status: "blocked" });
  assert.equal((await login("health", "is.blocked")).status, 401);
});

test("an account that must use a second factor but has none is refused for now, with an honest message", async () => {
  await addUser({ username: "needs.2fa", require_2fa: true });
  const r = await login("health", "needs.2fa");
  assert.equal(r.status, 403);
  assert.equal(r.cookie, "");
  assert.ok((await rows("operator_audit_log")).some((x) => x.detail?.reason === "2fa_not_enrolled"));
});

test("a person's own second factor: code needed, replay refused, recovery code once; nobody else is affected", async () => {
  const seed = generateTotpSecret();
  const rec = generateRecoveryCodes(2);
  const u = await addUser({ username: "with.2fa", require_2fa: true, totp_secret_enc: encryptSecret(seed, DATA_KEY), recovery_hashes: rec.map((c) => c.hash) });
  const noCode = await login("health", "with.2fa");
  assert.equal(noCode.status, 401);
  assert.equal(noCode.body.needCode, true);
  assert.equal(noCode.cookie, "");

  const bad = await login("health", "with.2fa", PW, { code: "000000" });
  assert.equal(bad.status, 401);

  const step = stepOf(Date.now()) + 1;                                  // inside the ±1 window, later than anything used
  const ok = await login("health", "with.2fa", PW, { code: totpAt(seed, step) });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(await opens("/operator", ok.cookie), true);
  const replay = await login("health", "with.2fa", PW, { code: totpAt(seed, step) });
  assert.equal(replay.status, 401, "the same code twice");

  const r1 = await login("health", "with.2fa", PW, { recovery: rec[0].code });
  assert.equal(r1.status, 200);
  assert.equal(r1.body.recoveryUsed, true);
  const r1b = await login("health", "with.2fa", PW, { recovery: rec[0].code });
  assert.equal(r1b.status, 401, "a recovery code works once");
  const stored = (await rows("operator_users")).find((x) => x.id === u.id);
  assert.deepEqual(stored.recovery_hashes, [rec[1].hash]);

  // another person logging in during the same time step is not a replay
  const other = generateTotpSecret();
  await addUser({ username: "also.2fa", require_2fa: true, totp_secret_enc: encryptSecret(other, DATA_KEY) });
  const o = await login("health", "also.2fa", PW, { code: totpAt(other, step) });
  assert.equal(o.status, 200, "a second person, the same time step");

  const everything = JSON.stringify((await rows("operator_audit_log")));
  assert.ok(![seed, other, ...rec.map((c) => c.code)].some((x) => everything.includes(x)), "a seed or code reached the log");
});

test("the seed is stored encrypted, never in clear", async () => {
  const stored = JSON.stringify(await rows("operator_users"));
  assert.match(stored, /"totp_secret_enc":"v1\./);
  assert.ok(!/JBSWY3DP/.test(stored));
});

test("an outage while checking the person refuses the session (no fail-open)", async () => {
  const u = await addUser({ username: "outage.user" });
  const s = await login("health", "outage.user");
  assert.equal(await opens("/operator", s.cookie), true);
  await fetch(`${DB}/__fault`, { method: "POST", body: JSON.stringify({ table: "operator_users", method: "GET", status: 503, code: "PGRST002", message: "Could not query the database for the schema cache" }) });
  await new Promise((r) => setTimeout(r, 2500));                       // the short per-person cache
  assert.equal(await opens("/operator", s.cookie), false, "the person cannot be read: nobody gets in");
  const during = await login("health", "outage.user");
  assert.notEqual(during.status, 200);
  await clearFaults();
  assert.equal(await opens("/operator", s.cookie), true, "and it works again once the database answers");
  void u;
});
