// The rollback of migration 57 (migrations/rollback/57_operator_users_archive_rollback.sql) run for real on a throw-away PostgreSQL cluster, with archived
// accounts and old sessions in it (review R5: the first version of the instructions was not executable, because the new guard forbids the very first step).
// Proves: it runs; archived people become DISABLED (never active) with a new authz_version; accounts, ids, usernames, names and the links of old records stay;
// the old guard is back (last owner rule, no archive status), the archive columns and the session trigger are gone; it can be run twice; and migration 57
// can be applied again afterwards.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createCluster, SKIP } from "./helpers/pgCluster.mjs";

const pg = createCluster("pg57b", 8600);
before(() => {
  pg.start({ migrations: { 30: "30_operator_security.sql", 34: "34_operator_users.sql", 57: "57_operator_users_archive.sql", "57r": "rollback/57_operator_users_archive_rollback.sql" } });
  if (!SKIP) for (const n of [30, 34, 57]) pg.must(pg.psql(pg.M(n), { file: true }));
});
after(() => pg.stop());
const must = (r) => pg.must(r);
const psql = (sql, o) => pg.psql(sql, o);
const val = (sql) => must(psql(sql, { role: "service_role" }));
const HASH = "scrypt:131072:8:1:aa:bb";
const mk = (name, role = "viewer", houses = "ARRAY['health']") => `INSERT INTO operator_users(username, display_name, password_hash, role, houses) VALUES ('${name}', 'Name of ${name}', '${HASH}', '${role}', ${houses}) RETURNING id`;
const snapshot = () => val("SELECT string_agg(username || ':' || status || ':' || display_name || ':' || id, '|' ORDER BY username) FROM operator_users");

test("rollback: archived accounts become DISABLED (never active), everything else and every link stays, sessions stay dead", { skip: SKIP }, () => {
  const boss = val(mk("boss", "owner", "ARRAY['health','beauty']")), boss2 = val(mk("boss2", "owner", "ARRAY['health','beauty']"));
  const gone = val(mk("gone")), alive = val(mk("alive")), off = val(mk("off"));
  must(psql("UPDATE operator_users SET status = 'disabled' WHERE username = 'off'"));
  must(psql(`INSERT INTO operator_sessions(sid, panel, expires_at, user_id) VALUES ('g1','health', now() + interval '1 day','${gone}'), ('a1','health', now() + interval '1 day','${alive}')`));
  must(psql(`UPDATE operator_users SET status = 'archived', archived_by = '${boss}' WHERE username = 'gone'`));
  must(psql("UPDATE operator_users SET status = 'archived' WHERE username = 'boss2'"));
  must(psql(`UPDATE operator_users SET created_by = '${gone}' WHERE username = 'alive'`));                 // a record that points at the archived person
  assert.equal(psql("UPDATE operator_users SET status = 'disabled' WHERE status = 'archived'").ok, false, "why the order matters: migration 57's guard forbids that very first step");
  const av = Number(val("SELECT authz_version FROM operator_users WHERE username = 'gone'"));
  const before = snapshot().replace(/:(archived):/g, ":disabled:");
  must(psql(pg.M("57r"), { file: true }));
  assert.equal(snapshot(), before, "same accounts, ids, usernames and names; archived ones are now disabled");
  assert.equal(val("SELECT status FROM operator_users WHERE username = 'gone'"), "disabled");
  assert.equal(val("SELECT count(*) FROM operator_users WHERE status = 'active'"), "2", "the rollback activated nobody: boss and alive were active before, and only they are");
  assert.equal(val("SELECT username FROM operator_users WHERE status = 'active' AND username IN ('gone','boss2')"), "", "an archived person is not active");
  assert.ok(Number(val("SELECT authz_version FROM operator_users WHERE username = 'gone'")) > av, "a cookie of the archived time cannot match");
  assert.equal(val("SELECT count(*) FROM operator_sessions WHERE user_id = '" + gone + "' AND revoked_at IS NULL"), "0");
  assert.equal(val(`SELECT created_by = '${gone}' FROM operator_users WHERE username = 'alive'`), "t", "links of old records are untouched");
  assert.equal(boss2 && val("SELECT status FROM operator_users WHERE username = 'boss2'"), "disabled");
});

test("rollback: the old guard is back, the archive is gone, the session trigger is gone", { skip: SKIP }, () => {
  assert.equal(psql("UPDATE operator_users SET status = 'archived' WHERE username = 'alive'").ok, false, "no archive status any more");
  assert.equal(val("SELECT count(*) FROM information_schema.columns WHERE table_name = 'operator_users' AND column_name IN ('archived_at','archived_by','restored_at','restored_by')"), "0");
  assert.equal(val("SELECT count(*) FROM pg_trigger WHERE tgname = 'operator_sessions_active_user'"), "0");
  must(psql("UPDATE operator_users SET status = 'active' WHERE username = 'gone'"));                      // the ordinary way back works with the old guard
  must(psql("INSERT INTO operator_sessions(sid, panel, expires_at, user_id) SELECT 'late','health', now() + interval '1 day', id FROM operator_users WHERE username = 'off'"));   // no refusal for a non-active account: the previous release's behaviour
  const r = psql("UPDATE operator_users SET status = 'disabled' WHERE username = 'boss'");
  assert.equal(r.ok, false, "the last active owner rule of migration 34 still holds");
  assert.match(r.err, /last active owner/);
  assert.equal(psql("DELETE FROM operator_users WHERE username = 'alive'").ok, false, "accounts are still never deleted");
});

test("rollback can run twice, and migration 57 can be applied again afterwards", { skip: SKIP }, () => {
  const before = snapshot();
  must(psql(pg.M("57r"), { file: true }));
  assert.equal(snapshot(), before);
  must(psql(pg.M(57), { file: true }));
  must(psql("UPDATE operator_users SET status = 'archived' WHERE username = 'alive'"));
  assert.equal(val("SELECT status FROM operator_users WHERE username = 'alive'"), "archived");
  assert.equal(psql("UPDATE operator_users SET status = 'disabled' WHERE username = 'alive'").ok, false, "the new guard is back");
});
