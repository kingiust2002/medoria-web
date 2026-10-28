// The account store against an in-memory stand-in of the database (the real triggers are proven in
// operator-users-migration.test.mjs on PostgreSQL). Covers: login mode, constant-cost login and its generic failures, creating
// and changing accounts through authz, optimistic locking, session ending, the owner bootstrap, per-person second factor.
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createMemoryAdmin } from "./helpers/memoryAdmin.mjs";
import {
  usersMode, clearModeCache, verifyLogin, createUser, updateUser, setPassword, bootstrapOwner, acceptTotpStep, consumeRecoveryCode,
  resolveSessionUser, invalidateSessionUser, listUsers, rowToUser,
} from "../lib/operator/accounts.js";
import { hashPassword } from "../lib/operator/passwords.js";
import { encryptSecret, decryptSecret } from "../lib/operator/userSecrets.js";
import { randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { createClient } from "@supabase/supabase-js";

const KEY = randomBytes(32);
const PW = "Correct-horse-42";
const HASH = hashPassword(PW);

test("R4: the real Supabase client sends both full-list CAS predicates in the same recovery-code PATCH", async () => {
  const requests = [];
  const userId = "00000000-0000-4000-8000-000000000001";
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      requests.push({ method: req.method, url: new URL(req.url, "http://localhost"), body: JSON.parse(body) });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify([{ id: userId }]));
    });
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  try {
    const client = createClient(`http://127.0.0.1:${server.address().port}`, "review-local-dummy-key", { auth: { persistSession: false, autoRefreshToken: false } });
    const result = await consumeRecoveryCode(client, { userId, hash: "hash-A", hashes: ["hash-A", "hash-B"] });
    assert.equal(result.ok, true);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, "PATCH");
    assert.equal(requests[0].url.pathname, "/rest/v1/operator_users");
    assert.equal(requests[0].url.searchParams.get("id"), `eq.${userId}`);
    assert.deepEqual(requests[0].url.searchParams.getAll("recovery_hashes"), ["cs.{hash-A,hash-B}", "cd.{hash-A,hash-B}"]);
    assert.deepEqual(requests[0].body, { recovery_hashes: ["hash-B"] });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

function row(over = {}) {
  return {
    id: over.id || `u-${Math.random().toString(16).slice(2, 10)}`, username: "alice", display_name: "Alice", password_hash: HASH, status: "active", role: "viewer",
    houses: ["health"], allow_perms: [], deny_perms: [], approval: {}, require_2fa: false, totp_secret_enc: null, totp_last_step: 0, recovery_hashes: [],
    must_change_password: false, authz_version: 1, version: 1, created_by: null, created_at: "2026-01-01", updated_at: "2026-01-01", last_login_at: null,
    password_changed_at: "2026-01-01", ...over,
  };
}
// the database's own triggers, re-implemented for the stand-in: administered fields move `version`; the last owner stays
const ADMIN_FIELDS = ["username", "display_name", "status", "role", "houses", "allow_perms", "deny_perms", "approval", "require_2fa", "password_hash", "totp_secret_enc"];
const triggers = {
  beforeUpdate: {
    operator_users: (old, next, rows) => {
      if (old.role === "owner" && old.status === "active" && !(next.role === "owner" && next.status === "active" && next.houses.length === 2)
          && !rows.some((r) => r !== old && r.role === "owner" && r.status === "active" && r.houses.length === 2)) {
        return { code: "P0001", message: "the last active owner cannot be disabled, blocked, demoted or lose a house" };
      }
      if (ADMIN_FIELDS.some((f) => JSON.stringify(old[f]) !== JSON.stringify(next[f]))) next.version = old.version + 1;
      return null;
    },
  },
  unique: { operator_users: [["username"]] },
};
const db = (rows = [], sessions = []) => createMemoryAdmin({ operator_users: rows, operator_sessions: sessions }, { unique: triggers.unique, beforeUpdate: triggers.beforeUpdate, defaults: { operator_users: () => ({ id: `u-${Math.random().toString(16).slice(2, 10)}`, version: 1, authz_version: 1, status: "active", created_at: "x" }) } });

const boss = (o = {}) => rowToUser(row({ id: "00000000-0000-4000-8000-000000000001", username: "boss", role: "owner", houses: ["health", "beauty"], ...o }));

beforeEach(() => { clearModeCache(); invalidateSessionUser(); });

test("login mode: flag off → legacy; missing table → legacy; outage → unavailable; no owner → bootstrap; owner → users", async () => {
  assert.equal(await usersMode(db(), { enabled: false }), "legacy");
  const noTable = createMemoryAdmin({});
  assert.equal(await usersMode(noTable, { enabled: true }), "legacy");
  clearModeCache();
  const broken = db(); broken.fail = () => ({ code: "PGRST002", message: "Could not query the database for the schema cache" });
  assert.equal(await usersMode(broken, { enabled: true }), "unavailable", "an outage must never fall back to the weaker mode");
  clearModeCache();
  assert.equal(await usersMode(db([row()]), { enabled: true }), "bootstrap", "users exist but no active owner");
  clearModeCache();
  assert.equal(await usersMode(db([row({ role: "owner", houses: ["health", "beauty"] })]), { enabled: true }), "users");
  clearModeCache();
  assert.equal(await usersMode(null, { enabled: true }), "unavailable");
});

test("login: right password in the right house works; everything else fails alike", async () => {
  const d = db([row(), row({ id: "00000000-0000-4000-8000-000000000008", username: "off", status: "disabled" }), row({ id: "00000000-0000-4000-8000-000000000009", username: "blk", status: "blocked" }), row({ id: "00000000-0000-4000-8000-000000000010", username: "bea", houses: ["beauty"] })]);
  const ok = await verifyLogin(d, { username: "  ALICE ", password: PW, panel: "health" });
  assert.equal(ok.ok, true);
  assert.equal(ok.user.username, "alice");
  assert.ok(!("password_hash" in ok.user), "the hash never leaves the store inside the user");
  assert.deepEqual(await verifyLogin(d, { username: "alice", password: "wrong-password-1", panel: "health" }), { ok: false, reason: "password" });
  assert.deepEqual(await verifyLogin(d, { username: "nobody", password: PW, panel: "health" }), { ok: false, reason: "password" }, "unknown name looks like a wrong password");
  assert.equal((await verifyLogin(d, { username: "off", password: PW, panel: "health" })).reason, "inactive");
  assert.equal((await verifyLogin(d, { username: "blk", password: PW, panel: "health" })).reason, "inactive");
  assert.equal((await verifyLogin(d, { username: "alice", password: PW, panel: "beauty" })).reason, "house", "Health user in the Beauty panel");
  assert.equal((await verifyLogin(d, { username: "bea", password: PW, panel: "health" })).reason, "house");
  for (const bad of [{ username: "", password: PW }, { username: "alice", password: "" }, { username: 5, password: PW }, { username: "a'b", password: PW }, { username: "alice", password: null }]) {
    assert.equal((await verifyLogin(d, { ...bad, panel: "health" })).ok, false, JSON.stringify(bad));
  }
  const out = db([row()]); out.fail = () => ({ code: "XX000", message: "boom" });
  assert.equal((await verifyLogin(out, { username: "alice", password: PW, panel: "health" })).ok, false, "a database error is a refusal");
});

test("creating an account goes through authz, the password policy and uniqueness", async () => {
  const d = db([row(boss())]);
  d.tables.operator_users[0] = row({ id: "00000000-0000-4000-8000-000000000001", username: "boss", role: "owner", houses: ["health", "beauty"] });
  const actor = boss();
  const made = await createUser(d, { actor, input: { username: "Bob.K", displayName: "Bob K", password: "A-fine-password-9", role: "product_manager", houses: ["health"] } });
  assert.equal(made.ok, true, JSON.stringify(made));
  assert.equal(made.user.username, "bob.k");
  const stored = d.tables.operator_users.find((r) => r.username === "bob.k");
  assert.ok(stored.password_hash.startsWith("scrypt:") && !stored.password_hash.includes("A-fine"));
  assert.equal(stored.must_change_password, true);
  assert.equal(stored.created_by, "00000000-0000-4000-8000-000000000001");
  assert.equal((await createUser(d, { actor, input: { username: "bob.k", displayName: "Other", password: "A-fine-password-9", role: "viewer", houses: ["health"] } })).error, "usernameTaken");
  assert.equal((await createUser(d, { actor, input: { username: "x", displayName: "x", password: "A-fine-password-9", role: "viewer", houses: ["health"] } })).error, "badUsername");
  assert.equal((await createUser(d, { actor, input: { username: "carol", displayName: "  ", password: "A-fine-password-9", role: "viewer", houses: ["health"] } })).error, "badName");
  const weak = await createUser(d, { actor, input: { username: "carol", displayName: "Carol", password: "short", role: "viewer", houses: ["health"] } });
  assert.deepEqual([weak.error, weak.problem], ["password", "too_short"]);
  const nobody = await createUser(d, { actor: rowToUser(row({ id: "00000000-0000-4000-8000-000000000007", role: "viewer" })), input: { username: "dave", displayName: "Dave", password: "A-fine-password-9", role: "viewer", houses: ["health"] } });
  assert.equal(nobody.error, "notAllowed");
  const outage = db(); outage.fail = () => ({ code: "XX000", message: "x" });
  assert.equal((await createUser(outage, { actor, input: { username: "erin", displayName: "Erin", password: "A-fine-password-9", role: "viewer", houses: ["health"] } })).error, "unavailable");
});

test("a manager cannot create an owner, grant users.manage, or reach a house he is not in", async () => {
  const mgrRow = row({ id: "00000000-0000-4000-8000-000000000006", username: "mgr", role: "house_admin", houses: ["health"], allow_perms: ["users.manage"] });
  const d = db([mgrRow]);
  const actor = rowToUser(mgrRow);
  const mk = (extra) => createUser(d, { actor, input: { username: "zed", displayName: "Zed", password: "A-fine-password-9", ...extra } });
  assert.equal((await mk({ role: "owner", houses: ["health", "beauty"] })).error, "notAllowed");
  assert.equal((await mk({ role: "viewer", houses: ["beauty"] })).error, "notAllowed");
  assert.equal((await mk({ role: "viewer", houses: ["health"], allow: ["users.manage"] })).error, "notAllowed");
  assert.equal((await mk({ role: "viewer", houses: ["health"] })).ok, true);
});

test("changing an account: optimistic version, power change ends sessions, harmless change does not", async () => {
  const d = db([row({ id: "00000000-0000-4000-8000-000000000001", username: "boss", role: "owner", houses: ["health", "beauty"] }), row({ id: "00000000-0000-4000-8000-000000000003", username: "target" })],
    [{ sid: "s1", panel: "health", user_id: "00000000-0000-4000-8000-000000000003", revoked_at: null }, { sid: "s2", panel: "beauty", user_id: "00000000-0000-4000-8000-000000000003", revoked_at: null }, { sid: "s3", panel: "health", user_id: "00000000-0000-4000-8000-000000000001", revoked_at: null }]);
  const actor = boss();
  const stale = await updateUser(d, { actor, id: "00000000-0000-4000-8000-000000000003", change: { role: "quote_manager" }, expectedVersion: 7 });
  assert.equal(stale.error, "conflict");
  assert.equal(d.tables.operator_users.find((r) => r.id === "00000000-0000-4000-8000-000000000003").role, "viewer", "a stale form changes nothing");

  const name = await updateUser(d, { actor, id: "00000000-0000-4000-8000-000000000003", change: { displayName: " New Name " }, expectedVersion: 1 });
  assert.equal(name.ok, true);
  assert.equal(name.sessions, "none");
  assert.equal(d.tables.operator_sessions.filter((s) => s.revoked_at).length, 0);
  assert.equal(name.user.version, 2);

  const power = await updateUser(d, { actor, id: "00000000-0000-4000-8000-000000000003", change: { role: "quote_manager" }, expectedVersion: 2 });
  assert.equal(power.ok, true);
  assert.equal(power.sessions, "end_all");
  assert.equal(power.user.authzVersion, 2, "authz_version moves, so even an unrevoked cookie stops working");
  assert.deepEqual(d.tables.operator_sessions.filter((s) => s.revoked_at).map((s) => s.sid).sort(), ["s1", "s2"], "both houses' sessions of that person, nobody else's");
  assert.equal((await updateUser(d, { actor, id: "00000000-0000-4000-8000-000000000003", change: { role: "viewer" }, expectedVersion: 2 })).error, "conflict", "the same stale form again");
  assert.equal((await updateUser(d, { actor, id: "00000000-0000-4000-8000-000000000012", change: { role: "viewer" } })).error, "notFound");
  assert.equal((await updateUser(d, { actor, id: "00000000-0000-4000-8000-000000000003", change: {}, expectedVersion: 3 })).unchanged, true);
});

test("nobody changes himself; the last owner stays", async () => {
  const d = db([row({ id: "00000000-0000-4000-8000-000000000001", username: "boss", role: "owner", houses: ["health", "beauty"] }), row({ id: "00000000-0000-4000-8000-000000000002", username: "owner2", role: "owner", houses: ["health", "beauty"], status: "disabled" })]);
  const actor = boss();
  assert.equal((await updateUser(d, { actor, id: "00000000-0000-4000-8000-000000000001", change: { role: "viewer" } })).error, "notAllowed", "self-demotion");
  const other = rowToUser(d.tables.operator_users[1]);
  const actor2 = { ...other, status: "active" };
  const r = await updateUser(d, { actor: actor2, id: "00000000-0000-4000-8000-000000000001", change: { status: "disabled" } });
  assert.equal(r.error, "lastOwner");
  assert.equal(d.tables.operator_users[0].status, "active");
});

test("administrator password reset: policy, ends every session, forces a change; wrong version refused", async () => {
  const d = db([row({ id: "00000000-0000-4000-8000-000000000003", username: "target" })], [{ sid: "s1", panel: "health", user_id: "00000000-0000-4000-8000-000000000003", revoked_at: null }]);
  assert.equal((await setPassword(d, { userId: "00000000-0000-4000-8000-000000000003", password: "weak", forceChange: true })).problem, "too_short");
  const ok = await setPassword(d, { userId: "00000000-0000-4000-8000-000000000003", password: "A-brand-new-pass-77", forceChange: true });
  assert.equal(ok.ok, true);
  const r = d.tables.operator_users[0];
  assert.equal(r.must_change_password, true);
  assert.equal(r.authz_version, 2);
  assert.ok(d.tables.operator_sessions[0].revoked_at);
  assert.equal((await verifyLogin(d, { username: "target", password: "A-brand-new-pass-77", panel: "health" })).ok, true);
  assert.equal((await verifyLogin(d, { username: "target", password: PW, panel: "health" })).ok, false, "the old password is dead");
  assert.equal((await setPassword(d, { userId: "00000000-0000-4000-8000-000000000011", password: "A-brand-new-pass-77" })).error, "notFound");
});

test("owner bootstrap: both houses, keeps hash; seed only with a data key; second call is harmless", async () => {
  const d = db();
  const enc = (s) => encryptSecret(s, KEY);
  const refused = await bootstrapOwner(d, { username: "Admin", passwordHash: HASH, totpSecret: "JBSWY3DPEHPK3PXP", recoveryHashes: ["a".repeat(64)], encrypt: null });
  assert.equal(refused.error, "dataKeyMissing", "a bootstrap must not quietly drop the second factor");
  assert.equal(d.tables.operator_users.length, 0);
  const ok = await bootstrapOwner(d, { username: "Admin", passwordHash: HASH, totpSecret: "JBSWY3DPEHPK3PXP", recoveryHashes: ["a".repeat(64)], encrypt: enc });
  assert.equal(ok.ok, true);
  assert.deepEqual([ok.user.role, ok.user.houses, ok.user.username, ok.user.require2fa], ["owner", ["health", "beauty"], "admin", true]);
  const stored = d.tables.operator_users[0];
  assert.equal(stored.password_hash, HASH);
  assert.notEqual(stored.totp_secret_enc, "JBSWY3DPEHPK3PXP");
  assert.equal(decryptSecret(stored.totp_secret_enc, KEY), "JBSWY3DPEHPK3PXP");
  const again = await bootstrapOwner(d, { username: "admin", passwordHash: HASH, encrypt: enc });
  assert.equal(again.existed, true);
  assert.equal(d.tables.operator_users.length, 1);
  assert.equal((await bootstrapOwner(db(), { username: "a b", passwordHash: HASH })).error, "badUsername");
  const plain = await bootstrapOwner(db(), { username: "owner1", passwordHash: HASH });
  assert.equal(plain.user.require2fa, false, "no second factor on the old account → none invented");
});

test("two-step: a time step is accepted once per person; a recovery code works once", async () => {
  const d = db([row({ id: "00000000-0000-4000-8000-000000000004", username: "a1a" }), row({ id: "00000000-0000-4000-8000-000000000005", username: "b1b" })]);
  assert.equal((await acceptTotpStep(d, { userId: "00000000-0000-4000-8000-000000000004", step: 100 })).ok, true);
  assert.equal((await acceptTotpStep(d, { userId: "00000000-0000-4000-8000-000000000004", step: 100 })).reason, "replay");
  assert.equal((await acceptTotpStep(d, { userId: "00000000-0000-4000-8000-000000000004", step: 99 })).reason, "replay");
  assert.equal((await acceptTotpStep(d, { userId: "00000000-0000-4000-8000-000000000005", step: 100 })).ok, true, "another person's code in the same step is not a replay");
  assert.equal((await acceptTotpStep(d, { userId: "00000000-0000-4000-8000-000000000004", step: 101 })).ok, true);
  const hashes = ["h1", "h2"];
  d.tables.operator_users[0].recovery_hashes = [...hashes];
  assert.equal((await consumeRecoveryCode(d, { userId: "00000000-0000-4000-8000-000000000004", hash: "h1", hashes })).ok, true);
  assert.equal((await consumeRecoveryCode(d, { userId: "00000000-0000-4000-8000-000000000004", hash: "h1", hashes })).reason, "recovery_used", "same code twice, even from a stale list");
  assert.equal((await consumeRecoveryCode(d, { userId: "00000000-0000-4000-8000-000000000004", hash: "zz", hashes })).reason, "bad_code");
  assert.deepEqual(d.tables.operator_users[0].recovery_hashes, ["h2"]);
});

test("a session's person is re-read on the server: disabled, wrong house, or older authz_version = nobody", async () => {
  const d = db([row({ id: "00000000-0000-4000-8000-000000000004", username: "a1a", houses: ["health"], authz_version: 3 })]);
  const t = (over = {}) => resolveSessionUser(d, { panel: "health", uid: "00000000-0000-4000-8000-000000000004", av: 3, ...over });
  assert.equal((await t()).user.id, "00000000-0000-4000-8000-000000000004");
  assert.equal((await t({ panel: "beauty" })).user, null, "a Health user's cookie does not open Beauty");
  assert.equal((await t({ av: 2 })).user, null, "issued before the last change of power");
  assert.equal((await t({ uid: "00000000-0000-4000-8000-000000000011" })).user, null);
  assert.equal((await resolveSessionUser(d, { panel: "health", uid: 5, av: 3 })).user, null);
  d.tables.operator_users[0].status = "disabled";
  invalidateSessionUser("00000000-0000-4000-8000-000000000004");
  assert.equal((await t()).user, null, "disabled at once (after the short cache)");
  invalidateSessionUser();
  const out = db([row({ id: "00000000-0000-4000-8000-000000000004", username: "a1a" })]); out.fail = () => ({ code: "XX000", message: "x" });
  const r = await resolveSessionUser(out, { panel: "health", uid: "00000000-0000-4000-8000-000000000004", av: 1 });
  assert.deepEqual([r.ok, r.user], [false, null], "an outage is a refusal, never a pass");
});

test("listUsers never returns hashes or seeds", async () => {
  const d = db([row({ totp_secret_enc: "v1.x.y.z", recovery_hashes: ["h"] })]);
  const { users } = await listUsers(d);
  const flat = JSON.stringify(users);
  assert.ok(!/password_hash|scrypt|totp_secret|v1\.x/.test(flat));
  assert.equal(users[0].hasTotp, true);
  assert.equal(users[0].recoveryLeft, 1);
});

// ── review findings R3, R4, R5 (the stand-in database now returns ONLY the selected columns, like PostgREST) ─────────────────
const SEED = "encrypted-test-seed", RHASH = "recovery-hash-test";

test("R3: the second-factor state of a person is read from the real column projection and never carries the seed or a hash", async () => {
  const r = row({ id: "00000000-0000-4000-8000-000000000031", require_2fa: true, totp_secret_enc: SEED, recovery_hashes: [RHASH, "other-hash"] });
  const d = db([r]);
  const list = await listUsers(d);
  assert.equal(list.users[0].hasTotp, true, "listUsers: the seed exists in the database");
  assert.equal(list.users[0].recoveryLeft, 2);
  const { getUser } = await import("../lib/operator/accounts.js");
  const got = await getUser(d, r.id);
  assert.deepEqual([got.user.hasTotp, got.user.recoveryLeft, got.user.require2fa], [true, 2, true]);
  for (const user of [list.users[0], got.user]) {
    const text = JSON.stringify(user);
    for (const secret of [SEED, RHASH, "other-hash", HASH]) assert.ok(!text.includes(secret), "a secret value reached a user object");
    assert.ok(!("totp_secret_enc" in user) && !("recovery_hashes" in user) && !("password_hash" in user));
  }
  // …through the session path too: the person behind a signed session still has the second factor
  const s = await resolveSessionUser(d, { panel: "health", uid: r.id, av: 1 });
  assert.deepEqual([s.user.hasTotp, s.user.require2fa], [true, true]);
  // …and an account without a seed is reported as having none (the projection did not just turn everything on)
  const none = row({ id: "00000000-0000-4000-8000-000000000032", username: "bob", require_2fa: true });
  assert.equal((await getUser(db([none]), none.id)).user.hasTotp, false);
  // an update returns the same state
  const owner = row({ id: "00000000-0000-4000-8000-000000000033", username: "boss2", role: "owner", houses: ["health", "beauty"] });
  const d2 = db([owner, r]);
  const upd = await updateUser(d2, { actor: rowToUser(owner), id: r.id, change: { displayName: "Renamed" }, expectedVersion: 1 });
  assert.equal(upd.ok, true); assert.equal(upd.user.hasTotp, true);
});

test("R4: two requests that read the same recovery list cannot resurrect a spent code; each code works once, concurrently too", async () => {
  const id = "00000000-0000-4000-8000-000000000041";
  const original = ["hash-A", "hash-B"];
  const d = db([row({ id, recovery_hashes: [...original] })]);
  const first = await consumeRecoveryCode(d, { userId: id, hash: "hash-A", hashes: original });
  const second = await consumeRecoveryCode(d, { userId: id, hash: "hash-B", hashes: original });     // read the list before the first update
  assert.equal(first.ok, true);
  assert.equal(second.ok, true, "a different code is retried against the latest list");
  assert.deepEqual(d.tables.operator_users[0].recovery_hashes, [], "neither spent code is back");
  // both fired together
  const id2 = "00000000-0000-4000-8000-000000000042";
  const d2 = db([row({ id: id2, username: "bob", recovery_hashes: ["x1", "x2", "x3"] })]);
  const [a, b, c] = await Promise.all(["x1", "x2", "x3"].map((h) => consumeRecoveryCode(d2, { userId: id2, hash: h, hashes: ["x1", "x2", "x3"] })));
  assert.deepEqual([a.ok, b.ok, c.ok], [true, true, true]);
  assert.deepEqual(d2.tables.operator_users[0].recovery_hashes, []);
  // the SAME code twice at once: exactly one wins
  const id3 = "00000000-0000-4000-8000-000000000043";
  const d3 = db([row({ id: id3, username: "cy", recovery_hashes: ["y1", "y2"] })]);
  const rs = await Promise.all([1, 2].map(() => consumeRecoveryCode(d3, { userId: id3, hash: "y1", hashes: ["y1", "y2"] })));
  assert.equal(rs.filter((x) => x.ok).length, 1);
  assert.equal(rs.find((x) => !x.ok).reason, "recovery_used");
  assert.deepEqual(d3.tables.operator_users[0].recovery_hashes, ["y2"]);
  // a code that never existed, and a list that was regenerated meanwhile
  assert.equal((await consumeRecoveryCode(d3, { userId: id3, hash: "nope", hashes: ["y2"] })).reason, "bad_code");
  d3.tables.operator_users[0].recovery_hashes = ["n1", "n2"];
  assert.equal((await consumeRecoveryCode(d3, { userId: id3, hash: "y2", hashes: ["y2"] })).ok, false, "an old code does not work after the list was replaced");
});

test("R5: a manager cannot lift their own second-factor requirement, only an owner relaxes a requirement, and a change ends the person's sessions", async () => {
  const me = row({ id: "00000000-0000-4000-8000-000000000051", username: "mgr", role: "viewer", allow_perms: ["users.manage"], require_2fa: true, totp_secret_enc: SEED });
  const peer = row({ id: "00000000-0000-4000-8000-000000000052", username: "peer", role: "viewer", require_2fa: true });
  const owner = row({ id: "00000000-0000-4000-8000-000000000053", username: "own", role: "owner", houses: ["health", "beauty"] });
  const d = db([me, peer, owner]);
  const self = await updateUser(d, { actor: rowToUser(me), id: me.id, change: { require2fa: false }, expectedVersion: 1 });
  assert.equal(self.ok, false);
  assert.equal(d.tables.operator_users.find((u) => u.id === me.id).require_2fa, true);
  const other = await updateUser(d, { actor: rowToUser(me), id: peer.id, change: { require2fa: false }, expectedVersion: 1 });
  assert.equal(other.ok, false); assert.ok(other.codes.includes("require2fa_owner_only"));
  const byOwner = await updateUser(d, { actor: rowToUser(owner), id: peer.id, change: { require2fa: false }, expectedVersion: 1 });
  assert.equal(byOwner.ok, true);
  assert.equal(byOwner.sessions, "end_all", "the requirement changed: the person signs in again under the new rule");
  assert.equal(d.tables.operator_users.find((u) => u.id === peer.id).authz_version, 2);
});
