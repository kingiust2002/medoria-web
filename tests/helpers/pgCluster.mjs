// tests/helpers/pgCluster.mjs — a throw-away PostgreSQL cluster for migration tests (skipped where the server binaries are not installed).
//   const pg = createCluster("pg43", 7100);          // SKIP is false when a cluster can run here
//   before(() => pg.start({ migrations: { 43: "43_x.sql" } }));  after(() => pg.stop());
//   pg.psql("SELECT 1", { role: "service_role" })  → { ok, out, err };  pg.file(path)  ;  pg.async(sql, role)  → Promise<{ok,out,err}>
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { spawnSync, execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

export const root = fileURLToPath(new URL("../../", import.meta.url));
const pgBin = ["/usr/lib/postgresql/17/bin", "/usr/lib/postgresql/16/bin", "/usr/lib/postgresql/15/bin", "/usr/lib/postgresql/14/bin"].find((d) => fs.existsSync(path.join(d, "initdb")));
const isRoot = process.getuid?.() === 0;
const canRun = Boolean(pgBin) && (!isRoot || (spawnSync("id", ["nobody"]).status === 0 && spawnSync("which", ["runuser"]).status === 0));
export const SKIP = canRun ? false : "PostgreSQL server binaries (and a non-root user to run them) are not available";
const asPg = (cmd, args, opts = {}) => (isRoot ? spawnSync("runuser", ["-u", "nobody", "--", cmd, ...args], { encoding: "utf8", ...opts }) : spawnSync(cmd, args, { encoding: "utf8", ...opts }));
export const SETUP = "CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;";

export function createCluster(tag, basePort) {
  let dir = null, sock = null;
  const port = basePort + (process.pid % 200);
  const baseArgs = (db) => ["-h", sock, "-p", String(port), "-U", "postgres", "-d", db, "-X", "-At", "-v", "ON_ERROR_STOP=1", "-q"];
  const c = {
    SKIP,
    start({ migrations = {}, setup = SETUP } = {}) {
      if (SKIP) return;
      dir = fs.mkdtempSync(path.join("/tmp", `${tag}-`));
      sock = fs.mkdtempSync(path.join("/tmp", `s${tag}-`));
      fs.chmodSync(dir, 0o777); fs.chmodSync(sock, 0o777);
      fs.writeFileSync(path.join(dir, "setup.sql"), setup);
      for (const [n, f] of Object.entries(migrations)) fs.copyFileSync(path.join(root, "migrations", f), path.join(dir, `m${n}.sql`));
      for (const f of fs.readdirSync(dir)) fs.chmodSync(path.join(dir, f), 0o644);
      assert.equal(asPg(path.join(pgBin, "initdb"), ["-D", path.join(dir, "data"), "-U", "postgres", "-A", "trust"]).status, 0);
      const st = asPg(path.join(pgBin, "pg_ctl"), ["-D", path.join(dir, "data"), "-o", `-p ${port} -k ${sock} -c listen_addresses=''`, "-l", path.join(dir, "log"), "-w", "start"]);
      assert.equal(st.status, 0, st.stderr);
      c.must(c.psql(path.join(dir, "setup.sql"), { file: true }));
    },
    stop() {
      if (SKIP || !dir) return;
      asPg(path.join(pgBin, "pg_ctl"), ["-D", path.join(dir, "data"), "-m", "immediate", "stop"]);
      fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(sock, { recursive: true, force: true });
    },
    M: (n) => path.join(dir, `m${n}.sql`),
    psql(sql, { file = false, role = null, db = "postgres" } = {}) {
      const args = baseArgs(db);
      if (file) args.push("-f", sql); else args.push("-c", role ? `SET ROLE ${role}; ${sql}` : sql);
      const r = asPg(path.join(pgBin, "psql"), args);
      return { ok: r.status === 0, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
    },
    // two sessions that really overlap
    async(sql, role = "service_role") {
      const args = [...baseArgs("postgres"), "-c", `SET ROLE ${role}; ${sql}`];
      const [cmd, a] = isRoot ? ["runuser", ["-u", "nobody", "--", path.join(pgBin, "psql"), ...args]] : [path.join(pgBin, "psql"), args];
      return new Promise((resolve) => execFile(cmd, a, { encoding: "utf8" }, (err, stdout, stderr) => resolve({ ok: !err, out: (stdout || "").trim(), err: (stderr || "").trim() })));
    },
    // write SQL to a file in the cluster dir and run it (for multi-statement scripts with quoting)
    script(name, sql, opts = {}) { const p = path.join(dir, name); fs.writeFileSync(p, sql); fs.chmodSync(p, 0o644); return c.psql(p, { file: true, ...opts }); },
    must(r) { assert.ok(r.ok, r.err); return r.out; },
  };
  return c;
}
