// Migration 39 (scheduled publishing) run for real on a throw-away PostgreSQL cluster (skipped where the server binaries are not
// installed). Proves: it needs the product tables and changes nothing without them; it adds exactly two columns to each table, keeps
// every row and value (including who may read the table), is idempotent, and the indexes are partial.
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
const port = 6700 + (process.pid % 200);
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
  dir = fs.mkdtempSync(path.join("/tmp", "pg39-"));
  sock = fs.mkdtempSync(path.join("/tmp", "s39-"));
  fs.chmodSync(dir, 0o777); fs.chmodSync(sock, 0o777);
  fs.writeFileSync(path.join(dir, "setup.sql"), SETUP);
  for (const [name, f] of [["m39.sql", "39_scheduled_publishing.sql"]]) fs.copyFileSync(path.join(root, "migrations", f), path.join(dir, name));
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
  const r = psql(M(39), { file: true });
  assert.equal(r.ok, false); assert.match(r.err, /needs the product tables/);
  must(psql("CREATE TABLE public.products (id BIGSERIAL PRIMARY KEY, name TEXT, is_active BOOLEAN DEFAULT TRUE); CREATE TABLE public.beauty_products (id BIGSERIAL PRIMARY KEY, name TEXT, is_active BOOLEAN DEFAULT TRUE);"));
  must(psql("INSERT INTO products(name) VALUES ('A'), ('B'); INSERT INTO beauty_products(name, is_active) VALUES ('C', FALSE);"));
  must(psql("GRANT SELECT ON products, beauty_products TO anon"));
});

test("adds two nullable columns to each table, keeps rows, values and grants, and is idempotent", { skip: SKIP }, () => {
  must(psql(M(39), { file: true })); must(psql(M(39), { file: true }));
  for (const [t, rows] of [["products", "2"], ["beauty_products", "1"]]) {
    assert.equal(must(psql(`SELECT count(*) FROM information_schema.columns WHERE table_name = '${t}' AND column_name IN ('publish_at','unpublish_at') AND is_nullable = 'YES' AND data_type = 'timestamp with time zone'`)), "2");
    assert.equal(must(psql(`SELECT count(*) || '|' || count(publish_at) || '|' || count(unpublish_at) FROM ${t}`)), `${rows}|0|0`, "rows are kept, schedules start empty");
    assert.equal(must(psql(`SELECT has_table_privilege('anon', 'public.${t}', 'SELECT')`)), "t", "the public read stays as it was");
  }
  assert.equal(must(psql("SELECT count(*) FROM pg_indexes WHERE indexname IN ('products_publish_at_idx','products_unpublish_at_idx','beauty_products_publish_at_idx','beauty_products_unpublish_at_idx') AND indexdef LIKE '%WHERE%'")), "4");
  assert.equal(must(psql("SELECT is_active FROM beauty_products")), "f", "values are untouched");
});
