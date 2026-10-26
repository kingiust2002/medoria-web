// Migration 33 run for real on a throw-away PostgreSQL cluster (skipped where the server binaries are not
// installed): the column and its limits, idempotence, a skipped missing table, the private-table lock-down
// untouched, and nothing half-applied when the self-check fails.
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
const asPg = (cmd, args) => (isRoot ? spawnSync("runuser", ["-u", "nobody", "--", cmd, ...args], { encoding: "utf8" }) : spawnSync(cmd, args, { encoding: "utf8" }));

let dir, sock;
const port = 5900 + (process.pid % 90);
const SETUP = `
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE TABLE quote_requests (id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY, name text NOT NULL, message text);
CREATE TABLE beauty_quote_requests (LIKE quote_requests INCLUDING ALL);
ALTER TABLE quote_requests ENABLE ROW LEVEL SECURITY; ALTER TABLE beauty_quote_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON quote_requests, beauty_quote_requests FROM PUBLIC;
GRANT ALL ON quote_requests, beauty_quote_requests TO service_role;
INSERT INTO quote_requests (name) SELECT 'old ' || g FROM generate_series(1, 20) g;
`;

function psql(arg, { file = false, role = null } = {}) {
  const args = ["-h", sock, "-p", String(port), "-U", "postgres", "-X", "-At", "-v", "ON_ERROR_STOP=1", "-q", ...(file ? ["-f", arg] : ["-c", role ? `SET ROLE ${role}; ${arg}` : arg])];
  const r = asPg(path.join(pgBin, "psql"), args);
  return { ok: r.status === 0, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}
const must = (r) => { assert.ok(r.ok, r.err); return r.out; };
const M = () => path.join(dir, "m33.sql");

before(() => {
  if (SKIP) return;
  dir = fs.mkdtempSync("/tmp/pg33-"); sock = fs.mkdtempSync("/tmp/s33-");
  fs.chmodSync(dir, 0o777); fs.chmodSync(sock, 0o777);
  fs.writeFileSync(path.join(dir, "setup.sql"), SETUP); fs.chmodSync(path.join(dir, "setup.sql"), 0o644);
  fs.copyFileSync(path.join(root, "migrations/33_quote_items.sql"), M()); fs.chmodSync(M(), 0o644);
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

test("migration 33: adds items to both tables, keeps every row, second run changes nothing", { skip: SKIP }, () => {
  must(psql(M(), { file: true }));
  must(psql(M(), { file: true }));
  assert.equal(must(psql("SELECT count(*) FROM information_schema.columns WHERE column_name='items' AND data_type='jsonb' AND table_name IN ('quote_requests','beauty_quote_requests')")), "2");
  assert.equal(must(psql("SELECT count(*), count(items) FROM quote_requests")), "20|0", "old rows untouched, items NULL");
});

test("migration 33: a list of up to 30 is stored; more than 30, a non-array or an oversized value is refused", { skip: SKIP }, () => {
  const ins = (json) => psql(`INSERT INTO quote_requests(name, items) VALUES ('t', '${json}'::jsonb) RETURNING id`, { role: "service_role" });
  const item = '{"product_id":1,"sku":"S","name":"N","quantity":5}';
  assert.ok(ins(`[${Array(30).fill(item).join(",")}]`).ok, "30 items");
  assert.ok(ins("[]").ok, "an empty array is allowed (the server never sends one)");
  assert.equal(ins(`[${Array(31).fill(item).join(",")}]`).ok, false, "31 items");
  assert.equal(ins('{"a":1}').ok, false, "an object");
  assert.equal(ins('"text"').ok, false, "a string");
  assert.equal(ins(`[{"name":"${"x".repeat(20100)}"}]`).ok, false, "over 20000 characters");
  assert.ok(psql("INSERT INTO quote_requests(name, items) VALUES ('n', NULL)", { role: "service_role" }).ok, "NULL (single-product request)");
});

test("migration 33: the lock-down is untouched (service_role works, anon and authenticated do not)", { skip: SKIP }, () => {
  for (const role of ["anon", "authenticated"]) {
    assert.equal(psql("SELECT items FROM quote_requests LIMIT 1", { role }).ok, false, `${role} must not read`);
    assert.equal(psql("INSERT INTO quote_requests(name, items) VALUES ('x', '[]')", { role }).ok, false, `${role} must not insert`);
  }
  assert.equal(must(psql("SELECT count(*) FROM information_schema.role_table_grants WHERE table_name IN ('quote_requests','beauty_quote_requests') AND grantee IN ('PUBLIC','anon','authenticated')")), "0");
});

test("migration 33: a missing table is skipped; a failed self-check leaves nothing half-applied", { skip: SKIP }, () => {
  must(psql("DROP TABLE beauty_quote_requests"));
  must(psql(M(), { file: true }));
  must(psql("ALTER TABLE quote_requests DROP CONSTRAINT quote_requests_items_check; ALTER TABLE quote_requests DROP COLUMN items"));
  must(psql("GRANT SELECT ON quote_requests TO anon"));
  const r = psql(M(), { file: true });
  assert.equal(r.ok, false);
  assert.match(r.err, /self-check failed/);
  assert.equal(must(psql("SELECT count(*) FROM information_schema.columns WHERE table_name='quote_requests' AND column_name='items'")), "0", "the column must not survive a failed run");
});
