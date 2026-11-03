// Archive / restore of people, the manager's re-authentication, the reliable history of sensitive changes, and the safe recovery of a
// person who lost the phone — the application rules (userActionsCore.js, accounts.js, authz.js) against an in-memory database whose
// "trigger" repeats the guard of migration 57 (the real SQL is proven in operator-users-archive-migration.test.mjs on real PostgreSQL).
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createMemoryAdmin } from "./helpers/memoryAdmin.mjs";
import {
  archivePerson, createPerson, endPersonSessions, resetPersonPassword, resetPersonTwoFactor, responsibilitiesOf, restorePerson, transferResponsibilities, updatePerson,
} from "../lib/operator/userActionsCore.js";
import { resolveSessionUser, rowToUser, invalidateSessionUser, verifyLogin } from "../lib/operator/accounts.js";
import { sensitivityOf } from "../lib/operator/authz.js";
import { restrictedReason, actorOf } from "../lib/operator/access.js";
import { assignQuoteGuarded } from "../lib/operator/quoteOps.js";
import { archivedLabelCheck } from "../lib/operator/quoteFollowUpCore.js";
import { loadPeople } from "../lib/operator/userNames.js";
import { hashPassword } from "../lib/operator/passwords.js";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const HASH = hashPassword("Correct-horse-42");
const row = (n, o = {}) => ({
  id: id(n), username: `user${n}`, display_name: `User ${n}`, password_hash: HASH, status: "active", role: "viewer", houses: ["health"], allow_perms: [], deny_perms: [], approval: {},
  require_2fa: false, totp_secret_enc: null, recovery_hashes: [], must_change_password: false, authz_version: 1, version: 1, created_at: "2026-01-01", archived_at: null, archived_by: null, ...o,
});
const ADMIN_FIELDS = ["username", "display_name", "status", "role", "houses", "allow_perms", "deny_perms", "approval", "require_2fa", "password_hash"];
let db, logs, auditOk;

// the guard of migration 57, in memory
const guard = (old, next, rows) => {
  if (old.status === "archived") {
    if (next.status === "archived" && ADMIN_FIELDS.some((f) => JSON.stringify(old[f]) !== JSON.stringify(next[f]))) return { code: "P0001", message: "an archived account cannot be changed; restore it first" };
    if (next.status !== "archived" && next.status !== "active") return { code: "P0001", message: "an archived account can only be restored to active" };
    if (next.username !== old.username) return { code: "P0001", message: "the username of an archived account is reserved" };
  }
  if (old.role === "owner" && old.status === "active" && !(next.role === "owner" && next.status === "active" && next.houses.length === 2)
      && !rows.some((r) => r !== old && r.role === "owner" && r.status === "active" && r.houses.length === 2)) return { code: "P0001", message: "the last active owner cannot be disabled, blocked, archived, demoted or lose a house" };
  if (next.status === "archived" && old.status !== "archived") {
    next.authz_version = Math.max(next.authz_version, old.authz_version + 1);
    next.archived_at = "2026-11-03T08:00:00Z";
    for (const s of db.tables.operator_sessions) if (s.user_id === old.id && !s.revoked_at) s.revoked_at = "2026-11-03T08:00:00Z";
  } else if (old.status === "archived" && next.status === "active") {
    next.authz_version = Math.max(next.authz_version, old.authz_version + 1);
    next.must_change_password = true;
  }
  if (ADMIN_FIELDS.some((f) => JSON.stringify(old[f]) !== JSON.stringify(next[f]))) next.version = old.version + 1;
  return null;
};
const setup = (rows, { sessions = [], quotes = [] } = {}) => {
  db = createMemoryAdmin({ operator_users: rows, operator_sessions: sessions, quote_requests: quotes, beauty_quote_requests: [] }, {
    unique: { operator_users: [["username"]] }, beforeUpdate: { operator_users: guard },
    defaults: { operator_users: () => ({ id: `00000000-0000-4000-8000-${String(Math.floor(Math.random() * 1e12)).padStart(12, "0")}`, version: 1, authz_version: 1 }) },
  });
  logs = []; auditOk = () => true;
  invalidateSessionUser();
};
const PASSWORD = "manager-pass";
const RE = { password: PASSWORD };
const ctx = (actorRow, panel = "health") => ({
  admin: db, session: { sid: "s", uid: actorRow.id, user: rowToUser(db.tables.operator_users.find((r) => r.id === actorRow.id) || actorRow) }, panel,
  audit: async (action, meta) => { if (!auditOk(action, meta)) return { ok: false }; logs.push({ action, ...meta }); return { ok: true }; },
  reauthenticate: async (i) => (i?.password === PASSWORD ? { ok: true } : { ok: false, error: "wrongPassword" }),
});
const boss = row(1, { username: "boss", role: "owner", houses: ["health", "beauty"] });
const boss2 = row(2, { username: "boss2", role: "owner", houses: ["health", "beauty"] });
const manager = row(3, { username: "mgr", role: "house_admin", houses: ["health"], allow_perms: ["users.manage"] });
const staff = row(4, { username: "sara", display_name: "Sara", role: "product_manager", houses: ["health"] });
const stored = (n) => db.tables.operator_users.find((r) => r.id === id(n));
const sessionOf = (uid, sid) => ({ sid, panel: "health", user_id: uid, revoked_at: null });
const outcomes = (action) => logs.filter((l) => l.action === action).map((l) => l.result);
beforeEach(() => setup([boss, boss2, manager, staff]));

// ── 1. archive ──────────────────────────────────────────────────────────────────────────────────────────────────────────
test("archive: the person loses login and every session at once; the account, id, username and name stay; who and when are recorded", async () => {
  setup([boss, boss2, manager, staff], { sessions: [sessionOf(id(4), "a"), sessionOf(id(4), "b"), sessionOf(id(1), "other")] });
  const r = await archivePerson(ctx(boss), id(4), 1, RE);
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.equal(stored(4).status, "archived");
  assert.deepEqual([stored(4).username, stored(4).display_name, stored(4).id], ["sara", "Sara", id(4)], "nothing is erased or renamed");
  assert.equal(stored(4).archived_by, id(1));
  assert.ok(stored(4).archived_at);
  assert.deepEqual(db.tables.operator_sessions.filter((s) => s.user_id === id(4)).map((s) => Boolean(s.revoked_at)), [true, true]);
  assert.equal(db.tables.operator_sessions.find((s) => s.sid === "other").revoked_at, null, "somebody else's session is untouched");
  // login is refused with the same neutral answer as any inactive account; the reason (for the log only) says archived
  const login = await verifyLogin(db, { username: "sara", password: "Correct-horse-42", panel: "health" });
  assert.deepEqual([login.ok, login.reason], [false, "archived"]);
  // an old cookie of theirs is dead even if the registry were not consulted: the account is no longer active and authz_version moved
  assert.deepEqual(await resolveSessionUser(db, { panel: "health", uid: id(4), av: 1 }), { ok: true, user: null });
  // the history: attempt first, then the real outcome, both naming actor (session) and target; no password anywhere
  assert.deepEqual(outcomes("user.archive"), ["attempt", "success"]);
  assert.ok(logs.filter((l) => l.action === "user.archive").every((l) => l.targetUserId === id(4)));
  assert.ok(!JSON.stringify(logs).includes(PASSWORD) && !JSON.stringify(logs).includes("Correct-horse"));
});

test("archive: not yourself, not the last active owner, not an owner for a manager, not a person you cannot see — each refused, nothing changes, nothing demanded", async () => {
  setup([boss, manager, staff, row(9, { username: "far", houses: ["beauty"] })]);
  assert.equal((await archivePerson(ctx(boss), id(1), 1, RE)).ok, false, "yourself");
  assert.equal(stored(1).status, "active");
  setup([boss, manager, staff]);
  const last = await archivePerson(ctx(manager), id(1), 1, RE);
  assert.equal(last.ok, false, "a manager cannot archive an owner");
  assert.equal((await archivePerson(ctx(manager), id(9), 1, RE)).ok, false, "a person of another house is not even confirmed to exist");
  // the last owner: even another owner-level actor cannot (boss2 is the only other owner; archive boss2 first, then boss is last)
  setup([boss, boss2, manager, staff]);
  assert.equal((await archivePerson(ctx(boss), id(2), 1, RE)).ok, true);
  const again = await archivePerson(ctx({ ...boss2 }), id(1), 1, RE);
  assert.equal(again.ok, false, "an archived owner can do nothing");
  assert.equal(stored(1).status, "active");
  assert.ok(logs.every((l) => l.result !== "success" || l.targetUserId === id(2)));
});

test("archive and restore need the manager's own password again: none, wrong, or no check at all → refused, nothing changes, the failure is on record", async () => {
  const c = ctx(boss);
  const none = await archivePerson(c, id(4), 1);
  assert.deepEqual([none.ok, none.reauth], [false, true]);
  const wrong = await archivePerson(c, id(4), 1, { password: "guess" });
  assert.deepEqual([wrong.ok, wrong.reauth], [false, true]);
  const noChecker = await archivePerson({ ...c, reauthenticate: undefined }, id(4), 1, RE);
  assert.equal(noChecker.ok, false, "no way to verify means no way in");
  assert.equal(stored(4).status, "active");
  assert.ok(logs.some((l) => l.action === "user.reauth_failed" && l.result === "rejected" && l.targetUserId === id(4)));
  assert.equal(outcomes("user.archive").length, 0, "no attempt entry before the proof");
  // a manager with a second factor is told that a code is expected
  const withTotp = { ...c, session: { ...c.session, user: { ...c.session.user, hasTotp: true } } };
  assert.equal((await archivePerson(withTotp, id(4), 1)).needCode, true);
  assert.equal((await archivePerson(c, id(4), 1, RE)).ok, true);
});

// ── 2. reliable history ──────────────────────────────────────────────────────────────────────────────────────────────────
test("no history entry, no change: every sensitive action stops when its attempt cannot be written", async () => {
  auditOk = (action, meta) => meta.result !== "attempt";          // the log refuses attempts (table missing, database down)
  const c = ctx(boss);
  const created = await createPerson(c, { username: "newbie", displayName: "Newbie", role: "viewer", houses: ["health"] }, RE);
  assert.deepEqual([created.ok, created.auditFailed], [false, true]);
  assert.equal(db.tables.operator_users.some((r) => r.username === "newbie"), false);
  assert.equal((await updatePerson(c, id(4), { role: "viewer" }, 1, RE)).ok, false);
  assert.equal(stored(4).role, "product_manager");
  assert.equal((await updatePerson(c, id(4), { status: "disabled" }, 1)).ok, false, "restricting needs a trace too");
  assert.equal(stored(4).status, "active");
  assert.equal((await archivePerson(c, id(4), 1, RE)).ok, false);
  assert.equal(stored(4).status, "active");
  const before = stored(4).password_hash;
  assert.equal((await resetPersonPassword(c, id(4), RE)).ok, false);
  assert.equal(stored(4).password_hash, before, "the password was not touched");
  assert.equal((await resetPersonTwoFactor(c, id(4), RE)).ok, false);
  assert.equal(stored(4).password_hash, before);
  // restore, too
  setup([boss, boss2, manager, row(4, { username: "sara", status: "archived", archived_at: "2026-10-01T00:00:00Z" })]);
  auditOk = (action, meta) => meta.result !== "attempt";
  assert.equal((await restorePerson(ctx(boss), id(4), {}, 1, RE)).ok, false);
  assert.equal(stored(4).status, "archived");
});

test("when only the OUTCOME entry cannot be written the change stands, the attempt is on record, and the manager is told", async () => {
  auditOk = (action, meta) => meta.result === "attempt";
  const r = await archivePerson(ctx(boss), id(4), 1, RE);
  assert.deepEqual([r.ok, r.auditWarning], [true, true]);
  assert.equal(stored(4).status, "archived");
  assert.deepEqual(outcomes("user.archive"), ["attempt"]);
});

test("a failed change is recorded as failure/rejected with a short code, never as success", async () => {
  const stale = await archivePerson(ctx(boss), id(4), 99, RE);                  // somebody changed the account since the form was loaded
  assert.deepEqual([stale.ok, stale.conflict], [false, true]);
  assert.deepEqual(outcomes("user.archive"), ["attempt", "failure"]);
  assert.equal(logs.at(-1).detail.reason, "conflict");
});

test("changes of power are traced (attempt, outcome); a new display name alone is an ordinary change", async () => {
  const c = ctx(boss);
  assert.equal((await updatePerson(c, id(4), { role: "quote_manager" }, 1, RE)).ok, true);
  assert.deepEqual(outcomes("user.update"), ["attempt", "success"]);
  logs.length = 0;
  assert.equal((await updatePerson(c, id(4), { displayName: "Sara K" }, 2)).ok, true);
  assert.deepEqual(outcomes("user.update"), ["success"], "not a change of power: logged as before");
  logs.length = 0;
  const same = await updatePerson(c, id(4), { role: "quote_manager", houses: ["health"] }, 3);
  assert.deepEqual([same.ok, same.unchanged, logs.length], [true, true, 0], "an untouched form is not a change");
});

test("more power asks for the password again; less power does not", async () => {
  const c = ctx(boss);
  assert.equal((await updatePerson(c, id(4), { allowText: "health.quotes.edit" }, 1)).reauth, true, "more permissions");
  assert.equal((await updatePerson(c, id(4), { houses: ["health", "beauty"] }, 1)).reauth, true, "another house");
  assert.equal((await updatePerson(c, id(4), { require2fa: true }, 1)).reauth, true, "second-factor rule changed");
  assert.equal(stored(4).version, 1, "nothing was written");
  assert.equal((await updatePerson(c, id(4), { denyText: "health.products.delete" }, 1)).ok, true, "closing a door is easy");
  assert.equal((await updatePerson(c, id(4), { status: "blocked" }, 2)).ok, true, "blocking too");
  assert.equal((await updatePerson(c, id(4), { status: "active" }, 3)).reauth, true, "re-activating a blocked account is more power");
});

test("sensitivityOf: the reasons, as a pure function", () => {
  const u = rowToUser(row(4, { role: "viewer" }));
  assert.deepEqual(sensitivityOf(null, u), ["create"]);
  assert.deepEqual(sensitivityOf(u, { ...u, displayName: "x" }), []);
  assert.ok(sensitivityOf(u, { ...u, role: "house_admin" }).includes("privilege_increase"));
  assert.deepEqual(sensitivityOf({ ...u, role: "house_admin" }, u), [], "demotion is not an increase");
  assert.ok(sensitivityOf(u, { ...u, status: "archived" }).includes("archive"));
  assert.deepEqual(sensitivityOf({ ...u, status: "archived" }, { ...u, status: "active" }).slice(0, 1), ["restore"]);
  assert.ok(sensitivityOf({ ...u, status: "disabled" }, u).includes("reactivate"));
  assert.ok(sensitivityOf(u, { ...u, require2fa: !u.require2fa }).includes("twofa"));
  // approval list: dropping a "needs approval" entry turns an operation into a direct one
  const pm = rowToUser(row(5, { role: "product_manager", approval: { health: ["products.price"] } }));
  assert.ok(sensitivityOf(pm, { ...pm, approval: { health: [] } }).includes("privilege_increase"));
});

// ── 3. restore ───────────────────────────────────────────────────────────────────────────────────────────────────────────
test("restore: a fresh login works per the CURRENT (reviewed) permissions, the old session stays invalid, a new password is demanded", async () => {
  setup([boss, boss2, manager, staff], { sessions: [sessionOf(id(4), "old")] });
  const c = ctx(boss);
  const oldAv = stored(4).authz_version;
  assert.equal((await archivePerson(c, id(4), 1, RE)).ok, true);
  const archivedVersion = stored(4).version;
  const r = await restorePerson(c, id(4), { role: "viewer", houses: ["health"], require2fa: true }, archivedVersion, RE);
  assert.equal(r.ok, true, JSON.stringify(r));
  const s = stored(4);
  assert.deepEqual([s.status, s.role, s.require_2fa, s.must_change_password, s.restored_by], ["active", "viewer", true, true, id(1)]);
  assert.ok(s.authz_version > oldAv, "a cookie from before cannot match");
  assert.ok(db.tables.operator_sessions.find((x) => x.sid === "old").revoked_at, "the old session is still ended");
  assert.deepEqual(await resolveSessionUser(db, { panel: "health", uid: id(4), av: oldAv }), { ok: true, user: null }, "old session cookie: refused");
  const login = await verifyLogin(db, { username: "sara", password: "Correct-horse-42", panel: "health" });
  assert.equal(login.ok, true, "a fresh sign-in is possible again");
  assert.equal(login.user.role, "viewer", "…with the permissions reviewed at the restore, not the old ones");
  assert.equal(restrictedReason({ user: login.user }), "password", "…and only after choosing a new password");
  assert.deepEqual(outcomes("user.restore"), ["attempt", "success"]);
});

test("restore: only an archived account; the same ceiling as any change (no more than the manager holds, no owner for a manager, no house outside)", async () => {
  setup([boss, boss2, manager, staff, row(5, { username: "old-owner", role: "owner", houses: ["health", "beauty"], status: "archived", archived_at: "2026-10-01T00:00:00Z" }),
    row(6, { username: "old-staff", status: "archived", archived_at: "2026-10-01T00:00:00Z" })]);
  assert.match((await restorePerson(ctx(boss), id(4), {}, 1, RE)).error, /بایگانی نشده/, "an active account is not restored");
  assert.equal((await restorePerson(ctx(manager), id(5), {}, 1, RE)).ok, false, "a manager cannot restore an owner");
  assert.equal((await restorePerson(ctx(manager), id(6), { allowText: "users.manage" }, 1, RE)).ok, false, "no power the manager does not hold themself");
  assert.equal((await restorePerson(ctx(manager), id(6), { houses: ["health", "beauty"] }, 1, RE)).ok, false, "no house outside the manager's own");
  assert.equal(stored(6).status, "archived");
  assert.equal((await restorePerson(ctx(manager), id(6), { role: "viewer" }, 1, RE)).ok, true);
  assert.equal((await restorePerson(ctx(boss), id(5), {}, 1, RE)).ok, true, "an owner restores an owner");
  assert.equal((await restorePerson(ctx(manager), id(6), {}, 1, RE)).ok, false, "twice: it is active now");
});

test("an archived account accepts no edit, no password reset, no second archive, and cannot be set to 'archived' by a plain edit; its username stays taken", async () => {
  const c = ctx(boss);
  assert.equal((await updatePerson(c, id(4), { status: "archived" }, 1, RE)).ok, false, "archive is its own action");
  assert.equal(stored(4).status, "active");
  assert.equal((await archivePerson(c, id(4), 1, RE)).ok, true);
  const v = stored(4).version;
  for (const change of [{ displayName: "Someone else" }, { role: "house_admin" }, { status: "active" }, { allowText: "health.*" }]) {
    assert.equal((await updatePerson(c, id(4), change, v, RE)).ok, false, JSON.stringify(change));
  }
  assert.equal((await resetPersonPassword(c, id(4), RE)).ok, false);
  assert.equal((await archivePerson(c, id(4), v, RE)).ok, false);
  assert.equal((await resetPersonTwoFactor(c, id(4), RE)).ok, false);
  const taken = await createPerson(c, { username: "SARA", displayName: "Another Sara", role: "viewer", houses: ["health"] }, RE);
  assert.equal(taken.ok, false, "the username of an archived person is never given to somebody else");
  assert.match(taken.error, /نام کاربری/);
});

// ── 4. responsibilities, assignment, approvals, names ─────────────────────────────────────────────────────────────────────
const QUOTES = [
  { id: 1, status: "new", assigned_to: "Sara", assigned_user_id: id(4) },
  { id: 2, status: "in_progress", assigned_to: "Sara", assigned_user_id: id(4) },
  { id: 3, status: "closed", assigned_to: "Sara", assigned_user_id: id(4) },
  { id: 4, status: "new", assigned_to: "Boss", assigned_user_id: id(1) },
];
test("old responsibilities are kept until a manager moves them on purpose: only OPEN requests, only to an active person of the house", async () => {
  setup([boss, boss2, manager, staff, row(7, { username: "bea", display_name: "Bea", houses: ["beauty"] })], { quotes: QUOTES.map((q) => ({ ...q })) });
  const c = ctx(boss);
  assert.equal((await archivePerson(c, id(4), 1, RE)).ok, true);
  assert.deepEqual(db.tables.quote_requests.map((q) => q.assigned_to), ["Sara", "Sara", "Sara", "Boss"], "archiving moves nothing by itself");
  assert.equal((await responsibilitiesOf(c, id(4))).quotes, 2, "the manager is told how many are still open");
  assert.equal((await transferResponsibilities(c, id(4), id(7))).ok, false, "not to a person of another house");
  assert.equal((await transferResponsibilities(c, id(4), id(4))).ok, false);
  const archivedTarget = stored(4);
  assert.equal((await transferResponsibilities(c, id(1), id(4))).ok, false, "not to an archived person");
  const moved = await transferResponsibilities(c, id(4), id(3));
  assert.deepEqual([moved.ok, moved.count], [true, 2]);
  assert.deepEqual(db.tables.quote_requests.map((q) => [q.assigned_to, q.assigned_user_id]), [["User 3", id(3)], ["User 3", id(3)], ["Sara", id(4)], ["Boss", id(1)]], "the closed request keeps its history");
  assert.deepEqual(outcomes("user.responsibilities_transferred"), ["attempt", "success"], "refused transfers write nothing; the real one has attempt and outcome");
  assert.equal(archivedTarget.status, "archived");
});

test("transfer needs the right to assign requests in this house", async () => {
  const weak = row(8, { username: "weak", role: "viewer", allow_perms: ["users.manage"] });
  setup([boss, boss2, weak, staff], { quotes: QUOTES.map((q) => ({ ...q })) });
  const r = await transferResponsibilities(ctx(weak), id(4), id(1));
  assert.equal(r.ok, false);
  assert.equal(db.tables.quote_requests[0].assigned_to, "Sara");
});

test("an archived person is never offered as a new assignee and cannot be typed in either; the existing assignment stays readable", async () => {
  setup([boss, boss2, manager, staff], { quotes: QUOTES.map((q) => ({ ...q })) });
  await archivePerson(ctx(boss), id(4), 1, RE);
  assert.equal(await archivedLabelCheck("health")(db, " sara "), true);
  assert.equal(await archivedLabelCheck("health")(db, "boss"), false);
  assert.equal(await archivedLabelCheck("beauty")(db, "Sara"), false, "another house's list is not this house's business");
  const out = await assignQuoteGuarded({
    getSession: async () => ({ user: {} }), getAdminClient: () => db, table: "quote_requests", id: 4, assignee: "Sara", audit: async () => ({ ok: true }),
    resolveUser: async () => null, isArchivedLabel: archivedLabelCheck("health"),
  });
  assert.equal(out.ok, false);
  assert.match(out.error, /بایگانی/);
  assert.equal(db.tables.quote_requests[3].assigned_to, "Boss", "nothing was assigned");
  const people = await loadPeople(db, [id(4), id(1)]);
  assert.deepEqual([people[id(4)], people[id(1)]], [{ name: "Sara", archived: true }, { name: "User 1", archived: false }], "the name stays; only a flag marks it");
});

// ── 5. concurrency (the database repeats the rule; here through the application) ───────────────────────────────────────
test("two owners archived at the same moment by each other: exactly one succeeds, an owner remains", async () => {
  setup([boss, boss2, manager]);
  const [a, b] = await Promise.all([archivePerson(ctx(boss), id(2), 1, RE), archivePerson(ctx(boss2), id(1), 1, RE)]);
  assert.equal([a.ok, b.ok].filter(Boolean).length, 1, JSON.stringify([a, b]));
  assert.equal(db.tables.operator_users.filter((r) => r.role === "owner" && r.status === "active").length, 1);
});

// ── 6. safe recovery of a person who lost phone and codes ───────────────────────────────────────────────────────────────
const enrolled = () => row(4, { username: "sara", display_name: "Sara", role: "product_manager", require_2fa: true, totp_secret_enc: "v1.a.b.c", recovery_hashes: ["h1", "h2"] });
test("recovery: an owner, after proving themself, clears the seed and codes, replaces the password, ends sessions — and the person must enrol a NEW second factor first", async () => {
  setup([boss, boss2, manager, enrolled()], { sessions: [sessionOf(id(4), "x"), sessionOf(id(4), "y")] });
  const r = await resetPersonTwoFactor(ctx(boss), id(4), RE);
  assert.equal(r.ok, true, JSON.stringify(r));
  const s = stored(4);
  assert.deepEqual([s.totp_secret_enc, s.recovery_hashes, s.require_2fa, s.must_change_password], [null, [], true, true]);
  assert.ok(db.tables.operator_sessions.every((x) => x.revoked_at), "every session ended");
  assert.equal((await verifyLogin(db, { username: "sara", password: "Correct-horse-42", panel: "health" })).ok, false, "the OLD password is dead");
  const login = await verifyLogin(db, { username: "sara", password: r.tempPassword, panel: "health" });
  assert.equal(login.ok, true);
  assert.equal(login.secret.totpEnc, null, "no seed: the sign-in cannot be completed with a guess of a code");
  // what the session of that sign-in may do: nothing but the security screen (password change first, then second-factor set-up)
  assert.equal(actorOf({ user: login.user }, "health"), null, "restricted: no operation of the panel opens");
  assert.equal(restrictedReason({ user: login.user }), "password");
  assert.equal(restrictedReason({ user: { ...login.user, mustChangePassword: false } }), "twofa", "after the new password: still locked until a second factor is enrolled");
  assert.ok(!JSON.stringify(logs).includes(r.tempPassword), "the temporary password is not in the history");
  assert.deepEqual(outcomes("user.twofa_reset"), ["attempt", "success"]);
});

test("recovery: only an owner, never for yourself, never without the proof, never for an archived account — and it is not a way to skip the second factor", async () => {
  setup([boss, boss2, manager, enrolled()]);
  assert.equal((await resetPersonTwoFactor(ctx(manager), id(4), RE)).ok, false, "a manager is not an owner");
  assert.match((await resetPersonTwoFactor(ctx(boss), id(1), RE)).error, /docs\/OPERATOR_ACCOUNTS/, "yourself: the server procedure is pointed to");
  assert.equal((await resetPersonTwoFactor(ctx(boss), id(4))).reauth, true, "without the proof");
  assert.equal((await resetPersonTwoFactor(ctx(boss), id(4), { password: "no" })).reauth, true);
  assert.deepEqual([stored(4).totp_secret_enc, stored(4).recovery_hashes], ["v1.a.b.c", ["h1", "h2"]], "nothing was touched");
  assert.ok(outcomes("user.twofa_reset").includes("rejected"));
  // a plain edit cannot switch the requirement off for somebody else either unless the actor is an owner (existing rule), and never for oneself
  assert.equal((await updatePerson(ctx(manager), id(4), { require2fa: false }, 1, RE)).ok, false);
});

test("ending sessions stays possible when the log is down (closing a door must be easy) and is still recorded when it is up", async () => {
  setup([boss, boss2, manager, staff], { sessions: [sessionOf(id(4), "x")] });
  auditOk = () => false;
  assert.equal((await endPersonSessions(ctx(boss), id(4))).ok, true);
  assert.ok(db.tables.operator_sessions[0].revoked_at);
  auditOk = () => true;
  assert.equal((await endPersonSessions(ctx(boss), id(4))).ok, true);
  assert.deepEqual(outcomes("user.sessions_ended"), ["success"]);
});

// ── review R1: the account that was CHECKED is the account that is changed ─────────────────────────────────────────────
// Between the permission check and the write sits the manager's re-authentication (a human typing a password and a code). Whatever changes the
// target in that gap — role, houses, permissions, status — must make the operation fail, never run against the new state.
const meanwhile = (mutate) => ({ ...ctx(manager), reauthenticate: async (i) => {
  const r = i?.password === PASSWORD ? { ok: true } : { ok: false, error: "wrongPassword" };
  mutate();                                                   // the owner promotes the employee while the manager types the proof
  return r;
} });
const promote = (n) => () => { const r = stored(n); r.role = "owner"; r.houses = ["health", "beauty"]; r.version += 1; };

test("R1: a limited manager's password reset is refused when the target became an owner during the re-authentication — no temporary password, nothing changed", async () => {
  setup([boss, boss2, manager, staff]);
  const hash = stored(4).password_hash;
  const r = await resetPersonPassword(meanwhile(promote(4)), id(4), RE);
  assert.equal(r.ok, false);
  assert.equal(r.tempPassword, undefined, "no temporary password for an account that is now an owner");
  assert.equal(stored(4).password_hash, hash, "the hash is untouched");
  assert.equal(stored(4).role, "owner");
  assert.ok(!outcomes("user.password_reset").includes("success"));
});

test("R1: the same for the second-factor recovery, archive, restore and ordinary changes — each is bound to the version that was checked", async () => {
  // recovery (an owner is the actor, so the change that matters is ANY change of the target: the confirmation was for a different account state)
  setup([boss, boss2, manager, enrolled()]);
  const bossCtx = { ...ctx(boss), reauthenticate: async () => { stored(4).houses = ["health", "beauty"]; stored(4).version += 1; return { ok: true }; } };
  const seed = stored(4).totp_secret_enc;
  assert.equal((await resetPersonTwoFactor(bossCtx, id(4), RE)).ok, false);
  assert.equal(stored(4).totp_secret_enc, seed, "the second factor was not removed from an account that changed meanwhile");
  // archive
  setup([boss, boss2, manager, staff]);
  assert.equal((await archivePerson(meanwhile(promote(4)), id(4), undefined, RE)).ok, false);
  assert.equal(stored(4).status, "active");
  // update: the manager only closes a door, but the screen's version is old (no version sent at all)
  setup([boss, boss2, manager, staff]);
  const u = await updatePerson(meanwhile(promote(4)), id(4), { allowText: "health.quotes.edit" }, undefined, RE);      // more power: asks for the proof, the promotion happens during it
  assert.equal(u.ok, false);
  assert.deepEqual(stored(4).allow_perms, []);
  // restore
  setup([boss, boss2, manager, row(4, { username: "sara", status: "archived", archived_at: "2026-10-01T00:00:00Z" })]);
  const rr = await restorePerson(meanwhile(() => { stored(4).role = "owner"; stored(4).houses = ["health", "beauty"]; stored(4).version += 1; }), id(4), {}, undefined, RE);
  assert.equal(rr.ok, false);
  assert.equal(stored(4).status, "archived");
});

test("R1: if the MANAGER lost their authority during the re-authentication, nothing is done", async () => {
  setup([boss, boss2, manager, staff]);
  const c = { ...ctx(manager), reauthenticate: async () => { stored(3).allow_perms = []; stored(3).authz_version += 1; stored(3).version += 1; return { ok: true }; } };
  const hash = stored(4).password_hash;
  assert.equal((await resetPersonPassword(c, id(4), RE)).ok, false);
  assert.equal(stored(4).password_hash, hash);
  assert.equal((await archivePerson(c, id(4), undefined, RE)).ok, false);
  assert.equal(stored(4).status, "active");
});

test("R1: ending sessions re-reads the target right before it acts", async () => {
  setup([boss, boss2, manager, staff], { sessions: [sessionOf(id(4), "x")] });
  // the target becomes an owner after the first check: the manager must not end an owner's sessions
  const c = ctx(manager);
  let reads = 0;
  const realFrom = db.from.bind(db);
  db.from = (t) => { if (t === "operator_users") { reads++; if (reads === 3) promote(4)(); } return realFrom(t); };   // read 3 = the one right before the revocation
  const res = await endPersonSessions(c, id(4));
  db.from = realFrom;
  assert.equal(res.ok, false);
  assert.equal(db.tables.operator_sessions[0].revoked_at, null);
});

// ── review R3 / R4: complete and certain, beyond the API's 1,000-row cut ─────────────────────────────────────────────
import { createMemoryAdmin as bigDb } from "./helpers/memoryAdmin.mjs";
const manyPeople = () => [boss, boss2, manager, ...Array.from({ length: 1200 }, (_, i) => row(100 + i, { username: `p${i}`, display_name: `Person ${String(i).padStart(4, "0")}` })), row(9999, { username: "zed", display_name: "Zed Last", status: "archived", archived_at: "2026-10-01T00:00:00Z" })];

test("R3: the archived-name check sees an archived person beyond the first 1,000 rows, and a failed read refuses the assignment instead of allowing it", async () => {
  db = bigDb({ operator_users: manyPeople() }, { maxRows: 1000 });
  assert.equal(await archivedLabelCheck("health")(db, "zed last"), true, "the last of 1,200 people is still found");
  assert.equal(await archivedLabelCheck("health")(db, "Person 0007"), false);
  db.fail = (table) => (table === "operator_users" ? { code: "XX000", message: "down" } : null);
  await assert.rejects(() => archivedLabelCheck("health")(db, "Zed Last"), /could not be read/);
  // …and the assignment path turns that into a refusal, nothing is assigned
  db = bigDb({ operator_users: manyPeople(), quote_requests: [{ id: 1, status: "new", assigned_to: null, assigned_user_id: null }] }, { maxRows: 1000 });
  db.fail = (table) => (table === "operator_users" ? { code: "XX000", message: "down" } : null);
  const out = await assignQuoteGuarded({ getSession: async () => ({ user: {} }), getAdminClient: () => db, table: "quote_requests", id: 1, assignee: "Zed Last", audit: async () => ({ ok: true }), resolveUser: async () => null, isArchivedLabel: archivedLabelCheck("health") });
  assert.equal(out.ok, false);
  assert.equal(db.tables.quote_requests[0].assigned_to, null, "the check could not run, so nothing was assigned");
});

const manyQuotes = (n, who) => Array.from({ length: n }, (_, i) => ({ id: i + 1, status: i % 5 === 4 ? "closed" : "new", assigned_to: "Sara", assigned_user_id: who }));
test("R4: the count, the transfer and the history are exact with more than 1,000 open requests", async () => {
  const quotes = manyQuotes(1500, id(4));                    // 1,200 open + 300 closed
  db = bigDb({ operator_users: [boss, boss2, manager, staff].map((r) => ({ ...r })), operator_sessions: [], quote_requests: quotes, beauty_quote_requests: [] }, { maxRows: 1000, unique: { operator_users: [["username"]] } });
  logs = []; invalidateSessionUser();
  const c = ctx(boss);
  assert.equal((await responsibilitiesOf(c, id(4))).quotes, 1200, "the number shown before the transfer is the real one");
  const r = await transferResponsibilities(c, id(4), id(3));
  assert.deepEqual([r.ok, r.count], [true, 1200]);
  assert.equal(db.tables.quote_requests.filter((q) => q.assigned_user_id === id(3)).length, 1200);
  assert.equal(db.tables.quote_requests.filter((q) => q.assigned_user_id === id(4)).length, 300, "only the closed ones stay with the old name");
  assert.equal((await responsibilitiesOf(c, id(4))).quotes, 0);
  const done = logs.find((l) => l.action === "user.responsibilities_transferred" && l.result === "success");
  assert.equal(done.detail.moved, 1200, "the history says how many, exactly");
});

test("R4: a failure part-way through the transfer is reported with how many were moved, never as success", async () => {
  db = bigDb({ operator_users: [boss, boss2, manager, staff].map((r) => ({ ...r })), operator_sessions: [], quote_requests: manyQuotes(700, id(4)).map((q) => ({ ...q, status: "new" })), beauty_quote_requests: [] }, { maxRows: 1000, unique: { operator_users: [["username"]] } });
  logs = []; invalidateSessionUser();
  let updates = 0;
  db.fail = (table, op) => (table === "quote_requests" && op === "update" && ++updates === 3 ? { code: "XX000", message: "down" } : null);
  const r = await transferResponsibilities(ctx(boss), id(4), id(3));
  assert.equal(r.ok, false);
  assert.equal(r.partial, 400, "two chunks of 200 were moved before the failure");
  const failed = logs.find((l) => l.action === "user.responsibilities_transferred" && l.result === "failure");
  assert.equal(failed.detail.moved, 400);
  assert.ok(!logs.some((l) => l.action === "user.responsibilities_transferred" && l.result === "success"));
});
