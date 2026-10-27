// Migration 41 (stock counts and minimum levels) run for real on a throw-away PostgreSQL cluster (skipped where the server binaries are not
// installed). Proves: it needs migration 36; it is idempotent and private; one open count per warehouse; a count is decided once and then
// frozen together with its lines; lines of a closed count cannot change; expected quantities never change; counts are never deleted.
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
const port = 7100 + (process.pid % 200);
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
  dir = fs.mkdtempSync(path.join("/tmp", "pg41-"));
  sock = fs.mkdtempSync(path.join("/tmp", "s41-"));
  fs.chmodSync(dir, 0o777); fs.chmodSync(sock, 0o777);
  fs.writeFileSync(path.join(dir, "setup.sql"), SETUP);
  for (const [name, f] of [["m30.sql", "30_operator_security.sql"], ["m34.sql", "34_operator_users.sql"], ["m36.sql", "36_warehouse.sql"], ["m41.sql", "41_warehouse_counts.sql"]]) fs.copyFileSync(path.join(root, "migrations", f), path.join(dir, name));
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
const sc = (sql, o = {}) => psql(sql, { role: "service_role", ...o });

test("needs migration 36, and changes nothing without it", { skip: SKIP }, () => {
  must(psql(M(30), { file: true })); must(psql(M(34), { file: true }));
  const r = psql(M(41), { file: true });
  assert.equal(r.ok, false); assert.match(r.err, /needs migration 36/);
  must(psql("CREATE TABLE public.products (id BIGINT PRIMARY KEY, sku TEXT); CREATE TABLE public.beauty_products (id BIGINT PRIMARY KEY, sku TEXT); INSERT INTO products VALUES (1,'H-1'),(2,'H-2');"));
  must(psql(M(36), { file: true }));
  assert.equal(must(psql("SELECT to_regclass('public.health_stock_counts') IS NULL")), "t");
});

test("applies, is idempotent and private", { skip: SKIP }, () => {
  must(psql(M(41), { file: true })); must(psql(M(41), { file: true }));
  must(psql("INSERT INTO health_stock_locations(code, name) VALUES ('MAIN','Main'), ('SHOP','Shop'); INSERT INTO beauty_stock_locations(code, name) VALUES ('BMAIN','B')"));
  for (const h of ["health", "beauty"]) for (const t of ["stock_levels", "stock_counts", "stock_count_lines"]) {
    for (const role of ["anon", "authenticated"]) assert.equal(psql(`SELECT * FROM ${h}_${t}`, { role }).ok, false, `${role} reads ${h}_${t}`);
    assert.equal(must(psql(`SELECT count(*) FROM pg_policies WHERE tablename = '${h}_${t}'`)), "0");
    assert.equal(sc(`SELECT count(*) FROM ${h}_${t}`).ok, true);
  }
  assert.equal(sc("DELETE FROM health_stock_counts").ok, false, "service_role cannot delete counts");
});

test("levels: a non-negative bounded minimum per product", { skip: SKIP }, () => {
  assert.equal(sc("INSERT INTO health_stock_levels(product_id, min_level, updated_label) VALUES (1, 5, 'sara')").ok, true);
  assert.equal(sc("INSERT INTO health_stock_levels(product_id, min_level) VALUES (1, 6)").ok, false, "one level per product");
  assert.equal(sc("INSERT INTO health_stock_levels(product_id, min_level) VALUES (2, -1)").ok, false);
  assert.equal(sc("UPDATE health_stock_levels SET min_level = 8 WHERE product_id = 1").ok, true);
  assert.equal(sc("DELETE FROM health_stock_levels WHERE product_id = 1").ok, true, "a level can be removed");
});

test("one open count per warehouse; a count is decided once and then frozen with its lines", { skip: SKIP }, () => {
  const id = must(sc("INSERT INTO health_stock_counts(location_id, created_label) VALUES (1, 'sara') RETURNING id")).split("\n")[0];
  assert.equal(sc("INSERT INTO health_stock_counts(location_id) VALUES (1)").ok, false, "a second open count on the same warehouse");
  assert.equal(sc("INSERT INTO health_stock_counts(location_id) VALUES (2)").ok, true, "another warehouse is independent");
  assert.equal(sc(`INSERT INTO health_stock_count_lines(count_id, product_id, sku, expected) VALUES (${id}, 1, 'H-1', 10), (${id}, 2, 'H-2', 4)`).ok, true);
  assert.equal(sc(`INSERT INTO health_stock_count_lines(count_id, product_id, expected) VALUES (${id}, 3, -1)`).ok, false, "negative expected");
  assert.equal(sc(`UPDATE health_stock_count_lines SET counted = 9, counted_label = 'sara' WHERE count_id = ${id} AND product_id = 1`).ok, true);
  assert.equal(sc(`UPDATE health_stock_count_lines SET expected = 11 WHERE count_id = ${id} AND product_id = 1`).ok, false, "what was expected never changes");
  assert.equal(sc(`UPDATE health_stock_count_lines SET counted = -2 WHERE count_id = ${id} AND product_id = 1`).ok, false);
  assert.equal(sc(`UPDATE health_stock_counts SET status = 'closed' WHERE id = ${id}`).ok, false, "closing needs closed_at");
  assert.equal(sc(`UPDATE health_stock_counts SET location_id = 2 WHERE id = ${id}`).ok, false, "a count never moves to another warehouse");
  assert.equal(sc(`UPDATE health_stock_counts SET status = 'closed', closed_at = now(), closed_label = 'sara', differences = 1 WHERE id = ${id}`).ok, true);
  for (const sql of [`UPDATE health_stock_counts SET note = 'x' WHERE id = ${id}`, `UPDATE health_stock_counts SET status = 'open', closed_at = NULL WHERE id = ${id}`, `DELETE FROM health_stock_counts WHERE id = ${id}`]) {
    const r = psql(sql); assert.equal(r.ok, false, sql);
  }
  for (const sql of [`UPDATE health_stock_count_lines SET counted = 1 WHERE count_id = ${id}`, `INSERT INTO health_stock_count_lines(count_id, product_id, expected) VALUES (${id}, 9, 1)`, `DELETE FROM health_stock_count_lines WHERE count_id = ${id}`]) {
    const r = sc(sql); assert.equal(r.ok, false, sql); assert.match(r.err, /count_closed/);
  }
  assert.equal(sc("INSERT INTO health_stock_counts(location_id) VALUES (1)").ok, true, "after closing, a new count can start");
});

test("a cancelled count is frozen too, and Beauty has its own tables", { skip: SKIP }, () => {
  const id = must(sc("INSERT INTO beauty_stock_counts(location_id) VALUES (1) RETURNING id")).split("\n")[0];
  assert.equal(sc(`UPDATE beauty_stock_counts SET status = 'cancelled', closed_at = now() WHERE id = ${id}`).ok, true);
  assert.equal(sc(`UPDATE beauty_stock_counts SET note = 'x' WHERE id = ${id}`).ok, false);
  assert.equal(must(psql("SELECT count(*) FROM health_stock_counts WHERE status = 'cancelled'")), "0");
});
