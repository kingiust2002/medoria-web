// Migration 57 (archive of operator accounts) run for real on a throw-away PostgreSQL cluster (skipped where the server binaries are missing).
// Proves, in the database itself (the application checks the same rules first, this is the last line):
//   * it needs migration 34, applies after it, is idempotent, and keeps the guards of migration 34 (accounts never deleted, version lock);
//   * archiving ends every open session of the person IN THE SAME TRANSACTION, bumps authz_version and stamps who/when;
//   * an archived account can only go back to 'active' (restore) — never to disabled/blocked, never edited, its username can never be reused;
//   * restore bumps authz_version again, forces a password change, and the sessions of the archived time stay dead;
//   * no new session can be written for an account that is not active — also when the login and the archive run at the very same moment;
//   * the last active owner can neither be archived nor leave the team, also when two owners are archived at the same moment.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createCluster, SKIP } from "./helpers/pgCluster.mjs";

const pg = createCluster("pg57", 8300);
before(() => pg.start({ migrations: { 30: "30_operator_security.sql", 34: "34_operator_users.sql", 57: "57_operator_users_archive.sql" } }));
after(() => pg.stop());
const must = (r) => pg.must(r);
const psql = (sql, o) => pg.psql(sql, o);
const val = (sql, role = "service_role") => must(psql(sql, { role }));
const HASH = "scrypt:131072:8:1:aa:bb";
const mk = (name, role = "viewer", houses = "ARRAY['health']") => `INSERT INTO operator_users(username, display_name, password_hash, role, houses) VALUES ('${name}', '${name}', '${HASH}', '${role}', ${houses}) RETURNING id`;
const owner = (name) => mk(name, "owner", "ARRAY['health','beauty']");
const session = (sid, uid) => `INSERT INTO operator_sessions(sid, panel, expires_at, user_id) VALUES ('${sid}', 'health', now() + interval '1 day', ${uid ? `'${uid}'` : "NULL"})`;

test("migration 57 refuses to run without migration 34, and changes nothing", { skip: SKIP }, () => {
  must(psql(pg.M(30), { file: true }));
  const r = psql(pg.M(57), { file: true });
  assert.equal(r.ok, false);
  assert.match(r.err, /needs migration 34/);
});

test("migration 57 applies after 34 and is idempotent; existing rows and the old guards are untouched", { skip: SKIP }, () => {
  must(psql(pg.M(34), { file: true }));
  const a = val(mk("alice")), boss1 = val(owner("boss1"));
  must(psql(session("old-legacy", null)));
  must(psql(pg.M(57), { file: true })); must(psql(pg.M(57), { file: true }));
  assert.equal(val("SELECT count(*) FROM operator_users WHERE status = 'active'"), "2");
  assert.equal(val("SELECT count(*) FROM operator_sessions WHERE revoked_at IS NULL"), "1", "the old single-account session is untouched");
  assert.match(psql("DELETE FROM operator_users WHERE username = 'alice'").err, /never deleted/);
  const v0 = Number(val("SELECT version FROM operator_users WHERE username = 'alice'"));
  must(psql("UPDATE operator_users SET last_login_at = now() WHERE username = 'alice'"));
  assert.equal(Number(val("SELECT version FROM operator_users WHERE username = 'alice'")), v0, "a login does not make a form stale");
  assert.ok(a && boss1);
  for (const role of ["anon", "authenticated"]) assert.equal(psql("SELECT * FROM operator_users", { role }).ok, false, `${role} stays out`);
});

test("archive: sessions of that person end in the same transaction, authz_version moves, who/when is stamped; other people are untouched", { skip: SKIP }, () => {
  const bob = val(mk("bob", "product_manager")), carol = val(mk("carol"));
  must(psql(`${session("b1", bob)}; ${session("b2", bob)}; ${session("c1", carol)}`));
  const av0 = Number(val("SELECT authz_version FROM operator_users WHERE username = 'bob'"));
  const boss = val("SELECT id FROM operator_users WHERE username = 'boss1'");
  must(psql(`UPDATE operator_users SET status = 'archived', archived_by = '${boss}' WHERE username = 'bob'`));
  assert.equal(val("SELECT count(*) FROM operator_sessions WHERE user_id = '" + bob + "' AND revoked_at IS NULL"), "0", "every session of bob is dead");
  assert.equal(val("SELECT count(*) FROM operator_sessions WHERE user_id = '" + carol + "' AND revoked_at IS NULL"), "1", "carol's session is untouched");
  assert.ok(Number(val("SELECT authz_version FROM operator_users WHERE username = 'bob'")) > av0);
  assert.equal(val(`SELECT archived_by = '${boss}' AND archived_at IS NOT NULL FROM operator_users WHERE username = 'bob'`), "t");
  assert.equal(val("SELECT username FROM operator_users WHERE status = 'archived'"), "bob", "the row is kept");
});

test("an archived account can only be restored: no other status, no edits, its username is never free, no delete", { skip: SKIP }, () => {
  for (const sql of [
    "UPDATE operator_users SET status = 'disabled' WHERE username = 'bob'",
    "UPDATE operator_users SET status = 'blocked' WHERE username = 'bob'",
    "UPDATE operator_users SET role = 'house_admin' WHERE username = 'bob'",
    "UPDATE operator_users SET houses = ARRAY['beauty'] WHERE username = 'bob'",
    "UPDATE operator_users SET allow_perms = ARRAY['health.*'] WHERE username = 'bob'",
    "UPDATE operator_users SET display_name = 'Somebody else' WHERE username = 'bob'",
    "UPDATE operator_users SET password_hash = '" + HASH + "x' WHERE username = 'bob'",
    "UPDATE operator_users SET username = 'bob-free' WHERE username = 'bob'",
    "UPDATE operator_users SET archived_at = NULL WHERE username = 'bob'",
    "UPDATE operator_users SET status = 'active', username = 'bob-free' WHERE username = 'bob'",
    "DELETE FROM operator_users WHERE username = 'bob'",
  ]) assert.equal(psql(sql, { role: "service_role" }).ok, false, sql);
  const dup = psql(mk("bob"));
  assert.equal(dup.ok, false);
  assert.match(dup.err, /duplicate key|unique/i, "the username of an archived account cannot be taken by a new account");
  must(psql("UPDATE operator_users SET last_login_at = now() WHERE username = 'bob'"));       // a non-administered column is not an edit
});

test("no new session for an account that is not active (archived, disabled, blocked); the old single-account login is not affected", { skip: SKIP }, () => {
  const bob = val("SELECT id FROM operator_users WHERE username = 'bob'");
  const r = psql(session("late", bob));
  assert.equal(r.ok, false);
  assert.match(r.err, /not active/);
  const dave = val(mk("dave"));
  must(psql(session("d1", dave)));
  must(psql("UPDATE operator_users SET status = 'disabled' WHERE username = 'dave'"));
  assert.match(psql(session("d2", dave)).err, /not active/);
  must(psql("UPDATE operator_users SET status = 'active' WHERE username = 'dave'"));
  must(psql(session("d3", dave)));
  must(psql(session("legacy-2", null)));
});

test("restore: back to active, authz_version moves on, a new password is required, restored_at is set, the old sessions stay dead", { skip: SKIP }, () => {
  const bob = val("SELECT id FROM operator_users WHERE username = 'bob'");
  const av = Number(val("SELECT authz_version FROM operator_users WHERE username = 'bob'"));
  const boss = val("SELECT id FROM operator_users WHERE username = 'boss1'");
  must(psql(`UPDATE operator_users SET status = 'active', restored_by = '${boss}', role = 'viewer' WHERE username = 'bob'`));
  assert.ok(Number(val("SELECT authz_version FROM operator_users WHERE username = 'bob'")) > av, "a session issued before can never match again");
  assert.equal(val("SELECT must_change_password FROM operator_users WHERE username = 'bob'"), "t");
  assert.equal(val("SELECT restored_at IS NOT NULL AND restored_by IS NOT NULL FROM operator_users WHERE username = 'bob'"), "t");
  assert.equal(val(`SELECT count(*) FROM operator_sessions WHERE user_id = '${bob}' AND revoked_at IS NULL`), "0", "restore does not revive any old session");
  must(psql(session("fresh", bob)));                                                    // a fresh login after the restore works
  assert.equal(val("SELECT count(*) FROM operator_users WHERE username = 'bob'"), "1");
});

test("the last active owner cannot be archived; with two owners one can", { skip: SKIP }, () => {
  const r = psql("UPDATE operator_users SET status = 'archived' WHERE username = 'boss1'");
  assert.equal(r.ok, false);
  assert.match(r.err, /last active owner/);
  must(psql(owner("boss2")));
  must(psql("UPDATE operator_users SET status = 'archived' WHERE username = 'boss1'"));
  assert.match(psql("UPDATE operator_users SET status = 'archived' WHERE username = 'boss2'").err, /last active owner/);
  assert.match(psql("UPDATE operator_users SET status = 'disabled' WHERE username = 'boss2'").err, /last active owner/);
  must(psql("UPDATE operator_users SET status = 'active' WHERE username = 'boss1'"));   // restored
});

test("two owners archived at the same moment: exactly one of them goes through (real concurrency)", { skip: SKIP }, async () => {
  const one = (who) => `BEGIN; UPDATE operator_users SET status = 'archived' WHERE username = '${who}'; SELECT pg_sleep(1); COMMIT;`;
  const [a, b] = await Promise.all([pg.async(one("boss1")), pg.async(one("boss2"))]);
  assert.equal([a.ok, b.ok].filter(Boolean).length, 1, `a: ${a.err} | b: ${b.err}`);
  assert.equal(val("SELECT count(*) FROM operator_users WHERE role = 'owner' AND status = 'active'"), "1", "an owner must remain");
  const gone = val("SELECT username FROM operator_users WHERE status = 'archived' AND role = 'owner'");
  must(psql(`UPDATE operator_users SET status = 'active' WHERE username = '${gone}'`));
});

test("a login that read the account while it was still active cannot write a session after the archive committed (real concurrency)", { skip: SKIP }, async () => {
  const erin = val(mk("erin"));
  // the login's transaction holds the account first; the archive has to wait and then ends the session the login has just written
  const login = pg.async(`BEGIN; ${session("race1", erin)}; SELECT pg_sleep(1); COMMIT;`);
  await new Promise((r) => setTimeout(r, 300));
  const arch = pg.async("UPDATE operator_users SET status = 'archived' WHERE username = 'erin'");
  const [l, a] = await Promise.all([login, arch]);
  assert.ok(l.ok && a.ok, `${l.err} ${a.err}`);
  assert.equal(val(`SELECT count(*) FROM operator_sessions WHERE user_id = '${erin}' AND revoked_at IS NULL`), "0", "the archive wins: nothing of erin stays open");
  // …and the other order: the archive first, then the login's insert is refused
  const frank = val(mk("frank"));
  const arch2 = pg.async("BEGIN; UPDATE operator_users SET status = 'archived' WHERE username = 'frank'; SELECT pg_sleep(1); COMMIT;");
  await new Promise((r) => setTimeout(r, 300));
  const login2 = pg.async(session("race2", frank));
  const [a2, l2] = await Promise.all([arch2, login2]);
  assert.ok(a2.ok, a2.err);
  assert.equal(l2.ok, false, "the late session is refused");
  assert.equal(val(`SELECT count(*) FROM operator_sessions WHERE user_id = '${frank}' AND revoked_at IS NULL`), "0");
});

test("the status check accepts exactly the four statuses; an archived row needs its archive time", { skip: SKIP }, () => {
  assert.equal(psql(`INSERT INTO operator_users(username, display_name, password_hash, role, houses, status) VALUES ('ghost', 'g', '${HASH}', 'viewer', ARRAY['health'], 'frozen')`).ok, false);
  assert.equal(psql(`INSERT INTO operator_users(username, display_name, password_hash, role, houses, status) VALUES ('ghost', 'g', '${HASH}', 'viewer', ARRAY['health'], 'archived')`).ok, false, "no archive time → refused");
  must(psql(`INSERT INTO operator_users(username, display_name, password_hash, role, houses, status, archived_at) VALUES ('ghost', 'g', '${HASH}', 'viewer', ARRAY['health'], 'archived', now())`));
});
