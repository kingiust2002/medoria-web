// The emergency procedure for an owner who lost password AND second factor (lib/operator/ownerRecovery.js, scripts/self-host/owner-recovery.mjs),
// run for real on a throw-away PostgreSQL cluster with migrations 30, 34 and 57: the generated SQL changes exactly what it says, in one
// transaction, only for an active owner, ends the sessions, writes both log lines — and leaves everything untouched when anything fails.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createCluster, SKIP } from "./helpers/pgCluster.mjs";
import { buildOwnerRecovery, newOneTimePassword, OWNER_CHECK_SQL } from "../lib/operator/ownerRecovery.js";
import { verifyPasswordHash, hashPassword, passwordProblem } from "../lib/operator/passwords.js";
import { restrictedReason, actorOf } from "../lib/operator/access.js";
import { rowToUser } from "../lib/operator/accounts.js";

const pg = createCluster("pg57o", 8500);
before(() => {
  pg.start({ migrations: { 30: "30_operator_security.sql", 34: "34_operator_users.sql", 57: "57_operator_users_archive.sql" } });
  if (!SKIP) for (const n of [30, 34, 57]) pg.must(pg.psql(pg.M(n), { file: true }));
});
after(() => pg.stop());
const must = (r) => pg.must(r);
const psql = (sql, o) => pg.psql(sql, o);
const val = (sql) => must(psql(sql, { role: "service_role" }));
const OLD = hashPassword("Old-Password-Of-The-Owner-1");
const owner = (name, extra = "") => `INSERT INTO operator_users(username, display_name, password_hash, role, houses, require_2fa, totp_secret_enc, recovery_hashes ${extra ? "," + extra.split("|")[0] : ""}) VALUES ('${name}', '${name}', '${OLD}', 'owner', ARRAY['health','beauty'], TRUE, 'v1.a.b.c', ARRAY['${"a".repeat(64)}'] ${extra ? "," + extra.split("|")[1] : ""})`;
const run = (name) => {
  const built = buildOwnerRecovery({ username: name });
  assert.equal(built.ok, true);
  return { built, result: pg.script(`recover-${name}.sql`, built.sql) };
};

test("the generated SQL carries a hash, never the password; the one-time password passes the policy and differs every time", () => {
  const a = buildOwnerRecovery({ username: "Boss" });
  assert.equal(a.ok, true);
  assert.equal(a.username, "boss");
  assert.ok(!a.sql.includes(a.password), "the SQL must not contain the password");
  assert.match(a.sql, /scrypt:/);
  assert.equal(passwordProblem(a.password, { username: "boss" }), null);
  assert.equal(a.password.length, 20);
  assert.notEqual(newOneTimePassword(), newOneTimePassword());
  for (const bad of ["", "a", "Bad Name", "x'; DROP TABLE operator_users; --", "UPPER;--"]) {
    assert.equal(buildOwnerRecovery({ username: bad }).ok, false, bad);
  }
  assert.equal(buildOwnerRecovery({ username: "x'; DROP TABLE operator_users; --" }).ok, false, "no SQL injection through the username");
  assert.equal(buildOwnerRecovery({ username: "boss", password: "short" }).ok, false, "a chosen password must pass the policy");
});

test("the script: a dry run prints no SQL; --apply prints SQL on stdout and the password only on stderr", () => {
  const dry = spawnSync("node", ["scripts/self-host/owner-recovery.mjs", "--username", "boss"], { encoding: "utf8" });
  assert.equal(dry.status, 0);
  assert.equal(dry.stdout, "", "a dry run prints no SQL");
  assert.match(dry.stderr, /DRY RUN/);
  const live = spawnSync("node", ["scripts/self-host/owner-recovery.mjs", "--username", "boss", "--apply"], { encoding: "utf8" });
  assert.equal(live.status, 0);
  assert.match(live.stdout, /BEGIN;[\s\S]*COMMIT;/);
  const shown = live.stderr.match(/\n\s{4}(\S{20})\n/)?.[1];
  assert.ok(shown, "the one-time password is shown on the terminal");
  assert.ok(!live.stdout.includes(shown), "…and is not part of what is piped into the database");
  assert.equal(spawnSync("node", ["scripts/self-host/owner-recovery.mjs"], { encoding: "utf8" }).status, 2, "no username: usage error");
  assert.equal(spawnSync("node", ["scripts/self-host/owner-recovery.mjs", "--username", "no spaces allowed", "--apply"], { encoding: "utf8" }).status, 2);
});

test("a real recovery: new password works, old one does not, seed and codes gone, second factor required again, sessions ended, both logs written", { skip: SKIP }, () => {
  must(psql(owner("boss")));
  must(psql(owner("boss2")));
  const bossId = val("SELECT id FROM operator_users WHERE username = 'boss'");
  must(psql(`INSERT INTO operator_sessions(sid, panel, expires_at, user_id) VALUES ('s1','health', now() + interval '1 day','${bossId}'), ('s2','beauty', now() + interval '1 day','${bossId}')`));
  const avBefore = Number(val("SELECT authz_version FROM operator_users WHERE username = 'boss'"));
  const { built, result } = run("boss");
  assert.ok(result.ok, result.err);
  const row = JSON.parse(val("SELECT to_jsonb(u) FROM operator_users u WHERE username = 'boss'"));
  assert.equal(verifyPasswordHash(built.password, row.password_hash), true, "the one-time password signs in");
  assert.equal(verifyPasswordHash("Old-Password-Of-The-Owner-1", row.password_hash), false, "the old password is dead");
  assert.deepEqual([row.totp_secret_enc, row.recovery_hashes, row.require_2fa, row.must_change_password, row.totp_last_step], [null, [], true, true, 0]);
  assert.ok(row.authz_version > avBefore);
  assert.equal(val(`SELECT count(*) FROM operator_sessions WHERE user_id = '${bossId}' AND revoked_at IS NULL`), "0");
  assert.equal(val("SELECT string_agg(panel || ':' || result, ',' ORDER BY id) FROM operator_audit_log WHERE action = 'user.emergency_recovery'"), "health:attempt,beauty:attempt,health:success,beauty:success");
  assert.equal(val("SELECT count(*) FROM operator_audit_log WHERE detail::text ILIKE '%scrypt%' OR detail::text ILIKE '%" + built.password + "%'"), "0", "the log holds no secret");
  // the other owner is untouched
  assert.equal(val("SELECT (totp_secret_enc IS NOT NULL)::text || ',' || authz_version FROM operator_users WHERE username = 'boss2'"), "true,1");
  // what that account may do after signing in with the one-time password: only the security screen, then a NEW second factor
  const user = rowToUser(row);
  assert.equal(restrictedReason({ user }), "password");
  assert.equal(restrictedReason({ user: { ...user, mustChangePassword: false } }), "twofa", "after the new password it is still locked until a new second factor exists");
  assert.equal(actorOf({ user }, "health"), null);
});

test("it refuses everything that is not an ACTIVE owner, and then changes nothing", { skip: SKIP }, () => {
  must(psql(`INSERT INTO operator_users(username, display_name, password_hash, role, houses, totp_secret_enc) VALUES ('just.a.manager', 'm', '${OLD}', 'house_admin', ARRAY['health'], 'v1.a.b.c')`));
  must(psql("UPDATE operator_users SET status = 'archived' WHERE username = 'boss2'"));        // allowed: boss is still an active owner
  const snapshot = () => val("SELECT md5(string_agg(to_jsonb(u)::text, '|' ORDER BY username)) FROM operator_users u") + val("SELECT count(*) FROM operator_audit_log");
  const before = snapshot();
  for (const name of ["just.a.manager", "boss2", "nobody.here"]) {
    const { result } = run(name);
    assert.equal(result.ok, false, name);
    assert.match(result.err, /no ACTIVE owner/);
  }
  assert.equal(snapshot(), before, "nothing changed and nothing was logged");
});

test("if the activity log cannot be written, nothing happens at all (one transaction)", { skip: SKIP }, () => {
  must(psql("UPDATE operator_users SET status = 'active' WHERE username = 'boss2'"));
  const before = val("SELECT password_hash FROM operator_users WHERE username = 'boss2'");
  must(psql("ALTER TABLE operator_audit_log RENAME TO operator_audit_log_away"));
  const { result } = run("boss2");
  must(psql("ALTER TABLE operator_audit_log_away RENAME TO operator_audit_log"));
  assert.equal(result.ok, false);
  assert.equal(val("SELECT password_hash FROM operator_users WHERE username = 'boss2'"), before, "the password was not touched");
  assert.equal(val("SELECT (totp_secret_enc IS NOT NULL)::text FROM operator_users WHERE username = 'boss2'"), "true");
});

test("the read-only owner list works and shows no secret", { skip: SKIP }, () => {
  const out = val(OWNER_CHECK_SQL.replace(/;$/, ""));
  assert.match(out, /boss/);
  assert.ok(!/scrypt|v1\./.test(out));
});
