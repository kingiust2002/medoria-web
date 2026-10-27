// Migration 35 run for real on a throw-away PostgreSQL cluster (skipped where the server binaries are not installed).
// Proves: it needs 30 and 34; it is idempotent and private; the approval state machine (a request is decided once; the asker is never
// the decider; a rejection needs a reason; "approved" gets its execution stamp once; decided rows are frozen; nothing is deleted); an
// identical pending request cannot be submitted twice; the activity log is append-only; a half-failed run leaves nothing behind.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const pgBin = ["/usr/lib/postgresql/17/bin", "/usr/lib/postgresql/16/bin", "/usr/lib/postgresql/15/bin", "/usr/lib/postgresql/14/bin"].find((d) => fs.existsSync(path.join(d, "initdb")));
const isRoot = process.getuid?.() === 0;
const canRun = Boolean(pgBin) && (!isRoot || (spawnSync("id", ["nobody"]).status === 0 && spawnSync("which", ["runuser"]).status === 0));
const SKIP = canRun ? false : "PostgreSQL server binaries (and a non-root user to run them) are not available";
const asPg = (cmd, args, opts = {}) => (isRoot ? spawnSync("runuser", ["-u", "nobody", "--", cmd, ...args], { encoding: "utf8", ...opts }) : spawnSync(cmd, args, { encoding: "utf8", ...opts }));

let dir, sock;
const port = 5900 + (process.pid % 200);
const SETUP = "CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;";

function psql(sql, { file = false, role = null } = {}) {
  const args = ["-h", sock, "-p", String(port), "-U", "postgres", "-X", "-At", "-v", "ON_ERROR_STOP=1", "-q"];
  if (file) args.push("-f", sql); else args.push("-c", role ? `SET ROLE ${role}; ${sql}` : sql);
  const r = asPg(path.join(pgBin, "psql"), args);
  return { ok: r.status === 0, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}
const must = (r) => { assert.ok(r.ok, r.err); return r.out; };

before(() => {
  if (SKIP) return;
  dir = fs.mkdtempSync(path.join("/tmp", "pg35-"));
  sock = fs.mkdtempSync(path.join("/tmp", "s35-"));
  fs.chmodSync(dir, 0o777); fs.chmodSync(sock, 0o777);
  fs.writeFileSync(path.join(dir, "setup.sql"), SETUP);
  for (const [name, f] of [["m30.sql", "30_operator_security.sql"], ["m34.sql", "34_operator_users.sql"], ["m35.sql", "35_operator_change_requests.sql"]]) fs.copyFileSync(path.join(root, "migrations", f), path.join(dir, name));
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
const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const req = (extra = "", proposed = `'{"price":12}'`) => `INSERT INTO operator_change_requests(house, resource, operation, entity, entity_id, requested_by, proposed${extra ? ", " + extra.split("|")[0] : ""}) VALUES ('health','products','products.price','products', 7, '${A}', ${proposed}${extra ? ", " + extra.split("|")[1] : ""}) RETURNING id`;

test("needs migrations 30 and 34, and changes nothing without them", { skip: SKIP }, () => {
  const r = psql(M(35), { file: true });
  assert.equal(r.ok, false);
  assert.match(r.err, /needs migrations 30 and 34/);
  must(psql(M(30), { file: true }));
  assert.equal(psql(M(35), { file: true }).ok, false, "30 alone is not enough");
  must(psql(M(34), { file: true }));
  must(psql(`INSERT INTO operator_users(id, username, display_name, password_hash, role, houses) VALUES ('${A}', 'asker', 'Asker', '${HASH}', 'product_manager', ARRAY['health']), ('${B}', 'boss', 'Boss', '${HASH}', 'owner', ARRAY['health','beauty'])`));
  must(psql("INSERT INTO operator_audit_log(panel, action) VALUES ('health','auth.login')"));
  assert.equal(must(psql("SELECT to_regclass('public.operator_change_requests') IS NULL")), "t");
});

test("applies, is idempotent, and is private", { skip: SKIP }, () => {
  must(psql(M(35), { file: true }));
  must(psql(M(35), { file: true }));
  for (const role of ["anon", "authenticated"]) {
    assert.equal(psql("SELECT * FROM operator_change_requests", { role }).ok, false, `${role} must not read`);
    assert.equal(psql(`INSERT INTO operator_change_requests(house, resource, operation, entity, requested_by, proposed) VALUES ('health','products','products.price','products','${A}','{}')`, { role }).ok, false, `${role} must not write`);
  }
  assert.equal(must(psql("SELECT count(*) FROM pg_policies WHERE tablename = 'operator_change_requests'")), "0");
  assert.equal(must(psql("SELECT count(*) FROM operator_audit_log WHERE before IS NULL AND after IS NULL")), "1", "existing log rows are untouched");
});

test("CHECKs: house, resource, proposed must be an object, reasons bounded", { skip: SKIP }, () => {
  const bad = (sql) => assert.equal(psql(sql).ok, false, sql);
  bad(`INSERT INTO operator_change_requests(house, resource, operation, entity, requested_by, proposed) VALUES ('mars','products','products.price','products','${A}','{}')`);
  bad(`INSERT INTO operator_change_requests(house, resource, operation, entity, requested_by, proposed) VALUES ('health','spaceships','products.price','products','${A}','{}')`);
  bad(`INSERT INTO operator_change_requests(house, resource, operation, entity, requested_by, proposed) VALUES ('health','products','products.price','products','${A}','[1]')`);
  bad(`INSERT INTO operator_change_requests(house, resource, operation, entity, requested_by, proposed, request_reason) VALUES ('health','products','products.price','products','${A}','{}', '${"x".repeat(501)}')`);
  bad(`INSERT INTO operator_change_requests(house, resource, operation, entity, requested_by, proposed, status, reviewed_by, reviewed_at) VALUES ('health','products','products.price','products','${A}','{}', 'pending', '${B}', now())`);
  bad(`INSERT INTO operator_change_requests(house, resource, operation, entity, requested_by, proposed, status) VALUES ('health','products','products.price','products','${A}','{}', 'approved')`);
});

test("the approval state machine: decided once, the asker never decides, a rejection needs a reason", { skip: SKIP }, () => {
  const id = must(psql(req())).split("\n")[0];
  const upd = (set) => psql(`UPDATE operator_change_requests SET ${set} WHERE id = '${id}'`);
  assert.equal(upd(`status = 'approved', reviewed_by = '${A}', reviewed_at = now()`).ok, false, "the asker approving his own request");
  assert.equal(upd(`status = 'rejected', reviewed_by = '${B}', reviewed_at = now()`).ok, false, "a rejection without a reason");
  assert.equal(upd(`status = 'rejected', reviewed_by = '${B}', reviewed_at = now(), review_reason = 'no'`).ok, false, "a reason of two characters");
  assert.equal(upd("proposed = '{\"price\":999}'").ok, false, "a pending request is not edited");
  assert.equal(upd(`status = 'approved', reviewed_by = '${B}', reviewed_at = now()`).ok, true);
  // decided: frozen, except executed_at once and approved → failed
  assert.equal(upd("review_reason = 'changed my mind'").ok, false);
  assert.equal(upd("proposed = '{}'").ok, false);
  assert.equal(upd("status = 'pending', reviewed_by = NULL, reviewed_at = NULL").ok, false, "no way back to pending");
  assert.equal(upd("executed_at = now()").ok, true, "the execution stamp is set once");
  assert.equal(upd("executed_at = now() + interval '1 day'").ok, false, "… and not moved");
  assert.equal(psql(`DELETE FROM operator_change_requests WHERE id = '${id}'`, { role: "service_role" }).ok, false, "never deleted");

  const id2 = must(psql(req("", `'{"price":13}'`))).split("\n")[0];
  assert.equal(psql(`UPDATE operator_change_requests SET status = 'failed', exec_error = 'x' WHERE id = '${id2}'`).ok, false, "pending → failed is not a thing");
  must(psql(`UPDATE operator_change_requests SET status = 'approved', reviewed_by = '${B}', reviewed_at = now() WHERE id = '${id2}'`));
  assert.equal(psql(`UPDATE operator_change_requests SET status = 'failed' WHERE id = '${id2}'`).ok, false, "a failure needs its error text");
  assert.equal(psql(`UPDATE operator_change_requests SET status = 'failed', exec_error = 'record changed' WHERE id = '${id2}'`).ok, true);
  assert.equal(psql(`UPDATE operator_change_requests SET status = 'approved' WHERE id = '${id2}'`).ok, false, "failed stays failed");

  const id3 = must(psql(req("", `'{"price":14}'`))).split("\n")[0];
  assert.equal(psql(`UPDATE operator_change_requests SET status = 'rejected', reviewed_by = '${B}', reviewed_at = now(), review_reason = 'price is wrong' WHERE id = '${id3}'`).ok, true);
  assert.equal(psql(`UPDATE operator_change_requests SET status = 'approved' WHERE id = '${id3}'`).ok, false, "a rejection is final");
  const id4 = must(psql(req("", `'{"price":15}'`))).split("\n")[0];
  assert.equal(psql(`UPDATE operator_change_requests SET status = 'cancelled' WHERE id = '${id4}'`).ok, true, "the asker may withdraw");
  assert.equal(psql(`UPDATE operator_change_requests SET status = 'superseded' WHERE id = '${id4}'`).ok, false, "cancelled is final");
});

test("an identical pending request cannot be submitted twice; after it is decided it can be asked again", { skip: SKIP }, () => {
  const first = must(psql(req("", `'{"price":50}'`))).split("\n")[0];
  assert.equal(psql(req("", `'{"price":50}'`)).ok, false, "the same change twice while pending");
  assert.equal(psql(req("", `'{"price":51}'`)).ok, true, "a different change is another request");
  must(psql(`UPDATE operator_change_requests SET status = 'rejected', reviewed_by = '${B}', reviewed_at = now(), review_reason = 'not now' WHERE id = '${first}'`));
  assert.equal(psql(req("resubmitted_from|'" + first + "'", `'{"price":50}'`)).ok, true, "after the rejection the same change can be resubmitted");
});

test("the activity log is append-only, and carries before / after", { skip: SKIP }, () => {
  must(psql(`INSERT INTO operator_audit_log(panel, action, entity, before, after) VALUES ('health','product.update','products','{"price":10}','{"price":12}')`));
  assert.equal(psql("UPDATE operator_audit_log SET action = 'x'").ok, false);
  assert.equal(psql("DELETE FROM operator_audit_log", { role: "service_role" }).ok, false);
  assert.equal(psql("UPDATE operator_audit_log SET before = NULL", { role: "service_role" }).ok, false);
  assert.equal(must(psql("SELECT after->>'price' FROM operator_audit_log WHERE action = 'product.update'")), "12");
  must(psql("INSERT INTO operator_audit_log(panel, action) VALUES ('beauty','auth.login')"));      // appending still works
});

test("a migration that fails half-way leaves nothing half-applied", { skip: SKIP }, () => {
  must(psql("DROP TRIGGER operator_audit_log_append_only ON operator_audit_log"));
  must(psql("DROP TABLE operator_change_requests"));
  must(psql("ALTER TABLE operator_audit_log DROP COLUMN before, DROP COLUMN after"));
  must(psql("CREATE TABLE operator_change_requests (id integer)"));             // an incompatible leftover: the index on the queue must fail
  const r = psql(M(35), { file: true });
  assert.equal(r.ok, false);
  assert.equal(must(psql("SELECT count(*) FROM information_schema.columns WHERE table_name = 'operator_audit_log' AND column_name IN ('before','after')")), "0", "no column may stay behind");
  assert.equal(must(psql("SELECT count(*) FROM pg_trigger WHERE tgname = 'operator_audit_log_append_only'")), "0", "no trigger may stay behind");
});
