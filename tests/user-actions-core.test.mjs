// The people screen's server logic (userActionsCore.js + userAdmin.js) against an in-memory database and the real authz rules:
// visibility, creation with a one-time password, changes (power change ends sessions), refusals are logged as `rejected`, nobody
// resets his own password here, and the log line names who did it to whom — without ever containing a password.
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createMemoryAdmin } from "./helpers/memoryAdmin.mjs";
import { createPerson, updatePerson, resetPersonPassword, endPersonSessions, listPeople } from "../lib/operator/userActionsCore.js";
import { visibleUsers, parsePatterns, cleanApproval, cleanHouses, generateTempPassword, messageFor } from "../lib/operator/userAdmin.js";
import { OPERATION_LABELS, OPERATION_CHOICES } from "../lib/operator/userLabels.js";
import { rowToUser, verifyLogin, invalidateSessionUser } from "../lib/operator/accounts.js";
import { passwordProblem, hashPassword } from "../lib/operator/passwords.js";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const HASH = hashPassword("Correct-horse-42");
const row = (n, o = {}) => ({
  id: id(n), username: `user${n}`, display_name: `User ${n}`, password_hash: HASH, status: "active", role: "viewer", houses: ["health"], allow_perms: [], deny_perms: [], approval: {},
  require_2fa: true, totp_secret_enc: null, recovery_hashes: [], must_change_password: false, authz_version: 1, version: 1, created_at: "2026-01-01", ...o,
});
const ADMIN_FIELDS = ["username", "display_name", "status", "role", "houses", "allow_perms", "deny_perms", "approval", "require_2fa", "password_hash"];
const beforeUpdate = {
  operator_users: (old, next, rows) => {
    if (old.role === "owner" && old.status === "active" && !(next.role === "owner" && next.status === "active" && next.houses.length === 2)
        && !rows.some((r) => r !== old && r.role === "owner" && r.status === "active" && r.houses.length === 2)) return { code: "P0001", message: "the last active owner cannot be disabled, blocked, demoted or lose a house" };
    if (ADMIN_FIELDS.some((f) => JSON.stringify(old[f]) !== JSON.stringify(next[f]))) next.version = old.version + 1;
    return null;
  },
};
let db, logs;
const setup = (rows, sessions = []) => {
  db = createMemoryAdmin({ operator_users: rows, operator_sessions: sessions }, { unique: { operator_users: [["username"]] }, beforeUpdate, defaults: { operator_users: () => ({ id: `00000000-0000-4000-8000-${String(Math.floor(Math.random() * 1e12)).padStart(12, "0")}`, version: 1, authz_version: 1, status: "active" }) } });
  logs = [];
};
const ctx = (actorRow) => ({ admin: db, session: { sid: "s", uid: actorRow.id, user: rowToUser(actorRow) }, panel: "health", audit: async (action, meta) => { logs.push({ action, ...meta }); } });
const owner = row(1, { username: "boss", role: "owner", houses: ["health", "beauty"] });
const manager = row(2, { username: "mgr", role: "house_admin", houses: ["health"], allow_perms: ["users.manage"] });
beforeEach(() => invalidateSessionUser());

test("who sees whom: an owner sees everybody, others only people who share a house", () => {
  const all = [row(1, { role: "owner", houses: ["health", "beauty"] }), row(2, { houses: ["health"] }), row(3, { houses: ["beauty"] }), row(4, { houses: ["health", "beauty"] })].map(rowToUser);
  assert.equal(visibleUsers(all[0], all).length, 4);
  assert.deepEqual(visibleUsers(all[1], all).map((u) => u.username), ["user1", "user2", "user4"], "an owner shares every house with everybody");
  assert.deepEqual(visibleUsers(all[2], all).map((u) => u.username), ["user1", "user3", "user4"]);
  assert.deepEqual(visibleUsers(null, all), []);
});

test("typed permission lists: trimmed, de-duplicated, invalid lines reported not used", () => {
  const r = parsePatterns(" Health.Quotes.Edit \nhealth.quotes.edit\nbeauty.*, nonsense.thing\n\n");
  assert.deepEqual(r.patterns, ["health.quotes.edit", "beauty.*"]);
  assert.deepEqual(r.invalid, ["nonsense.thing"]);
  assert.deepEqual(cleanHouses(["beauty", "mars", "health"]), ["health", "beauty"]);
  assert.deepEqual(cleanApproval({ health: ["products.price", "bad.op", "products.price"], mars: ["x"], beauty: "no" }), { health: ["products.price"] });
});

test("temporary passwords pass the policy and differ every time; every operation has a label", () => {
  const seen = new Set();
  for (let i = 0; i < 30; i++) { const p = generateTempPassword(); assert.equal(passwordProblem(p), null); assert.equal(p.length, 20); seen.add(p); }
  assert.equal(seen.size, 30);
  for (const op of OPERATION_CHOICES) assert.ok(OPERATION_LABELS[op], `no label for ${op}`);
});

test("create: the person can sign in with the one-time password, which is never stored or logged; the log names both", async () => {
  setup([owner]);
  const res = await createPerson(ctx(owner), { username: "Alice", displayName: "Alice A", role: "product_manager", houses: ["health"], require2fa: false });
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.equal(res.user.username, "alice");
  assert.equal(passwordProblem(res.tempPassword), null);
  assert.equal((await verifyLogin(db, { username: "alice", password: res.tempPassword, panel: "health" })).ok, true);
  assert.equal(db.tables.operator_users.find((r) => r.username === "alice").must_change_password, true);
  const l = logs.find((x) => x.action === "user.create");
  assert.deepEqual([l.result, l.targetUserId, l.detail.role], ["success", res.user.id, "product_manager"]);
  assert.ok(!JSON.stringify(logs).includes(res.tempPassword), "the password reached the log");
});

test("create: refusals are logged as rejected with a code, and nothing is created", async () => {
  setup([owner, manager]);
  const c = ctx(manager);
  const ownerTry = await createPerson(c, { username: "newboss", displayName: "New Boss", role: "owner", houses: ["health", "beauty"] });
  assert.equal(ownerTry.ok, false);
  const beautyTry = await createPerson(c, { username: "bea", displayName: "Bea", role: "viewer", houses: ["beauty"] });
  assert.equal(beautyTry.ok, false);
  const badList = await createPerson(c, { username: "carl", displayName: "Carl", role: "viewer", houses: ["health"], allowText: "health.nothing.here" });
  assert.equal(badList.ok, false);
  assert.deepEqual(badList.invalid, ["health.nothing.here"]);
  assert.equal(db.tables.operator_users.length, 2);
  assert.deepEqual(logs.filter((x) => x.action === "user.create").map((x) => x.result), ["rejected", "rejected"]);
});

test("update: power change ends sessions and says so; a stale form conflicts; hidden people look like 'not found'", async () => {
  const target = row(3, { username: "target", houses: ["health"] });
  const other = row(4, { username: "elsewhere", houses: ["beauty"] });
  setup([owner, manager, target, other], [{ sid: "a", panel: "health", user_id: target.id, revoked_at: null }]);
  const c = ctx(manager);
  const ok = await updatePerson(c, target.id, { role: "quote_manager" }, 1);
  assert.equal(ok.ok, true);
  assert.equal(ok.sessionsEnded, true);
  assert.ok(db.tables.operator_sessions[0].revoked_at);
  const stale = await updatePerson(c, target.id, { displayName: "Renamed" }, 1);
  assert.equal(stale.ok, false);
  assert.equal(stale.conflict, true);
  const hidden = await updatePerson(c, other.id, { displayName: "X" }, 1);
  assert.equal(hidden.ok, false);
  assert.match(hidden.error, /پیدا نشد/, "a person of another house is not even confirmed to exist");
  const grant = await updatePerson(c, target.id, { allowText: "users.manage" }, 2);
  assert.equal(grant.ok, false, "a non-owner never hands out users.manage");
  assert.ok(logs.some((x) => x.action === "user.update" && x.result === "success" && x.targetUserId === target.id));
  assert.ok(logs.some((x) => x.action === "user.update" && x.result === "rejected"));
});

test("status change is logged as its own action; nobody disables himself", async () => {
  setup([owner]);
  const self = await updatePerson(ctx(owner), owner.id, { status: "disabled" }, 1);
  assert.equal(self.ok, false);
  assert.match(self.error, /حساب خودتان/);
  assert.equal(db.tables.operator_users[0].status, "active");
  const t = row(6, { username: "willquit" });
  db.tables.operator_users.push(t);
  const off = await updatePerson(ctx(owner), t.id, { status: "blocked" }, 1);
  assert.equal(off.ok, true);
  assert.ok(logs.some((x) => x.action === "user.status" && x.result === "success"));
});

test("password reset: not your own, not an owner's unless you are an owner, ends sessions, shows the new one once", async () => {
  const t = row(3, { username: "target" });
  setup([owner, manager, t], [{ sid: "a", panel: "health", user_id: t.id, revoked_at: null }]);
  assert.match((await resetPersonPassword(ctx(owner), owner.id)).error, /تنظیمات/, "own password goes through settings");
  const mgrOnOwner = await resetPersonPassword(ctx(manager), owner.id);
  assert.equal(mgrOnOwner.ok, false);
  const ok = await resetPersonPassword(ctx(manager), t.id);
  assert.equal(ok.ok, true);
  assert.equal(passwordProblem(ok.tempPassword), null);
  assert.equal((await verifyLogin(db, { username: "target", password: ok.tempPassword, panel: "health" })).ok, true);
  assert.equal(db.tables.operator_users.find((r) => r.id === t.id).must_change_password, true);
  assert.ok(db.tables.operator_sessions[0].revoked_at);
  assert.ok(!JSON.stringify(logs).includes(ok.tempPassword));
  assert.ok(logs.some((x) => x.action === "user.password_reset" && x.result === "success"));
  assert.ok(logs.some((x) => x.action === "user.password_reset" && x.result === "rejected"));
});

test("end sessions of a person: only of people you can see and manage", async () => {
  const t = row(3, { username: "target" });
  const far = row(4, { username: "far", houses: ["beauty"] });
  setup([owner, manager, t, far], [{ sid: "a", panel: "health", user_id: t.id, revoked_at: null }, { sid: "b", panel: "beauty", user_id: far.id, revoked_at: null }]);
  assert.equal((await endPersonSessions(ctx(manager), t.id)).ok, true);
  assert.ok(db.tables.operator_sessions[0].revoked_at);
  assert.equal((await endPersonSessions(ctx(manager), far.id)).ok, false);
  assert.equal(db.tables.operator_sessions[1].revoked_at, null);
  assert.equal((await endPersonSessions(ctx(manager), owner.id)).ok, false, "a manager cannot touch an owner");
});

test("listPeople shows only visible people, never a hash or a seed; an outage is an error, not an empty list", async () => {
  setup([owner, manager, row(3, { houses: ["beauty"], totp_secret_enc: "v1.a.b.c" })]);
  const r = await listPeople(ctx(manager));
  assert.deepEqual(r.users.map((u) => u.username), ["boss", "mgr"], "the beauty-only person is not visible to a Health manager");
  assert.ok(!/scrypt|v1\./.test(JSON.stringify(r)));
  db.fail = () => ({ code: "PGRST002", message: "schema cache" });
  const out = await listPeople(ctx(manager));
  assert.equal(out.ok, false);
});

test("messages: every authz code has a message, passwords problems too", () => {
  for (const code of ["not_allowed", "owner_only", "owner_needs_both_houses", "house_outside_actor", "target_outside_actor", "grant_above_actor", "last_owner", "self_role", "self_status", "mode_above_actor", "target_above_actor", "require2fa_owner_only", "self_require2fa"]) {
    assert.ok(messageFor({ error: "notAllowed", codes: [code] }), code);
  }
  assert.ok(messageFor({ error: "password", problem: "too_short" }));
  assert.equal(messageFor({ ok: true }), null);
});

// ── review finding R2: a limited manager cannot take over a stronger non-owner account ───────────────────────────────────
test("R2: viewer + users.manage cannot reset the password of, or end the sessions of, a house_admin (no 2FA on the target = takeover)", async () => {
  const weak = row(7, { username: "viewer1", role: "viewer", allow_perms: ["users.manage"] });
  const strong = row(8, { username: "admin1", role: "house_admin", require_2fa: false });
  const sessions = [{ sid: "keep-1", user_id: strong.id, panel: "health", revoked_at: null }];
  setup([owner, weak, strong], sessions);
  const before = db.tables.operator_users.find((u) => u.id === strong.id).password_hash;
  const r = await resetPersonPassword(ctx(weak), strong.id);
  assert.equal(r.ok, false);
  assert.equal(r.tempPassword, undefined, "no temporary password is produced for a stronger account");
  assert.equal(db.tables.operator_users.find((u) => u.id === strong.id).password_hash, before, "the password hash is untouched");
  assert.equal(db.tables.operator_users.find((u) => u.id === strong.id).must_change_password, false);
  const e = await endPersonSessions(ctx(weak), strong.id);
  assert.equal(e.ok, false);
  assert.ok(db.tables.operator_sessions[0].revoked_at == null, "the stronger person's session is still alive");
  assert.deepEqual(logs.filter((l) => /password_reset|sessions_ended/.test(l.action)).map((l) => [l.action, l.result, l.detail?.reason]), [["user.password_reset", "rejected", "target_above_actor"], ["user.sessions_ended", "rejected", "target_above_actor"]]);
  // a peer (same or less power) is still theirs, and an owner can reset anybody
  const peer = row(9, { username: "viewer2", role: "viewer" });
  db.tables.operator_users.push(peer);
  assert.equal((await resetPersonPassword(ctx(weak), peer.id)).ok, true);
  assert.equal((await resetPersonPassword(ctx(owner), strong.id)).ok, true);
});

test("R2: a target that differs only by execution mode (direct where the manager needs approval) is not the manager's to reset", async () => {
  const mgr = row(11, { username: "pm1", role: "product_manager", allow_perms: ["users.manage"], approval: { health: ["products.price"] } });
  const direct = row(12, { username: "pm2", role: "product_manager", approval: { health: [] } });
  setup([owner, mgr, direct]);
  assert.equal((await resetPersonPassword(ctx(mgr), direct.id)).ok, false);
});

// ── review finding R3 through the whole path: the database row → a signed session's person → "restricted or not" ──────────
test("R3: a person with required 2FA AND a configured seed is not restricted after the session is resolved from the real column projection", async () => {
  const { resolveSessionUser, getUser } = await import("../lib/operator/accounts.js");
  const { restrictedReason, actorOf } = await import("../lib/operator/access.js");
  const configured = row(21, { username: "enrolled", require_2fa: true, totp_secret_enc: "encrypted-test-seed", recovery_hashes: ["test-hash"] });
  const notYet = row(22, { username: "fresh", require_2fa: true });
  setup([owner, configured, notYet]);
  const s1 = await resolveSessionUser(db, { panel: "health", uid: configured.id, av: 1 });
  assert.equal(restrictedReason({ user: s1.user }), null, "enrolled: free to work");
  assert.ok(actorOf({ user: s1.user }, "health"));
  const s2 = await resolveSessionUser(db, { panel: "health", uid: notYet.id, av: 1 });
  assert.equal(restrictedReason({ user: s2.user }), "twofa", "not enrolled yet: still restricted until set up");
  assert.equal(actorOf({ user: s2.user }, "health"), null);
  // what the people screen is given never carries the seed or the hashes
  const listed = await listPeople(ctx(owner));
  const text = JSON.stringify(listed);
  assert.ok(!text.includes("encrypted-test-seed") && !text.includes("test-hash") && !text.includes(HASH));
  assert.equal(listed.users.find((u) => u.username === "enrolled").hasTotp, true);
  assert.equal((await getUser(db, configured.id)).user.hasTotp, true);
});
