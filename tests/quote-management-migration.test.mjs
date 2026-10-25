// Migration 32 run for real on a throw-away PostgreSQL cluster (skipped where the server binaries
// are not installed). What it proves, beyond the static guards in quote-management.test.mjs:
//   * existing rows get unique codes and keep their updated_at; a second run changes nothing
//   * service_role can still INSERT (the code is assigned by a trigger it needs no rights for);
//     anon / authenticated still cannot read or write, nor call the generator
//   * first_response_at is set once, by an answer, never by archive/spam
//   * assigned_to / notify_* are bounded by CHECKs
//   * a failed migration leaves nothing half-applied
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const MIGRATION = path.join(root, "migrations/32_quote_management.sql");

const pgBin = ["/usr/lib/postgresql/17/bin", "/usr/lib/postgresql/16/bin", "/usr/lib/postgresql/15/bin", "/usr/lib/postgresql/14/bin"].find((d) => fs.existsSync(path.join(d, "initdb")));
const isRoot = process.getuid?.() === 0;
const canRun = Boolean(pgBin) && (!isRoot || (spawnSync("id", ["nobody"]).status === 0 && spawnSync("which", ["runuser"]).status === 0));
const SKIP = canRun ? false : "PostgreSQL server binaries (and a non-root user to run them) are not available";

const asPg = (cmd, args, opts = {}) => (isRoot ? spawnSync("runuser", ["-u", "nobody", "--", cmd, ...args], { encoding: "utf8", ...opts }) : spawnSync(cmd, args, { encoding: "utf8", ...opts }));

let dir, sock;
const port = 5700 + (process.pid % 200);

const SETUP = `
CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
CREATE TABLE quote_requests (id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), name text NOT NULL, status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','in_progress','quoted','closed','archived','spam')));
CREATE TABLE beauty_quote_requests (LIKE quote_requests INCLUDING ALL);
CREATE TRIGGER trg_quote_requests_updated_at BEFORE UPDATE ON quote_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_beauty_quotes_updated_at BEFORE UPDATE ON beauty_quote_requests FOR EACH ROW EXECUTE FUNCTION set_updated_at();
ALTER TABLE quote_requests ENABLE ROW LEVEL SECURITY; ALTER TABLE beauty_quote_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON quote_requests, beauty_quote_requests FROM PUBLIC;
GRANT ALL ON quote_requests, beauty_quote_requests TO service_role;
INSERT INTO quote_requests (name, updated_at) SELECT 'old ' || g, '2026-01-01' FROM generate_series(1, 50) g;
INSERT INTO beauty_quote_requests (name, updated_at) SELECT 'old ' || g, '2026-01-01' FROM generate_series(1, 20) g;
`;

function psql(sql, { file = false, role = null } = {}) {
  const args = ["-h", sock, "-p", String(port), "-U", "postgres", "-X", "-At", "-v", "ON_ERROR_STOP=1", "-q"];
  if (file) args.push("-f", sql); else args.push("-c", role ? `SET ROLE ${role}; ${sql}` : sql);
  const r = asPg(path.join(pgBin, "psql"), args);
  return { ok: r.status === 0, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}
const must = (r) => { assert.ok(r.ok, r.err); return r.out; };

before(() => {
  if (SKIP) return;
  dir = fs.mkdtempSync(path.join("/tmp", "pg32-"));
  sock = fs.mkdtempSync(path.join("/tmp", "s32-"));
  fs.chmodSync(dir, 0o777); fs.chmodSync(sock, 0o777);
  fs.writeFileSync(path.join(dir, "setup.sql"), SETUP); fs.chmodSync(path.join(dir, "setup.sql"), 0o644);
  fs.copyFileSync(MIGRATION, path.join(dir, "m32.sql")); fs.chmodSync(path.join(dir, "m32.sql"), 0o644);
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

const M = () => path.join(dir, "m32.sql");

test("migration 32: codes for existing rows, updated_at untouched, second run changes nothing", { skip: SKIP }, () => {
  must(psql(M(), { file: true }));
  const first = must(psql("SELECT count(*), count(DISTINCT tracking_code), count(*) FILTER (WHERE updated_at <> '2026-01-01'), bool_and(tracking_code ~ '^MH-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$') FROM quote_requests"));
  assert.equal(first, "50|50|0|t");
  const beauty = must(psql("SELECT count(*), count(DISTINCT tracking_code), bool_and(tracking_code ~ '^MB-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$') FROM beauty_quote_requests"));
  assert.equal(beauty, "20|20|t");
  const before = must(psql("SELECT string_agg(tracking_code, ',' ORDER BY id) FROM quote_requests"));
  must(psql(M(), { file: true }));
  assert.equal(must(psql("SELECT string_agg(tracking_code, ',' ORDER BY id) FROM quote_requests")), before, "a re-run must keep every code");
  assert.equal(must(psql("SELECT count(*) FROM pg_trigger WHERE tgname LIKE '%tracking_code' OR tgname LIKE '%first_response'")), "4");
});

test("migration 32: service_role inserts get a code; anon/authenticated stay locked out", { skip: SKIP }, () => {
  assert.match(must(psql("INSERT INTO quote_requests(name) VALUES ('svc') RETURNING tracking_code", { role: "service_role" })).split("\n")[0], /^MH-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);
  assert.match(must(psql("INSERT INTO beauty_quote_requests(name) VALUES ('svcb') RETURNING tracking_code", { role: "service_role" })).split("\n")[0], /^MB-/);
  for (const role of ["anon", "authenticated"]) {
    assert.equal(psql("SELECT tracking_code FROM quote_requests LIMIT 1", { role }).ok, false, `${role} must not read`);
    assert.equal(psql("INSERT INTO quote_requests(name) VALUES ('x')", { role }).ok, false, `${role} must not insert`);
    assert.equal(psql("SELECT public.quote_new_tracking_code('MH')", { role }).ok, false, `${role} must not call the generator`);
  }
  assert.equal(must(psql("SELECT count(*) FROM information_schema.role_table_grants WHERE table_name IN ('quote_requests','beauty_quote_requests') AND grantee IN ('PUBLIC','anon','authenticated')")), "0");
});

test("migration 32: first_response_at is set once, by an answer, never by archive or spam", { skip: SKIP }, () => {
  must(psql("INSERT INTO quote_requests(name) VALUES ('fr')"));
  const set = (status) => must(psql(`UPDATE quote_requests SET status='${status}' WHERE name='fr' RETURNING first_response_at IS NOT NULL`, { role: "service_role" }));
  assert.equal(set("archived"), "f");
  assert.equal(set("spam"), "f");
  assert.equal(set("contacted"), "t");
  const stamp = must(psql("SELECT first_response_at FROM quote_requests WHERE name='fr'"));
  assert.equal(set("quoted"), "t");
  assert.equal(must(psql("SELECT first_response_at FROM quote_requests WHERE name='fr'")), stamp, "the first answer's time must not move");
});

test("migration 32: assigned_to and notify_* are bounded", { skip: SKIP }, () => {
  const upd = (set) => psql(`UPDATE quote_requests SET ${set} WHERE name='fr'`);
  assert.equal(upd(`assigned_to = '${"x".repeat(60)}'`).ok, true);
  assert.equal(upd(`assigned_to = '${"x".repeat(61)}'`).ok, false);
  assert.equal(upd("notify_status = 'failed', notify_detail = 'http_401'").ok, true);
  assert.equal(upd("notify_status = 'weird'").ok, false);
  assert.equal(upd(`notify_detail = '${"x".repeat(41)}'`).ok, false);
});

test("migration 32 is skipped cleanly for a table that does not exist, and rolls back as a whole on a failure", { skip: SKIP }, () => {
  must(psql("DROP TABLE beauty_quote_requests"));
  must(psql(M(), { file: true }));                                                   // Health only: no error
  must(psql("ALTER TABLE quote_requests DROP COLUMN tracking_code, DROP COLUMN assigned_to, DROP COLUMN first_response_at, DROP COLUMN notify_status, DROP COLUMN notify_detail"));
  // make the self-check fail: a grant to a public role on the table
  must(psql("GRANT SELECT ON quote_requests TO anon"));
  const r = psql(M(), { file: true });
  assert.equal(r.ok, false);
  assert.match(r.err, /self-check failed/);
  assert.equal(must(psql("SELECT count(*) FROM information_schema.columns WHERE table_name='quote_requests' AND column_name='tracking_code'")), "0", "nothing may stay half-applied");
});
