// Migration 42 (site content: banner and FAQ) run for real on a throw-away PostgreSQL cluster (skipped where the server binaries are not
// installed). Proves: it needs migration 34; it is idempotent; the public (anon / authenticated) sees ONLY live rows — published, inside the
// publish / unpublish window — and only the public columns (never who edited, never the draft flags); nobody but service_role writes; house
// and kind never change; every update bumps the version; a bad window or an oversized document is refused.
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
const port = 7300 + (process.pid % 200);
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
  dir = fs.mkdtempSync(path.join("/tmp", "pg42-"));
  sock = fs.mkdtempSync(path.join("/tmp", "s42-"));
  fs.chmodSync(dir, 0o777); fs.chmodSync(sock, 0o777);
  fs.writeFileSync(path.join(dir, "setup.sql"), SETUP);
  for (const [name, f] of [["m30.sql", "30_operator_security.sql"], ["m34.sql", "34_operator_users.sql"], ["m42.sql", "42_site_content.sql"]]) fs.copyFileSync(path.join(root, "migrations", f), path.join(dir, name));
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


const sc = (sql, o = {}) => psql(sql, { role: "service_role", ...o });
const ins = (cols, vals) => sc(`INSERT INTO site_content(${cols}) VALUES (${vals})`);

test("needs migration 34, and changes nothing without it", { skip: SKIP }, () => {
  const r = psql(M(42), { file: true });
  assert.equal(r.ok, false); assert.match(r.err, /needs migration 34/);
  must(psql(M(30), { file: true })); must(psql(M(34), { file: true }));
});

test("applies and is idempotent", { skip: SKIP }, () => {
  must(psql(M(42), { file: true })); must(psql(M(42), { file: true }));
  assert.equal(must(psql("SELECT count(*) FROM pg_policies WHERE tablename = 'site_content'")), "1");
});

test("the public sees only LIVE rows: published and inside the window", { skip: SKIP }, () => {
  const D = `'{"text":{"tg":"x"}}'`;
  must(ins("house, kind, data, is_published", `'health', 'banner', ${D}, true`));                                           // 1 live
  must(ins("house, kind, data, is_published", `'health', 'banner', ${D}, false`));                                          // 2 draft
  must(ins("house, kind, data, is_published, publish_at", `'health', 'banner', ${D}, true, now() + interval '1 hour'`));  // 3 not yet
  must(ins("house, kind, data, is_published, unpublish_at", `'health', 'banner', ${D}, true, now() - interval '1 hour'`)); // 4 ended
  must(ins("house, kind, data, is_published, publish_at, unpublish_at", `'beauty', 'faq', ${D}, true, now() - interval '1 hour', now() + interval '1 hour'`)); // 5 live window
  for (const role of ["anon", "authenticated"]) {
    assert.equal(must(psql("SELECT string_agg(id::text, ',' ORDER BY id) FROM site_content", { role })), "1,5", role);
  }
  assert.equal(must(sc("SELECT count(*) FROM site_content")), "5", "service_role sees every row");
  // time passes: the 'not yet' row goes live without anybody touching it
  must(sc("UPDATE site_content SET publish_at = now() - interval '1 minute' WHERE id = 3"));
  assert.equal(must(psql("SELECT string_agg(id::text, ',' ORDER BY id) FROM site_content", { role: "anon" })), "1,3,5");
});

test("the public reads only the public columns", { skip: SKIP }, () => {
  for (const role of ["anon", "authenticated"]) {
    assert.equal(psql("SELECT id, house, kind, data, sort_order FROM site_content", { role }).ok, true);
    for (const col of ["created_by", "updated_by", "updated_label", "is_published", "publish_at", "unpublish_at", "version", "created_at"]) {
      assert.equal(psql(`SELECT ${col} FROM site_content`, { role }).ok, false, `${role} reads ${col}`);
    }
    assert.equal(psql("SELECT * FROM site_content", { role }).ok, false, "select * is refused, the app names its columns");
  }
});

test("nobody but service_role writes", { skip: SKIP }, () => {
  for (const role of ["anon", "authenticated"]) {
    assert.equal(psql("INSERT INTO site_content(house, kind) VALUES ('health', 'faq')", { role }).ok, false);
    assert.equal(psql("UPDATE site_content SET sort_order = 1", { role }).ok, false);
    assert.equal(psql("DELETE FROM site_content", { role }).ok, false);
  }
  assert.equal(psql("SELECT site_content_guard()", { role: "anon" }).ok, false, "the trigger function is not callable by the public");
});

test("house and kind are fixed, every update bumps the version, bad rows are refused", { skip: SKIP }, () => {
  assert.equal(sc("UPDATE site_content SET house = 'beauty' WHERE id = 1").ok, false);
  assert.equal(sc("UPDATE site_content SET kind = 'faq' WHERE id = 1").ok, false);
  assert.equal(must(sc("SELECT version FROM site_content WHERE id = 1")), "1");
  must(sc("UPDATE site_content SET sort_order = 5 WHERE id = 1"));
  must(sc("UPDATE site_content SET sort_order = 6 WHERE id = 1"));
  assert.equal(must(sc("SELECT version FROM site_content WHERE id = 1")), "3");
  assert.equal(ins("house, kind, publish_at, unpublish_at", "'health', 'banner', now(), now() - interval '1 day'").ok, false, "ends before it starts");
  assert.equal(ins("house, kind", "'mars', 'banner'").ok, false);
  assert.equal(ins("house, kind", "'health', 'popup'").ok, false);
  assert.equal(ins("house, kind, data", "'health', 'faq', '[]'").ok, false, "data is an object");
  assert.equal(ins("house, kind, data", `'health', 'faq', jsonb_build_object('a', repeat('x', 13000))`).ok, false, "oversized document");
  assert.equal(ins("house, kind, sort_order", "'health', 'faq', 1000000").ok, false);
});
