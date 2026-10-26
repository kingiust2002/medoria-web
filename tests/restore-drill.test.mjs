// The restore drill (scripts/self-host/restore-drill.sh) run for real in bash: a backup snapshot built from a
// REAL PostgreSQL dump, a `docker` stand-in that starts a REAL throw-away PostgreSQL cluster, and the real
// pg_restore/psql. What it proves: a good backup passes; a corrupted file, a wrong row count, an unreadable dump
// or a missing storage file each fail with a clear line; the throw-away database and the work copy are always
// removed; the backup itself is never modified. Skipped where PostgreSQL server binaries are not installed.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const DRILL = path.join(root, "scripts/self-host/restore-drill.sh");

const pgBin = ["/usr/lib/postgresql/17/bin", "/usr/lib/postgresql/16/bin", "/usr/lib/postgresql/15/bin", "/usr/lib/postgresql/14/bin"].find((d) => fs.existsSync(path.join(d, "initdb")));
const isRoot = process.getuid?.() === 0;
const canRun = Boolean(pgBin) && (!isRoot || (spawnSync("id", ["nobody"]).status === 0 && spawnSync("which", ["runuser"]).status === 0));
const SKIP = canRun ? false : "PostgreSQL server binaries (and a non-root user to run them) are not available";

// run a PostgreSQL tool as a non-root user (PostgreSQL refuses to run as root)
const asPg = (cmd, args, opts = {}) => (isRoot ? spawnSync("runuser", ["-u", "nobody", "--", cmd, ...args], opts) : spawnSync(cmd, args, opts));

const STUB_DOCKER = `#!/usr/bin/env bash
# a docker stand-in: every "container" is a real throw-away PostgreSQL cluster
set -u
ROOT="$STUB_ROOT"; BIN="$PG_BIN"
pg() { if [ "$(id -u)" = 0 ]; then runuser -u nobody -- "$@"; else "$@"; fi; }
echo "docker $*" >> "$ROOT/docker.log"
cmd="$1"; shift
case "$cmd" in
  inspect) echo "fake/supabase-postgres:17" ;;
  run)
    name=""; while [ $# -gt 0 ]; do case "$1" in --name) name="$2"; shift 2 ;; *) shift ;; esac; done
    d="$ROOT/c-$name"; mkdir -p "$d/tmp" "$d/sock"; chmod -R 777 "$d"
    pg "$BIN/initdb" -D "$d/data" -U postgres -A trust >/dev/null 2>&1 || exit 1
    pg "$BIN/pg_ctl" -D "$d/data" -o "-p 5600 -k $d/sock -c listen_addresses=''" -l "$d/log" -w start >/dev/null 2>&1 || exit 1
    echo "stubid-$name" ;;
  exec)
    [ "$1" = "-i" ] && shift
    name="$1"; shift; d="$ROOT/c-$name"; tool="$1"; shift
    args=(); for a in "$@"; do args+=("\${a//\\/tmp\\//$d/tmp/}"); done
    pg "$BIN/$tool" -h "$d/sock" -p 5600 "\${args[@]}" ;;
  cp) src="$1"; dst="\${2#*:}"; name="\${2%%:*}"; cp "$src" "$ROOT/c-$name\${dst}" && chmod a+r "$ROOT/c-$name\${dst}" ;;
  rm)
    name=""; for a in "$@"; do case "$a" in -*) ;; *) name="$a" ;; esac; done
    d="$ROOT/c-$name"
    [ -d "$d" ] && { pg "$BIN/pg_ctl" -D "$d/data" -m immediate stop >/dev/null 2>&1; rm -rf "$d"; }
    exit 0 ;;
esac
`;

const STUB_RCLONE = `#!/usr/bin/env bash
case "$1" in
  lsf) ls -1 "$2" 2>/dev/null | sed 's#$#/#' ;;
  copy) mkdir -p "$3"; cp -r "$2/." "$3/" ;;
esac
`;

// A snapshot like production-backup.sh writes it, from a real database.
function buildSnapshot(sb, name = "20261025T020000Z", { products = 3, quotes = 2 } = {}) {
  const src = path.join(sb.dir, "src-cluster"), sock = path.join(sb.dir, "src-sock");
  if (!fs.existsSync(src)) {
    fs.mkdirSync(sock, { recursive: true }); fs.chmodSync(sock, 0o777);
    assert.equal(asPg(path.join(pgBin, "initdb"), ["-D", src, "-U", "postgres", "-A", "trust"]).status, 0);
    assert.equal(asPg(path.join(pgBin, "pg_ctl"), ["-D", src, "-o", `-p 5601 -k ${sock} -c listen_addresses=''`, "-l", path.join(sb.dir, "src.log"), "-w", "start"]).status, 0);
    sb.cleanups.push(() => asPg(path.join(pgBin, "pg_ctl"), ["-D", src, "-m", "immediate", "stop"]));
  }
  const psql = (sql) => asPg(path.join(pgBin, "psql"), ["-h", sock, "-p", "5601", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-c", sql]);
  psql("drop table if exists public.products, public.quote_requests; create table public.products(id int primary key, name text); create table public.quote_requests(id int primary key, status text);");
  psql(`insert into public.products select g, 'p'||g from generate_series(1,${products}) g; insert into public.quote_requests select g, 'new' from generate_series(1,${quotes}) g;`);

  const snap = path.join(sb.dir, "backups", name);
  fs.mkdirSync(path.join(snap, "storage/stub/stub/b/o"), { recursive: true });
  fs.writeFileSync(path.join(snap, "storage/stub/stub/b/o/v"), "image-bytes\n");
  const dump = (file, extra) => {
    const r = asPg(path.join(pgBin, "pg_dump"), ["-h", sock, "-p", "5601", "-U", "postgres", "-d", "postgres", "-Fc", "-f", path.join(sb.dir, "tmp-dump"), ...extra]);
    assert.equal(r.status, 0, String(r.stderr));
    fs.copyFileSync(path.join(sb.dir, "tmp-dump"), path.join(snap, file));
  };
  dump("database-full.dump", []);
  dump("database-public.dump", ["--schema=public"]);
  fs.writeFileSync(path.join(snap, "database-counts.txt"), `products=${products}\nquote_requests=${quotes}\nstorage.objects=1\n`);
  fs.writeFileSync(path.join(snap, "manifest.txt"), `snapshot=${name}\nstorage_files=1\n`);
  sealChecksums(snap);
  return snap;
}

function sealChecksums(snap) {
  const r = spawnSync("bash", ["-c", "cd \"$1\" && find . -type f ! -name checksums.sha256 -print0 | sort -z | xargs -0 sha256sum > checksums.sha256", "x", snap]);
  assert.equal(r.status, 0);
}

function sandbox() {
  const base = isRoot ? "/tmp" : os.tmpdir();   // a directory the non-root PostgreSQL user can traverse
  const dir = fs.mkdtempSync(path.join(base, "medoria-drill-"));
  fs.chmodSync(dir, 0o777);
  const cleanups = [];
  const w = (rel, content, mode) => { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, content, { mode }); return f; };
  w("stub/docker", STUB_DOCKER, 0o755);
  w("stub/rclone", STUB_RCLONE, 0o755);
  fs.mkdirSync(path.join(dir, "docker-root"), { recursive: true }); fs.chmodSync(path.join(dir, "docker-root"), 0o777);
  const env = (extra = {}) => ({
    PATH: `${path.join(dir, "stub")}:${process.env.PATH}`, HOME: dir, STUB_ROOT: path.join(dir, "docker-root"), PG_BIN: pgBin,
    BACKUP_ROOT: path.join(dir, "backups"), WORK_ROOT: path.join(dir, "work"), R2_REMOTE: path.join(dir, "remote"),
    BACKUP_ALERT_ENV: path.join(dir, "alerts.env"), RCLONE_CONFIG: path.join(dir, "rclone.conf"), READY_TIMEOUT: "30", PING_RETRY_DELAY: "0", ...extra,
  });
  return { dir, w, env, cleanups, cleanup: () => { for (const c of cleanups) try { c(); } catch { /* best effort */ } spawnSync("chmod", ["-R", "u+rwX,a+rX", dir]); fs.rmSync(dir, { recursive: true, force: true }); } };
}

function run(sb, args = [], extra = {}) {
  return new Promise((resolve) => {
    const p = spawn("bash", [DRILL, ...args], { env: sb.env(extra), stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (d) => { out += d; });
    p.stderr.on("data", (d) => { err += d; });
    p.on("exit", (code) => resolve({ code, out, err, all: out + err }));
  });
}

const dockerLog = (sb) => (fs.existsSync(path.join(sb.dir, "docker-root/docker.log")) ? fs.readFileSync(path.join(sb.dir, "docker-root/docker.log"), "utf8") : "");
const leftovers = (sb) => fs.readdirSync(path.join(sb.dir, "docker-root")).filter((f) => f.startsWith("c-"));
const hashTree = (dir) => spawnSync("bash", ["-c", "cd \"$1\" && find . -type f -print0 | sort -z | xargs -0 sha256sum | sha256sum", "x", dir], { encoding: "utf8" }).stdout;

test("a good backup passes every check, the backup is not modified, and everything temporary is removed", { skip: SKIP, timeout: 180000 }, async () => {
  const sb = sandbox();
  try {
    const snap = buildSnapshot(sb);
    const before = hashTree(snap);
    const r = await run(sb);
    assert.equal(r.code, 0, r.all);
    for (const k of ["RESTORE_DRILL_CHECKSUMS=PASS", "RESTORE_DRILL_RESTORE=PASS", "RESTORE_DRILL_COUNTS=PASS", "RESTORE_DRILL_STORAGE=PASS", "RESTORE_DRILL_FULL_DUMP=PASS", "RESTORE_DRILL=PASS"]) assert.ok(r.out.includes(k), `${k} missing:\n${r.all}`);
    assert.match(r.out, /RESTORE_DRILL_SNAPSHOT=20261025T020000Z source=local/);
    assert.match(r.out, /2 tables match/);
    assert.equal(hashTree(snap), before, "the drill modified the backup");
    assert.deepEqual(leftovers(sb), [], "the throw-away database was not removed");
    assert.deepEqual(fs.readdirSync(path.join(sb.dir, "work")), [], "the work copy was not removed");
    // safety: it never talked to the production container except to read its image name, and published no port
    const log = dockerLog(sb);
    assert.match(log, /docker inspect -f \{\{\.Config\.Image\}\} supabase-db/);
    assert.ok(!/exec .*supabase-db/.test(log) && !/-p \d+:\d+|--publish/.test(log));
    assert.match(log, /--network none/);
  } finally { sb.cleanup(); }
});

test("a corrupted backup file stops the drill before anything is started", { skip: SKIP, timeout: 180000 }, async () => {
  const sb = sandbox();
  try {
    const snap = buildSnapshot(sb);
    fs.appendFileSync(path.join(snap, "database-public.dump"), "tampered");
    const r = await run(sb);
    assert.equal(r.code, 1);
    assert.match(r.out, /RESTORE_DRILL_CHECKSUMS=FAIL/);
    assert.match(r.out, /RESTORE_DRILL=FAIL/);
    assert.ok(!/docker run/.test(dockerLog(sb)), "a database was started for a corrupted backup");
  } finally { sb.cleanup(); }
});

test("a wrong row count is reported with the table and both numbers", { skip: SKIP, timeout: 180000 }, async () => {
  const sb = sandbox();
  try {
    const snap = buildSnapshot(sb);
    fs.writeFileSync(path.join(snap, "database-counts.txt"), "products=99\nquote_requests=2\nstorage.objects=1\n");
    sealChecksums(snap);                         // a consistent snapshot whose recorded counts do not match its data
    const r = await run(sb);
    assert.equal(r.code, 1, r.all);
    assert.match(r.out, /count mismatch: products expected 99, restored 3/);
    assert.match(r.out, /RESTORE_DRILL_COUNTS=FAIL/);
    assert.match(r.out, /RESTORE_DRILL_RESTORE=PASS/, "the restore itself was fine");
    assert.deepEqual(leftovers(sb), [], "the throw-away database was not removed after a failure");
  } finally { sb.cleanup(); }
});

test("an unreadable dump fails the restore step", { skip: SKIP, timeout: 180000 }, async () => {
  const sb = sandbox();
  try {
    const snap = buildSnapshot(sb);
    fs.writeFileSync(path.join(snap, "database-public.dump"), "this is not a dump");
    sealChecksums(snap);
    const r = await run(sb);
    assert.equal(r.code, 1);
    assert.match(r.out, /RESTORE_DRILL_RESTORE=FAIL/);
    assert.match(r.out, /RESTORE_DRILL_COUNTS=FAIL/);
    assert.deepEqual(leftovers(sb), []);
  } finally { sb.cleanup(); }
});

test("missing storage files fail the storage check", { skip: SKIP, timeout: 180000 }, async () => {
  const sb = sandbox();
  try {
    const snap = buildSnapshot(sb);
    fs.rmSync(path.join(snap, "storage/stub"), { recursive: true });
    sealChecksums(snap);
    const r = await run(sb);
    assert.equal(r.code, 1);
    assert.match(r.out, /RESTORE_DRILL_STORAGE=FAIL \(manifest says 1, snapshot has 0\)/);
  } finally { sb.cleanup(); }
});

test("--snapshot picks that one, the default picks the newest, nonsense is refused, an empty folder fails clearly", { skip: SKIP, timeout: 240000 }, async () => {
  const sb = sandbox();
  try {
    buildSnapshot(sb, "20261001T020000Z", { products: 2, quotes: 1 });
    buildSnapshot(sb, "20261002T020000Z", { products: 5, quotes: 4 });
    const newest = await run(sb);
    assert.match(newest.out, /RESTORE_DRILL_SNAPSHOT=20261002T020000Z/);
    assert.equal(newest.code, 0, newest.all);
    const older = await run(sb, ["--snapshot", "20261001T020000Z"]);
    assert.match(older.out, /RESTORE_DRILL_SNAPSHOT=20261001T020000Z/);
    assert.equal(older.code, 0, older.all);
    assert.equal((await run(sb, ["--snapshot", "../../etc"])).code, 2);
    assert.equal((await run(sb, ["--bogus"])).code, 2);
    fs.rmSync(path.join(sb.dir, "backups"), { recursive: true });
    fs.mkdirSync(path.join(sb.dir, "backups"));
    const none = await run(sb);
    assert.equal(none.code, 1);
    assert.match(none.out, /no local snapshot/);
  } finally { sb.cleanup(); }
});

test("--from-r2 restores the encrypted copy that was read back", { skip: SKIP, timeout: 180000 }, async () => {
  const sb = sandbox();
  try {
    const snap = buildSnapshot(sb);
    fs.mkdirSync(path.join(sb.dir, "remote"), { recursive: true });
    spawnSync("cp", ["-r", snap, path.join(sb.dir, "remote", "20261025T020000Z")]);
    fs.rmSync(path.join(sb.dir, "backups"), { recursive: true });       // nothing local: it must come from the remote
    fs.mkdirSync(path.join(sb.dir, "backups"));
    fs.writeFileSync(path.join(sb.dir, "rclone.conf"), "[x]\n");
    const r = await run(sb, ["--from-r2"]);
    assert.equal(r.code, 0, r.all);
    assert.match(r.out, /RESTORE_DRILL_SNAPSHOT=20261025T020000Z source=r2-encrypted/);
  } finally { sb.cleanup(); }
});

test("the drill pings the alert service (start, then success or failure) and never prints the URL", { skip: SKIP, timeout: 240000 }, async () => {
  const sb = sandbox();
  const hits = [];
  const srv = http.createServer((req, res) => { let b = ""; req.on("data", (c) => { b += c; }); req.on("end", () => { hits.push({ path: req.url, body: b }); res.writeHead(200); res.end("ok"); }); });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const port = srv.address().port;
  try {
    sb.w("alerts.env", `RESTORE_DRILL_PING_URL=http://127.0.0.1:${port}/drill-secret-9\n`);
    const snap = buildSnapshot(sb);
    const ok = await run(sb);
    assert.equal(ok.code, 0, ok.all);
    assert.deepEqual(hits.map((h) => h.path), ["/drill-secret-9/start", "/drill-secret-9"]);
    hits.length = 0;
    fs.appendFileSync(path.join(snap, "database-counts.txt"), "x");
    const bad = await run(sb);
    assert.equal(bad.code, 1);
    assert.deepEqual(hits.map((h) => h.path), ["/drill-secret-9/start", "/drill-secret-9/fail"]);
    assert.match(hits[1].body, /checksum mismatch|FAILED/);
    assert.ok(!(ok.all + bad.all).includes("drill-secret-9") && !(ok.all + bad.all).includes(String(port)));
  } finally { await new Promise((r) => srv.close(r)); sb.cleanup(); }
});
