// Migration 37 (follow-up of customer requests) run for real on a throw-away PostgreSQL cluster (skipped where the server binaries are
// not installed). Proves: it needs migrations 32 and 34 and changes nothing without them; it adds exactly the four columns to both
// tables, keeps existing rows and values, is idempotent, leaves the tables private, rejects a negative attempt count, and a removed
// account leaves the request with a NULL assignee instead of failing.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync, execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const pgBin = ["/usr/lib/postgresql/17/bin", "/usr/lib/postgresql/16/bin", "/usr/lib/postgresql/15/bin", "/usr/lib/postgresql/14/bin"].find((d) => fs.existsSync(path.join(d, "initdb")));
const isRoot = process.getuid?.() === 0;
const canRun = Boolean(pgBin) && (!isRoot || (spawnSync("id", ["nobody"]).status === 0 && spawnSync("which", ["runuser"]).status === 0));
const SKIP = canRun ? false : "PostgreSQL server binaries (and a non-root user to run them) are not available";
const asPg = (cmd, args, opts = {}) => (isRoot ? spawnSync("runuser", ["-u", "nobody", "--", cmd, ...args], { encoding: "utf8", ...opts }) : spawnSync(cmd, args, { encoding: "utf8", ...opts }));

let dir, sock;
const port = 6300 + (process.pid % 200);
const SETUP = "CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;";

const baseArgs = (db) => ["-h", sock, "-p", String(port), "-U", "postgres", "-d", db, "-X", "-At", "-v", "ON_ERROR_STOP=1", "-q"];
function psql(sql, { file = false, role = null, db = "postgres" } = {}) {
  const args = baseArgs(db);
  if (file) args.push("-f", sql); else args.push("-c", role ? `SET ROLE ${role}; ${sql}` : sql);
  const r = asPg(path.join(pgBin, "psql"), args);
  return { ok: r.status === 0, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}
// the same, asynchronously, so two sessions can really overlap
function psqlAsync(sql, role = "service_role") {
  const args = [...baseArgs("postgres"), "-c", `SET ROLE ${role}; ${sql}`];
  const [cmd, a] = isRoot ? ["runuser", ["-u", "nobody", "--", path.join(pgBin, "psql"), ...args]] : [path.join(pgBin, "psql"), args];
  return new Promise((resolve) => execFile(cmd, a, { encoding: "utf8" }, (err, stdout, stderr) => resolve({ ok: !err, out: (stdout || "").trim(), err: (stderr || "").trim() })));
}
const must = (r) => { assert.ok(r.ok, r.err); return r.out; };

before(() => {
  if (SKIP) return;
  dir = fs.mkdtempSync(path.join("/tmp", "pg37-"));
  sock = fs.mkdtempSync(path.join("/tmp", "s37-"));
  fs.chmodSync(dir, 0o777); fs.chmodSync(sock, 0o777);
  fs.writeFileSync(path.join(dir, "setup.sql"), SETUP);
  for (const [name, f] of [["m30.sql", "30_operator_security.sql"], ["m34.sql", "34_operator_users.sql"], ["m37.sql", "37_quote_followup.sql"]]) fs.copyFileSync(path.join(root, "migrations", f), path.join(dir, name));
  for (const f of fs.readdirSync(dir)) fs.chmodSync(path.join(dir, f), 0o644);
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
const M = (n) => path.join(dir, `m${n}.sql`);


const HASH = "scrypt:131072:8:1:aa:bb";
const U = "00000000-0000-4000-8000-00000000000a";

test("needs migrations 34 and 32, and changes nothing without them", { skip: SKIP }, () => {
  let r = psql(M(37), { file: true });
  assert.equal(r.ok, false); assert.match(r.err, /needs migration 34/);
  must(psql(M(30), { file: true })); must(psql(M(34), { file: true }));
  r = psql(M(37), { file: true });
  assert.equal(r.ok, false); assert.match(r.err, /needs the request tables/);
  must(psql("CREATE TABLE public.quote_requests (id BIGSERIAL PRIMARY KEY, name TEXT, status TEXT, created_at TIMESTAMPTZ DEFAULT now()); CREATE TABLE public.beauty_quote_requests (id BIGSERIAL PRIMARY KEY, name TEXT, status TEXT, created_at TIMESTAMPTZ DEFAULT now());"));
  r = psql(M(37), { file: true });
  assert.equal(r.ok, false); assert.match(r.err, /needs migration 32/);
  must(psql("ALTER TABLE quote_requests ADD COLUMN tracking_code TEXT; ALTER TABLE beauty_quote_requests ADD COLUMN tracking_code TEXT;"));
  must(psql("INSERT INTO quote_requests(name, status, tracking_code) VALUES ('Existing', 'new', 'MH-1'); INSERT INTO beauty_quote_requests(name, status, tracking_code) VALUES ('B', 'new', 'MB-1');"));
  must(psql("CREATE ROLE tmp_probe NOLOGIN"));
  assert.equal(must(psql("SELECT count(*) FROM information_schema.columns WHERE table_name = 'quote_requests' AND column_name = 'follow_up_at'")), "0", "the failed runs left nothing behind");
});

test("adds the four columns to both tables, keeps the rows, is idempotent and stays private", { skip: SKIP }, () => {
  must(psql(M(37), { file: true }));
  must(psql(M(37), { file: true }));
  for (const t of ["quote_requests", "beauty_quote_requests"]) {
    assert.equal(must(psql(`SELECT count(*) FROM information_schema.columns WHERE table_name = '${t}' AND column_name IN ('follow_up_at','assigned_user_id','notify_attempts','notify_last_attempt_at')`)), "4");
    assert.equal(must(psql(`SELECT count(*) || '|' || min(notify_attempts) FROM ${t}`)), "1|0", "existing rows keep their values; attempts start at 0");
    assert.equal(must(psql(`SELECT has_table_privilege('anon', 'public.${t}', 'SELECT') OR has_table_privilege('authenticated', 'public.${t}', 'SELECT')`)), "f");
  }
  assert.equal(psql("UPDATE quote_requests SET notify_attempts = -1").ok, false, "a negative attempt count is refused");
});

test("a removed account leaves the request with no assignee instead of blocking the removal", { skip: SKIP }, () => {
  must(psql(`INSERT INTO operator_users(id, username, display_name, password_hash, role, houses) VALUES ('${U}', 'sara', 'Sara', '${HASH}', 'quote_manager', ARRAY['health'])`));
  must(psql(`UPDATE quote_requests SET assigned_user_id = '${U}', follow_up_at = '2026-10-30T12:00:00Z'`));
  assert.equal(must(psql("SELECT assigned_user_id IS NOT NULL FROM quote_requests")), "t");
  // accounts are never deleted by the application (a database guard says so); the rule still protects a manual clean-up
  assert.equal(must(psql(`SELECT confdeltype FROM pg_constraint WHERE conrelid = 'quote_requests'::regclass AND confrelid = 'operator_users'::regclass`)), "n", "ON DELETE SET NULL");
});
