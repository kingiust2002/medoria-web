// Migration 40 (translation status) run for real on a throw-away PostgreSQL cluster (skipped where the server binaries are not installed).
// Proves: it needs the product tables; it adds one NOT NULL object column with default '{}' to each, keeps every row and grant, is idempotent,
// and refuses a non-object or an oversized value.
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
const port = 6900 + (process.pid % 200);
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
  dir = fs.mkdtempSync(path.join("/tmp", "pg40-"));
  sock = fs.mkdtempSync(path.join("/tmp", "s40-"));
  fs.chmodSync(dir, 0o777); fs.chmodSync(sock, 0o777);
  fs.writeFileSync(path.join(dir, "setup.sql"), SETUP);
  for (const [name, f] of [["m40.sql", "40_translation_meta.sql"]]) fs.copyFileSync(path.join(root, "migrations", f), path.join(dir, name));
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


test("needs the product tables and changes nothing without them", { skip: SKIP }, () => {
  const r = psql(M(40), { file: true });
  assert.equal(r.ok, false); assert.match(r.err, /needs the product tables/);
  must(psql("CREATE TABLE public.products (id BIGSERIAL PRIMARY KEY, name TEXT); CREATE TABLE public.beauty_products (id BIGSERIAL PRIMARY KEY, name TEXT);"));
  must(psql("INSERT INTO products(name) VALUES ('A'), ('B'); INSERT INTO beauty_products(name) VALUES ('C'); GRANT SELECT ON products, beauty_products TO anon"));
});

test("adds translation_meta (object, default {}), keeps rows and grants, is idempotent, refuses junk", { skip: SKIP }, () => {
  must(psql(M(40), { file: true })); must(psql(M(40), { file: true }));
  for (const [t, n] of [["products", "2"], ["beauty_products", "1"]]) {
    assert.equal(must(psql(`SELECT count(*) || '|' || count(*) FILTER (WHERE translation_meta = '{}'::jsonb) FROM ${t}`)), `${n}|${n}`, "every existing text counts as human");
    assert.equal(must(psql(`SELECT has_table_privilege('anon', 'public.${t}', 'SELECT')`)), "t");
    assert.equal(psql(`UPDATE ${t} SET translation_meta = '{"name_tg":"auto"}'`).ok, true);
    assert.equal(psql(`UPDATE ${t} SET translation_meta = '[1]'`).ok, false, "an array is refused");
    assert.equal(psql(`UPDATE ${t} SET translation_meta = NULL`).ok, false, "NULL is refused");
    assert.equal(psql(`UPDATE ${t} SET translation_meta = jsonb_build_object('name_tg', repeat('x', 3000))`).ok, false, "oversized is refused");
  }
});
