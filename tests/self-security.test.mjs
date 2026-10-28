// "My password / my two-step login": every sensitive step re-asks the current password (and a code when two-step is on), the pending
// secret is an opaque expiring blob, recovery codes are shown once and stored as hashes, an administrator's requirement cannot be
// switched off, a restricted account can do nothing else, and the rate limit stops guessing.
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createMemoryAdmin } from "./helpers/memoryAdmin.mjs";
import { changeOwnPassword, startTwoStep, confirmTwoStep, disableTwoStep, newRecoveryCodes, reauthenticate } from "../lib/operator/selfSecurity.js";
import * as core from "../lib/operator/accountSecurityCore.js";
import { rowToUser, verifyLogin, invalidateSessionUser } from "../lib/operator/accounts.js";
import { hashPassword, verifyPasswordHash } from "../lib/operator/passwords.js";
import { encryptSecret, decryptSecret } from "../lib/operator/userSecrets.js";
import { totpAt, stepOf, hashRecovery } from "../lib/operator/security.js";
import { actorOf, restrictedReason, requireOperation } from "../lib/operator/access.js";

const KEY = randomBytes(32);
const PW = "Correct-horse-42";
const ID = "00000000-0000-4000-8000-000000000001";
const row = (o = {}) => ({
  id: ID, username: "alice", display_name: "Alice", password_hash: hashPassword(PW), status: "active", role: "owner", houses: ["health", "beauty"], allow_perms: [], deny_perms: [],
  approval: {}, require_2fa: false, totp_secret_enc: null, totp_last_step: 0, recovery_hashes: [], must_change_password: false, authz_version: 1, version: 1, ...o,
});
let db, logs;
const setup = (r, sessions = []) => {
  db = createMemoryAdmin({ operator_users: [r], operator_sessions: sessions });
  logs = [];
};
const user = () => rowToUser(db.tables.operator_users[0]);
const ctx = (over = {}) => ({ admin: db, session: { sid: "keep", uid: ID, user: user() }, key: KEY, limit: async () => true, audit: async (a, m) => { logs.push({ a, ...m }); }, ...over });
beforeEach(() => invalidateSessionUser());

test("change password: needs the current one, the policy, a matching repeat; ends OTHER sessions only; clears the 'must change' flag", async () => {
  setup(row({ must_change_password: true }), [{ sid: "keep", panel: "health", user_id: ID, revoked_at: null }, { sid: "other", panel: "beauty", user_id: ID, revoked_at: null }]);
  const base = { user: user(), sid: "keep", current: PW, next: "A-much-better-pass-88", repeat: "A-much-better-pass-88", key: KEY };
  assert.equal((await changeOwnPassword(db, { ...base, current: "wrong-wrong-1" })).error, "wrongPassword");
  assert.equal((await changeOwnPassword(db, { ...base, repeat: "different-pass-99" })).error, "mismatch");
  assert.equal((await changeOwnPassword(db, { ...base, next: PW, repeat: PW })).error, "same");
  const weak = await changeOwnPassword(db, { ...base, next: "short", repeat: "short" });
  assert.deepEqual([weak.error, weak.problem], ["password", "too_short"]);
  assert.equal(verifyPasswordHash(PW, db.tables.operator_users[0].password_hash), true, "nothing changed so far");

  const ok = await changeOwnPassword(db, base);
  assert.equal(ok.ok, true);
  assert.equal(db.tables.operator_users[0].must_change_password, false);
  assert.equal(verifyPasswordHash("A-much-better-pass-88", db.tables.operator_users[0].password_hash), true);
  assert.equal(db.tables.operator_sessions.find((s) => s.sid === "keep").revoked_at, null, "this session stays");
  assert.ok(db.tables.operator_sessions.find((s) => s.sid === "other").revoked_at, "every other one ends");
  assert.equal((await verifyLogin(db, { username: "alice", password: PW, panel: "health" })).ok, false);
});

test("two-step setup: start (password) → opaque blob → confirm with a real code → secret stored encrypted, recovery codes once", async () => {
  setup(row());
  assert.equal((await startTwoStep(db, { user: user(), current: "nope-nope-nope-1", key: KEY })).error, "wrongPassword");
  assert.equal((await startTwoStep(db, { user: user(), current: PW, key: null })).error, "noKey");
  const start = await startTwoStep(db, { user: user(), current: PW, key: KEY });
  assert.equal(start.ok, true);
  assert.match(start.otpauth, /^otpauth:\/\/totp\/Medoria/);
  assert.ok(!start.blob.includes(start.secret), "the blob does not show the secret");
  assert.equal(db.tables.operator_users[0].totp_secret_enc, null, "nothing is stored before the code is proven");

  const step = stepOf(Date.now());
  assert.equal((await confirmTwoStep(db, { user: user(), blob: start.blob, code: "000000", key: KEY })).error, "wrongCode");
  assert.equal((await confirmTwoStep(db, { user: user(), blob: "junk", code: totpAt(start.secret, step), key: KEY })).error, "expired");
  assert.equal((await confirmTwoStep(db, { user: user(), blob: start.blob, code: totpAt(start.secret, step), key: KEY, nowMs: Date.now() + 11 * 60_000 })).error, "expired", "ten minutes is the limit");
  const other = rowToUser(row({ id: "00000000-0000-4000-8000-000000000002" }));
  assert.equal((await confirmTwoStep(db, { user: other, blob: start.blob, code: totpAt(start.secret, step), key: KEY })).error, "expired", "somebody else's blob is useless");

  const done = await confirmTwoStep(db, { user: user(), blob: start.blob, code: totpAt(start.secret, step), key: KEY });
  assert.equal(done.ok, true);
  assert.equal(done.recoveryCodes.length, 10);
  const stored = db.tables.operator_users[0];
  assert.equal(decryptSecret(stored.totp_secret_enc, KEY), start.secret);
  assert.deepEqual(stored.recovery_hashes, done.recoveryCodes.map(hashRecovery));
  assert.ok(!JSON.stringify(stored).includes(done.recoveryCodes[0]), "codes are stored as hashes only");
  assert.equal((await confirmTwoStep(db, { user: user(), blob: start.blob, code: totpAt(start.secret, step), key: KEY })).error, "alreadyOn");
  assert.equal((await startTwoStep(db, { user: user(), current: PW, key: KEY })).error, "alreadyOn");
});

test("with two-step on: the code is asked again, a used step is refused, disable is blocked while required, recovery codes renew", async () => {
  const seed = "JBSWY3DPEHPK3PXP";
  setup(row({ totp_secret_enc: encryptSecret(seed, KEY), recovery_hashes: ["old"] }));
  const step = stepOf(Date.now());
  assert.equal((await reauthenticate(db, { userId: ID, password: PW, key: KEY })).error, "needCode");
  assert.equal((await reauthenticate(db, { userId: ID, password: PW, code: "123456", key: KEY })).error, "wrongCode");
  assert.equal((await reauthenticate(db, { userId: ID, password: "wrong-wrong-12", code: totpAt(seed, step), key: KEY })).error, "wrongPassword");
  assert.equal((await reauthenticate(db, { userId: ID, password: PW, code: totpAt(seed, step), key: KEY })).ok, true);
  assert.equal((await reauthenticate(db, { userId: ID, password: PW, code: totpAt(seed, step), key: KEY })).error, "wrongCode", "the same time step twice");

  const renewed = await newRecoveryCodes(db, { user: user(), current: PW, code: totpAt(seed, step + 1), key: KEY });
  assert.equal(renewed.ok, true);
  assert.deepEqual(db.tables.operator_users[0].recovery_hashes, renewed.recoveryCodes.map(hashRecovery), "the old codes are gone");

  // a fresh account for the disable cases (the ±1 step window of a code is small)
  setup(row({ totp_secret_enc: encryptSecret(seed, KEY), recovery_hashes: ["old"], require_2fa: true }));
  assert.equal((await disableTwoStep(db, { user: user(), current: PW, code: totpAt(seed, step), key: KEY })).error, "required");
  assert.ok(db.tables.operator_users[0].totp_secret_enc, "still on");
  db.tables.operator_users[0].require_2fa = false;
  assert.equal((await disableTwoStep(db, { user: user(), current: "wrong-wrong-12", code: totpAt(seed, step), key: KEY })).error, "wrongPassword");
  assert.equal((await disableTwoStep(db, { user: user(), current: PW, code: totpAt(seed, step), key: KEY })).ok, true);
  assert.equal(db.tables.operator_users[0].totp_secret_enc, null);
  assert.equal((await disableTwoStep(db, { user: user(), current: PW, key: KEY })).error, "notSetUp");
});

test("a restricted account (temporary password, or required two-step not set up) can do NOTHING but its own security screen", async () => {
  for (const [over, why] of [[{ must_change_password: true }, "password"], [{ require_2fa: true }, "twofa"]]) {
    setup(row(over));
    const s = { sid: "x", uid: ID, user: user() };
    assert.equal(restrictedReason(s), why);
    assert.equal(actorOf(s, "health"), null);
    assert.equal((await requireOperation({ session: s, panel: "health", operation: "products.content" })).denied, true, `${why}: even an owner`);
  }
  setup(row({ require_2fa: true, totp_secret_enc: "v1.a.b.c" }));
  assert.equal(restrictedReason({ user: user() }), null, "set up → free");
});

test("the account-security core: legacy sessions are refused, a rate-limited person is refused and logged, results are logged without secrets", async () => {
  setup(row());
  assert.match((await core.changeMyPassword({ ...ctx(), session: { sid: "x" } }, {})).error, /ورود قدیمی/);
  const limited = await core.changeMyPassword(ctx({ limit: async () => false }), { current: PW, next: "A-much-better-pass-88", repeat: "A-much-better-pass-88" });
  assert.equal(limited.ok, false);
  assert.deepEqual([logs[0].a, logs[0].result, logs[0].detail.reason], ["account.password_changed", "rejected", "rate_limited"]);
  const ok = await core.changeMyPassword(ctx(), { current: PW, next: "A-much-better-pass-88", repeat: "A-much-better-pass-88" });
  assert.equal(ok.ok, true);
  const bad = await core.changeMyPassword(ctx(), { current: "wrong-wrong-12", next: "Another-fine-pass-77", repeat: "Another-fine-pass-77" });
  assert.equal(bad.ok, false);
  assert.deepEqual(logs.map((l) => l.result), ["rejected", "success", "rejected"]);
  assert.ok(!JSON.stringify(logs).match(/A-much-better|Another-fine|wrong-wrong|Correct-horse/), "no password in the log");
});
