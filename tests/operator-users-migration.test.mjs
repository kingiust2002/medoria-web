// Migration 34 run for real on a throw-away PostgreSQL cluster (skipped where the server binaries are not installed).
// What it proves beyond the static guards: it needs migration 30; it is idempotent; the table is private; the last
// active owner cannot be disabled/demoted (also when two people try at the same moment); an account can never be
// deleted; version moves on every update; CHECKs bound every column; a failed self-check leaves nothing half-applied.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const MIGRATION = path.join(root, "migrations/34_operator_users.sql");

const pgBin = ["/usr/lib/postgresql/17/bin", "/usr/lib/postgresql/16/bin", "/usr/lib/postgresql/15/bin", "/usr/lib/postgresql/14/bin"].find((d) => fs.existsSync(path.join(d, "initdb")));
const isRoot = process.getuid?.() === 0;
const canRun = Boolean(pgBin) && (!isRoot || (spawnSync("id", ["nobody"]).status === 0 && spawnSync("which", ["runuser"]).status === 0));
const SKIP = canRun ? false : "PostgreSQL server binaries (and a non-root user to run them) are not available";

const asPg = (cmd, args, opts = {}) => (isRoot ? spawnSync("runuser", ["-u", "nobody", "--", cmd, ...args], { encoding: "utf8", ...opts }) : spawnSync(cmd, args, { encoding: "utf8", ...opts }));

let dir, sock;
const port = 5700 + (process.pid % 200);


const SETUP = `CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;`;

function psql(sql, { file = false, role = null } = {}) {
  const args = ["-h", sock, "-p", String(port), "-U", "postgres", "-X", "-At", "-v", "ON_ERROR_STOP=1", "-q"];
  if (file) args.push("-f", sql); else args.push("-c", role ? `SET ROLE ${role}; ${sql}` : sql);
  const r = asPg(path.join(pgBin, "psql"), args);
  return { ok: r.status === 0, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}
const must = (r) => { assert.ok(r.ok, r.err); return r.out; };
const psqlAsync = (sql) => new Promise((resolve) => {
  const args = ["-h", sock, "-p", String(port), "-U", "postgres", "-X", "-At", "-v", "ON_ERROR_STOP=1", "-q", "-c", sql];
  const cmd = isRoot ? "runuser" : path.join(pgBin, "psql");
  const full = isRoot ? ["-u", "nobody", "--", path.join(pgBin, "psql"), ...args] : args;
  const p = spawn(cmd, full, { stdio: ["ignore", "pipe", "pipe"] });
  let err = ""; p.stderr.on("data", (d) => (err += d));
  p.on("close", (code) => resolve({ ok: code === 0, err }));
});

before(() => {
  if (SKIP) return;
  dir = fs.mkdtempSync(path.join("/tmp", "pg34-"));
  sock = fs.mkdtempSync(path.join("/tmp", "s34-"));
  fs.chmodSync(dir, 0o777); fs.chmodSync(sock, 0o777);
  for (const [name, from] of [["setup.sql", null], ["m30.sql", path.join(root, "migrations/30_operator_security.sql")], ["m34.sql", MIGRATION]]) {
    if (from) fs.copyFileSync(from, path.join(dir, name)); else fs.writeFileSync(path.join(dir, name), SETUP);
    fs.chmodSync(path.join(dir, name), 0o644);
  }
  assert.equal(asPg(path.join(pgBin, "initdb"), ["-D", path.join(dir, "data"), "-U", "postgres", "-A", "trust"]).status, 0);
  const st = asPg(path.join(pgBin, "pg_ctl"), ["-D", path.join(dir, "data"), "-o", `-p ${port} -k ${sock} -c listen_addresses=''`, "-l", path.join(dir, "log"), "-w", "start"]);
  assert.equal(st.status, 0, st.stderr);
  must(psql(path.join(dir, "setup.sql"), { file: true }));
});
after(() => {
  if (SKIP || !dir) return;
  asPg(path.join(pgBin, "pg_ctl"), ["-D", path.join(dir, "data"), "-m", "immediate", "stop"]);
  fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(sock, { recursive: true, force: true });
});

const M30 = () => path.join(dir, "m30.sql");
const M34 = () => path.join(dir, "m34.sql");
const HASH = "scrypt:131072:8:1:aa:bb";
const user = (name, extra = "") => `INSERT INTO operator_users(username, display_name, password_hash, role, houses${extra ? ", " + extra.split("|")[0] : ""}) VALUES ('${name}', '${name}', '${HASH}', ${extra ? extra.split("|")[1] : "'viewer', ARRAY['health']"})`;
const owner = (name) => `INSERT INTO operator_users(username, display_name, password_hash, role, houses) VALUES ('${name}', '${name}', '${HASH}', 'owner', ARRAY['health','beauty'])`;

test("migration 34 refuses to run without migration 30, and changes nothing", { skip: SKIP }, () => {
  const r = psql(M34(), { file: true });
  assert.equal(r.ok, false);
  assert.match(r.err, /needs migration 30/);
  assert.equal(must(psql("SELECT to_regclass('public.operator_users') IS NULL")), "t");
});

test("migration 34 applies after 30, is idempotent, and is private", { skip: SKIP }, () => {
  must(psql(M30(), { file: true }));
  must(psql("INSERT INTO operator_sessions(sid, panel, expires_at) VALUES ('old1','health', now() + interval '1 day')"));
  must(psql("INSERT INTO operator_audit_log(panel, action) VALUES ('health','auth.login')"));
  must(psql(M34(), { file: true }));
  must(psql(M34(), { file: true }));
  assert.equal(must(psql("SELECT count(*) FROM operator_sessions WHERE user_id IS NULL")), "1", "existing sessions keep working (no user)");
  assert.equal(must(psql("SELECT count(*) FROM operator_audit_log WHERE result IS NULL AND user_id IS NULL")), "1", "existing log rows are untouched");
  for (const role of ["anon", "authenticated"]) {
    assert.equal(psql("SELECT * FROM operator_users", { role }).ok, false, `${role} must not read`);
    assert.equal(psql(`${owner("x")}`, { role }).ok, false, `${role} must not insert`);
  }
  must(psql("SELECT count(*) FROM operator_users", { role: "service_role" }));
  assert.equal(must(psql("SELECT count(*) FROM pg_policies WHERE tablename = 'operator_users'")), "0");
});

test("CHECKs bound every column", { skip: SKIP }, () => {
  const bad = (sql) => assert.equal(psql(sql).ok, false, sql);
  bad(`INSERT INTO operator_users(username, display_name, password_hash, role, houses) VALUES ('Ab', 'x', '${HASH}', 'viewer', ARRAY['health'])`);        // too short + upper
  bad(`INSERT INTO operator_users(username, display_name, password_hash, role, houses) VALUES ('Alice', 'x', '${HASH}', 'viewer', ARRAY['health'])`);     // upper case
  bad(`INSERT INTO operator_users(username, display_name, password_hash, role, houses) VALUES ('alice', 'x', 'plain', 'viewer', ARRAY['health'])`);      // not scrypt
  bad(`INSERT INTO operator_users(username, display_name, password_hash, role, houses) VALUES ('alice', 'x', '${HASH}', 'god', ARRAY['health'])`);       // unknown role
  bad(`INSERT INTO operator_users(username, display_name, password_hash, role, houses) VALUES ('alice', 'x', '${HASH}', 'viewer', ARRAY['mars'])`);      // unknown house
  bad(`INSERT INTO operator_users(username, display_name, password_hash, role, houses) VALUES ('alice', 'x', '${HASH}', 'viewer', ARRAY[]::text[])`);    // no house
  bad(`INSERT INTO operator_users(username, display_name, password_hash, role, houses) VALUES ('alice', '   ', '${HASH}', 'viewer', ARRAY['health'])`);   // blank name
  bad(`INSERT INTO operator_users(username, display_name, password_hash, role, houses, status) VALUES ('alice', 'x', '${HASH}', 'viewer', ARRAY['health'], 'frozen')`);
  must(psql(user("alice")));
  bad(user("alice"));                                                                                                                                    // duplicate username
  bad(`UPDATE operator_audit_log SET result = 'maybe'`);
});

test("version moves when an administered field changes (not on a login); accounts can never be deleted", { skip: SKIP }, () => {
  const v0 = must(psql("SELECT version FROM operator_users WHERE username = 'alice'"));
  must(psql("UPDATE operator_users SET display_name = 'Alice B' WHERE username = 'alice'"));
  assert.equal(Number(must(psql("SELECT version FROM operator_users WHERE username = 'alice'"))), Number(v0) + 1);
  must(psql("UPDATE operator_users SET last_login_at = now(), totp_last_step = 5 WHERE username = 'alice'"));
  assert.equal(Number(must(psql("SELECT version FROM operator_users WHERE username = 'alice'"))), Number(v0) + 1, "a login must not make an open edit form stale");
  const d = psql("DELETE FROM operator_users WHERE username = 'alice'", { role: "service_role" });
  assert.equal(d.ok, false);
  assert.match(d.err, /never deleted/);
});

test("the last active owner cannot be disabled, blocked, demoted or lose a house", { skip: SKIP }, () => {
  must(psql(owner("boss1")));
  for (const set of ["status = 'disabled'", "status = 'blocked'", "role = 'house_admin'", "houses = ARRAY['health']"]) {
    const r = psql(`UPDATE operator_users SET ${set} WHERE username = 'boss1'`);
    assert.equal(r.ok, false, set);
    assert.match(r.err, /last active owner/);
  }
  must(psql("UPDATE operator_users SET display_name = 'Boss One' WHERE username = 'boss1'"));   // harmless change still fine
  must(psql(owner("boss2")));
  must(psql("UPDATE operator_users SET status = 'disabled' WHERE username = 'boss1'"));           // not the last any more
  const again = psql("UPDATE operator_users SET status = 'disabled' WHERE username = 'boss2'");
  assert.equal(again.ok, false, "boss2 is now the last one");
  must(psql("UPDATE operator_users SET status = 'active' WHERE username = 'boss1'"));
});

test("two owners demoting each other at the same moment: exactly one of them goes through", { skip: SKIP }, async () => {
  const mk = (who) => `BEGIN; UPDATE operator_users SET role = 'house_admin' WHERE username = '${who}'; SELECT pg_sleep(1); COMMIT;`;
  const [a, b] = await Promise.all([psqlAsync(mk("boss1")), psqlAsync(mk("boss2"))]);
  assert.equal([a.ok, b.ok].filter(Boolean).length, 1, `a: ${a.err} | b: ${b.err}`);
  assert.equal(must(psql("SELECT count(*) FROM operator_users WHERE role = 'owner' AND status = 'active'")), "1", "an owner must remain");
});

test("a sessions row can point at a user; the audit columns accept only known results", { skip: SKIP }, () => {
  must(psql("INSERT INTO operator_sessions(sid, panel, expires_at, user_id) SELECT 'new1','beauty', now() + interval '1 hour', id FROM operator_users WHERE username = 'alice'"));
  must(psql("INSERT INTO operator_audit_log(panel, action, user_id, result, request_id) SELECT 'beauty','product.delete', id, 'rejected', 'req-1' FROM operator_users WHERE username = 'alice'"));
  assert.equal(psql(`INSERT INTO operator_audit_log(panel, action, request_id) VALUES ('beauty','x','${"r".repeat(65)}')`).ok, false);
});

test("a migration that fails half-way leaves nothing half-applied", { skip: SKIP }, () => {
  must(psql("ALTER TABLE operator_sessions DROP COLUMN user_id; ALTER TABLE operator_audit_log DROP COLUMN user_id, DROP COLUMN target_user_id, DROP COLUMN result, DROP COLUMN request_id"));
  must(psql("DROP TABLE operator_users CASCADE"));
  must(psql("CREATE TABLE operator_users (id integer)"));            // an incompatible leftover: the index on username must fail
  const r = psql(M34(), { file: true });
  assert.equal(r.ok, false);
  assert.equal(must(psql("SELECT count(*) FROM information_schema.columns WHERE table_name IN ('operator_sessions','operator_audit_log') AND column_name IN ('user_id','target_user_id','result','request_id')")), "0", "no column may stay behind");
  assert.equal(must(psql("SELECT count(*) FROM pg_trigger WHERE tgname LIKE 'operator_users_guard%'")), "0");
});
