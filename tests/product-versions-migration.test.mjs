// Migration 38 (product version history) run for real on a throw-away PostgreSQL cluster (skipped where the server binaries are not
// installed). Proves: it needs migration 34; it is idempotent and private; rows can be appended but never changed, deleted or
// truncated (even by a superuser's plain SQL); kinds and sizes are bounded; the history of a deleted product stays.
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
const port = 6500 + (process.pid % 200);
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
  dir = fs.mkdtempSync(path.join("/tmp", "pg38-"));
  sock = fs.mkdtempSync(path.join("/tmp", "s38-"));
  fs.chmodSync(dir, 0o777); fs.chmodSync(sock, 0o777);
  fs.writeFileSync(path.join(dir, "setup.sql"), SETUP);
  for (const [name, f] of [["m30.sql", "30_operator_security.sql"], ["m34.sql", "34_operator_users.sql"], ["m38.sql", "38_product_versions.sql"]]) fs.copyFileSync(path.join(root, "migrations", f), path.join(dir, name));
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
const ins = (t = "product_versions", extra = "") => `INSERT INTO ${t}(product_id, kind, changed, before, after, actor_label${extra ? ", " + extra.split("|")[0] : ""}) VALUES (7, 'update', ARRAY['price'], '{"price":10}', '{"price":12}', 'sara'${extra ? ", " + extra.split("|")[1] : ""}) RETURNING id`;

test("needs migration 34 and changes nothing without it", { skip: SKIP }, () => {
  const r = psql(M(38), { file: true });
  assert.equal(r.ok, false); assert.match(r.err, /needs migration 34/);
  must(psql(M(30), { file: true })); must(psql(M(34), { file: true }));
  assert.equal(must(psql("SELECT to_regclass('public.product_versions') IS NULL")), "t");
});

test("applies, is idempotent, private; service_role may append and read, nothing else", { skip: SKIP }, () => {
  must(psql(M(38), { file: true })); must(psql(M(38), { file: true }));
  for (const t of ["product_versions", "beauty_product_versions"]) {
    for (const role of ["anon", "authenticated"]) {
      assert.equal(psql(`SELECT * FROM ${t}`, { role }).ok, false, `${role} reads ${t}`);
      assert.equal(psql(ins(t), { role }).ok, false, `${role} writes ${t}`);
    }
    assert.equal(must(psql(`SELECT count(*) FROM pg_policies WHERE tablename = '${t}'`)), "0");
    assert.equal(psql(ins(t), { role: "service_role" }).ok, true);
    assert.equal(psql(`SELECT count(*) FROM ${t}`, { role: "service_role" }).ok, true);
    assert.equal(psql(`UPDATE ${t} SET kind = 'quick'`, { role: "service_role" }).ok, false);
    assert.equal(psql(`DELETE FROM ${t}`, { role: "service_role" }).ok, false);
  }
});

test("append-only even for a superuser; kinds and sizes are bounded; a revert points at what it reverts", { skip: SKIP }, () => {
  for (const sql of ["UPDATE product_versions SET kind = 'quick'", "DELETE FROM product_versions", "TRUNCATE product_versions"]) {
    const r = psql(sql); assert.equal(r.ok, false, sql); assert.match(r.err, /append-only/);
  }
  assert.equal(psql("INSERT INTO product_versions(product_id, kind) VALUES (1, 'teleport')").ok, false);
  assert.equal(psql("INSERT INTO product_versions(product_id, kind, before) VALUES (1, 'update', '[1]')").ok, false, "before must be an object");
  assert.equal(psql(`INSERT INTO product_versions(product_id, kind, before) VALUES (1, 'update', jsonb_build_object('big', repeat('x', 300000)))`).ok, false, "oversized snapshots are refused");
  assert.equal(psql(`INSERT INTO product_versions(product_id, kind, actor_label) VALUES (1, 'update', '${"x".repeat(81)}')`).ok, false);
  const id = must(psql(ins())).split("\n")[0];
  assert.equal(psql(`INSERT INTO product_versions(product_id, kind, reverts_id) VALUES (7, 'restore', ${id})`).ok, true);
  assert.equal(psql("INSERT INTO product_versions(product_id, kind, reverts_id) VALUES (7, 'restore', 999999)").ok, false);
});

test("the history needs no product row and survives the product (no foreign key to the product tables)", { skip: SKIP }, () => {
  assert.equal(must(psql(`SELECT count(*) FROM pg_constraint WHERE conrelid = 'product_versions'::regclass AND contype = 'f' AND confrelid <> 'operator_users'::regclass AND confrelid <> 'product_versions'::regclass`)), "0");
  must(psql(`INSERT INTO operator_users(id, username, display_name, password_hash, role, houses) VALUES ('${U}', 'sara', 'Sara', '${HASH}', 'product_manager', ARRAY['health'])`));
  assert.equal(psql(`INSERT INTO product_versions(product_id, kind, actor_user_id) VALUES (123456, 'update', '${U}')`).ok, true, "a product id that exists nowhere is fine");
});
