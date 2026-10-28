// Backup and server heartbeat alerts (scripts/self-host/production-backup.sh and
// uptime-heartbeat.sh), run for real in bash with fake `docker` and `rclone` and a fake alert
// server that records every ping. What this proves: the right signal is sent in each situation
// (start / success / failure / stale / alert test), URLs never reach the output, a failing ping
// never breaks a backup, the config file cannot run code, and the working directory no longer
// matters. What it cannot prove: that an external service turns the signal into a message for you
// (that is the owner's test in docs/MONITORING_AND_ALERTS.md).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const BACKUP = path.join(root, "scripts/self-host/production-backup.sh");
const HEARTBEAT = path.join(root, "scripts/self-host/uptime-heartbeat.sh");
const SECRET = "hc-secret-token-4f9a";

const STUB_DOCKER = `#!/usr/bin/env bash
case "$1" in
  inspect) echo true ;;
  ps)
    [ "\${STUB_DOCKER_FAIL:-}" = ps ] && { echo "Cannot connect to the Docker daemon at unix:///var/run/docker.sock" >&2; exit 1; }
    [ "\${STUB_DOCKER_HANG:-}" = ps ] && sleep 30
    [ -n "\${STUB_UNHEALTHY:-}" ] && echo "\${STUB_UNHEALTHY}"; exit 0 ;;
  exec)
    all="$*"
    if   [[ "$all" == *pg_dumpall* ]]; then echo "-- globals"
    elif [[ "$all" == *pg_dump* ]]; then [ "\${STUB_FAIL:-}" = dump ] && exit 1; echo "PGDMP-stub"
    elif [[ "$all" == *pg_restore* ]]; then cat >/dev/null; echo ok
    elif [[ "$all" == *"from storage.objects"* ]]; then echo 1
    elif [[ "$all" == *psql* ]]; then echo "products=3"
    elif [[ "$all" == *"postgres --version"* ]]; then echo "postgres (PostgreSQL) 17.0"
    fi ;;
esac
`;
const STUB_RCLONE = `#!/usr/bin/env bash
case "$1" in
  mkdir) mkdir -p "$2" ;;
  lsf) ls -1 "$2" 2>/dev/null | sed 's#$#/#' ;;
  copy) mkdir -p "$3"; cp -r "$2/." "$3/" ;;
  check) diff -r "$2" "$3" >/dev/null ;;
  purge) rm -rf "$2" ;;
esac
`;

// A fake alert service: records every request, answers with `status`.
function alertServer() {
  const hits = [];
  let status = 200;
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => { hits.push({ method: req.method, path: req.url, body, auth: req.headers.authorization || "" }); res.writeHead(status); res.end("OK"); });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({
    port: server.address().port, hits, setStatus: (s) => { status = s; }, close: () => new Promise((r) => server.close(r)),
  })));
}

function run(cmd, args, { env = {}, cwd } = {}) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { env: { PATH: process.env.PATH, ...env }, cwd, stdio: ["ignore", "pipe", "pipe"] });
    let out = "", err = "";
    p.stdout.on("data", (d) => { out += d; });
    p.stderr.on("data", (d) => { err += d; });
    p.on("exit", (code) => resolve({ code, out, err, all: out + err }));
  });
}

function sandbox() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "medoria-bk-"));
  const w = (rel, content, mode) => { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, content, { mode }); return f; };
  w("bin/docker", STUB_DOCKER, 0o755);
  w("bin/rclone", STUB_RCLONE, 0o755);
  w("app/deploy/.env", "X=1\n"); w("app/deploy/Caddyfile", "x\n"); w("app/deploy/compose.app.yml", "x\n");
  w("sb/.env", "Y=1\n"); w("sb/volumes/storage/stub/stub/b/o/v", "file\n");
  w("rclone.conf", "[x]\n");
  const env = (extra = {}) => ({
    PATH: `${path.join(dir, "bin")}:${process.env.PATH}`, HOME: dir,
    APP_DIR: path.join(dir, "app"), SUPABASE_DIR: path.join(dir, "sb"),
    BACKUP_ROOT: path.join(dir, "backups/production-auto"), R2_REMOTE: path.join(dir, "remote/production-auto"),
    RCLONE_CONFIG: path.join(dir, "rclone.conf"), BACKUP_ALERT_ENV: path.join(dir, "alerts.env"), PING_RETRY_DELAY: "0", ...extra,
  });
  return { dir, w, env, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

const alerts = (srv, extra = "") => `BACKUP_PING_URL=http://127.0.0.1:${srv.port}/${SECRET}\nBACKUP_CHECK_PING_URL=http://127.0.0.1:${srv.port}/${SECRET}-check\n${extra}`;
const paths = (srv) => srv.hits.map((h) => h.path);

test("a successful backup sends start then success, and never prints the alert URL", async () => {
  const sb = sandbox(), srv = await alertServer();
  try {
    sb.w("alerts.env", alerts(srv));
    const r = await run("bash", [BACKUP], { env: sb.env() });
    assert.equal(r.code, 0, r.all);
    assert.match(r.out, /AUTO_BACKUP=PASS/);
    assert.deepEqual(paths(srv), [`/${SECRET}/start`, `/${SECRET}`]);
    assert.match(srv.hits[1].body, /PASS/);
    assert.ok(!r.all.includes(SECRET) && !r.all.includes(String(srv.port)), "the alert URL leaked into the output");
    assert.ok(fs.existsSync(path.join(sb.dir, "backups/production-auto/last-run.status")));
  } finally { await srv.close(); sb.cleanup(); }
});

test("a failed backup sends start then /fail with the failed step, and exits non-zero", async () => {
  const sb = sandbox(), srv = await alertServer();
  try {
    sb.w("alerts.env", alerts(srv));
    const r = await run("bash", [BACKUP], { env: sb.env({ STUB_FAIL: "dump" }) });
    assert.notEqual(r.code, 0);
    assert.match(r.all, /AUTO_BACKUP=FAIL/);
    assert.deepEqual(paths(srv), [`/${SECRET}/start`, `/${SECRET}/fail`]);
    assert.match(srv.hits[1].body, /FAILED at step: database dump/);
    assert.ok(!r.all.includes(SECRET));
  } finally { await srv.close(); sb.cleanup(); }
});

test("without alert configuration the backup works exactly as before (no pings, no warnings)", async () => {
  const sb = sandbox();
  try {
    const r = await run("bash", [BACKUP], { env: sb.env() });
    assert.equal(r.code, 0, r.all);
    assert.ok(!/WARNING|alert ping/.test(r.all), r.all);
  } finally { sb.cleanup(); }
});

test("a broken alert service never breaks the backup, it only logs a warning without the URL", async () => {
  const sb = sandbox(), srv = await alertServer();
  try {
    sb.w("alerts.env", alerts(srv));
    srv.setStatus(500);
    const r1 = await run("bash", [BACKUP], { env: sb.env() });
    assert.equal(r1.code, 0, r1.all);
    assert.match(r1.all, /WARNING: alert ping .* failed \(http 500\)/);
    await srv.close();                          // now: connection refused
    const r2 = await run("bash", [BACKUP], { env: sb.env() });
    assert.equal(r2.code, 0, r2.all);
    assert.match(r2.all, /WARNING: alert ping .* failed \(http 000\)/);
    assert.ok(!r1.all.includes(SECRET) && !r2.all.includes(SECRET));
  } finally { sb.cleanup(); }
});

test("the alert config is parsed, never executed, and invalid URLs are ignored", async () => {
  const sb = sandbox();
  try {
    const marker = path.join(sb.dir, "pwned");
    sb.w("alerts.env", `BACKUP_PING_URL=$(touch ${marker})\nBACKUP_CHECK_PING_URL=ftp://nope\n$(touch ${marker})\n`);
    const r = await run("bash", [BACKUP], { env: sb.env() });
    assert.equal(r.code, 0, r.all);
    assert.ok(!fs.existsSync(marker), "the config file executed code");
    assert.match(r.all, /BACKUP_PING_URL in .* is not a valid http\(s\) URL; ignored/);
  } finally { sb.cleanup(); }
});

test("the working directory no longer matters (it broke the manual run from /root on 2026-10-20)", async () => {
  const sb = sandbox();
  try {
    // 1) a directory that no longer exists
    const gone = path.join(sb.dir, "gone");
    fs.mkdirSync(gone);
    const removed = await run("bash", ["-c", `cd "${gone}" && rmdir "${gone}" && bash "${BACKUP}"`], { env: sb.env() });
    assert.equal(removed.code, 0, removed.all);
    assert.match(removed.out, /AUTO_BACKUP=PASS/);

    // 2) the real incident: `sudo -u medoria` from /root keeps a working directory the new user
    //    cannot enter. Reproduced with runuser + a root-only directory (needs root and `nobody`).
    const canRunuser = process.getuid?.() === 0 && spawnSync("id", ["nobody"]).status === 0 && spawnSync("which", ["runuser"]).status === 0;
    if (!canRunuser) return;
    const run2 = async (script) => {
      fs.rmSync(path.join(sb.dir, "backups"), { recursive: true, force: true });
      fs.rmSync(path.join(sb.dir, "remote"), { recursive: true, force: true });
      const priv = fs.mkdtempSync(path.join(os.tmpdir(), "medoria-private-"));
      fs.chmodSync(priv, 0o700);
      spawnSync("chmod", ["-R", "a+rwX", sb.dir]);
      fs.chmodSync(sb.dir, 0o777);
      try { return await run("bash", ["-c", `cd "${priv}" && runuser -u nobody -- bash "${script}"`], { env: sb.env() }); }
      finally { fs.rmSync(priv, { recursive: true, force: true }); }
    };
    const fixed = await run2(BACKUP);
    assert.equal(fixed.code, 0, fixed.all);
    // negative control: the script as it was on main before this change fails exactly like that
    const old = spawnSync("git", ["show", "7618771:scripts/self-host/production-backup.sh"], { cwd: root, encoding: "utf8" });
    if (old.status === 0) {
      const oldFile = sb.w("old-backup.sh", old.stdout, 0o755);
      fs.chmodSync(oldFile, 0o755);
      const before = await run2(oldFile);
      assert.notEqual(before.code, 0, "expected the old script to fail from a directory the user cannot enter:\n" + before.all);
    }
  } finally { sb.cleanup(); }
});

test("--check: fresh backups ping success, stale ones ping /fail and exit 1", async () => {
  const sb = sandbox(), srv = await alertServer();
  try {
    sb.w("alerts.env", alerts(srv));
    const stamp = (hoursAgo) => new Date(Date.now() - hoursAgo * 3600e3).toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
    const place = (name) => { for (const base of ["backups/production-auto", "remote/production-auto"]) fs.mkdirSync(path.join(sb.dir, base, name), { recursive: true }); };

    place(stamp(2));
    const fresh = await run("bash", [BACKUP, "--check"], { env: sb.env() });
    assert.equal(fresh.code, 0, fresh.all);
    assert.deepEqual(paths(srv), [`/${SECRET}-check`]);

    srv.hits.length = 0;
    fs.rmSync(path.join(sb.dir, "backups"), { recursive: true }); fs.rmSync(path.join(sb.dir, "remote"), { recursive: true });
    place(stamp(80));
    const stale = await run("bash", [BACKUP, "--check"], { env: sb.env() });
    assert.equal(stale.code, 1, stale.all);
    assert.deepEqual(paths(srv), [`/${SECRET}-check/fail`]);
    assert.match(srv.hits[0].body, /freshness check FAILED/);
  } finally { await srv.close(); sb.cleanup(); }
});

test("--alert-test sends a deliberate failure, --alert-test-clear the matching success", async () => {
  const sb = sandbox(), srv = await alertServer();
  try {
    sb.w("alerts.env", alerts(srv));
    const a = await run("bash", [BACKUP, "--alert-test"], { env: sb.env() });
    assert.equal(a.code, 0, a.all);
    assert.match(a.out, /ALERT_TEST=SENT/);
    const b = await run("bash", [BACKUP, "--alert-test-clear"], { env: sb.env() });
    assert.match(b.out, /ALERT_TEST=CLEARED/);
    assert.deepEqual(paths(srv), [`/${SECRET}/fail`, `/${SECRET}`]);
    assert.match(srv.hits[0].body, /ALERT TEST/);
    // and no backup ran
    assert.ok(!fs.existsSync(path.join(sb.dir, "backups/production-auto/last-run.status")));
    // without configuration it says so instead of pretending
    fs.rmSync(path.join(sb.dir, "alerts.env"));
    const c = await run("bash", [BACKUP, "--alert-test"], { env: sb.env() });
    assert.notEqual(c.code, 0);
    assert.match(c.all, /BACKUP_PING_URL is not configured/);
  } finally { await srv.close(); sb.cleanup(); }
});

// ----------------------------------------------------------------------------- heartbeat
async function heartbeat(sb, srv, site, extra = {}) {
  sb.w("uptime.env", `SITE_PING_URL=http://127.0.0.1:${srv.port}/${SECRET}-site\n`);
  return run("bash", [HEARTBEAT], {
    env: sb.env({ UPTIME_ALERT_ENV: path.join(sb.dir, "uptime.env"), SITE_HEALTH_URL: `http://127.0.0.1:${site.port}/api/health`, DISK_PATH: sb.dir, ...extra }),
  });
}

async function siteServer(status = 200) {
  const s = http.createServer((req, res) => { res.writeHead(status); res.end("ok"); });
  return new Promise((resolve) => s.listen(0, "127.0.0.1", () => resolve({ port: s.address().port, close: () => new Promise((r) => s.close(r)) })));
}

test("heartbeat: everything fine → success ping; each kind of problem → /fail naming the check", async () => {
  const sb = sandbox(), srv = await alertServer();
  let site = await siteServer(200);
  try {
    const ok = await heartbeat(sb, srv, site, { DISK_MAX_PERCENT: "101" });
    assert.equal(ok.code, 0, ok.all);
    assert.deepEqual(paths(srv), [`/${SECRET}-site`]);
    assert.ok(!ok.all.includes(SECRET));

    srv.hits.length = 0;
    const disk = await heartbeat(sb, srv, site, { DISK_MAX_PERCENT: "0" });
    assert.equal(disk.code, 1);
    assert.deepEqual(paths(srv), [`/${SECRET}-site/fail`]);
    assert.match(srv.hits[0].body, /disk \d+% full/);

    srv.hits.length = 0;
    const unhealthy = await heartbeat(sb, srv, site, { DISK_MAX_PERCENT: "101", STUB_UNHEALTHY: "medoria-app-app-1" });
    assert.equal(unhealthy.code, 1);
    assert.match(srv.hits[0].body, /unhealthy containers: medoria-app-app-1/);

    srv.hits.length = 0;
    await site.close(); site = await siteServer(500);
    const bad = await heartbeat(sb, srv, site, { DISK_MAX_PERCENT: "101" });
    assert.equal(bad.code, 1);
    assert.match(srv.hits[0].body, /site health answered http 500/);

    srv.hits.length = 0;
    await site.close();
    const down = await heartbeat(sb, srv, site, { DISK_MAX_PERCENT: "101" });
    assert.equal(down.code, 1);
    assert.match(srv.hits[0].body, /site health answered http 000/);
    assert.ok(!(ok.all + disk.all + unhealthy.all + bad.all + down.all).includes(SECRET));
  } finally { await srv.close(); sb.cleanup(); }
});

test("heartbeat: a Docker inspection that FAILS or HANGS is a problem, never 'no unhealthy containers'", async () => {
  const sb = sandbox(), srv = await alertServer();
  const site = await siteServer(200);
  try {
    // docker exits 1 (daemon down, no permission): site fine, disk fine, yet the heartbeat must say so
    const failed = await heartbeat(sb, srv, site, { DISK_MAX_PERCENT: "101", STUB_DOCKER_FAIL: "ps" });
    assert.equal(failed.code, 1, `docker ps failed but the heartbeat reported success:\n${failed.all}`);
    assert.deepEqual(paths(srv), [`/${SECRET}-site/fail`], "a failure ping must be sent");
    assert.match(srv.hits[0].body, /could not inspect docker/);
    assert.ok(!srv.hits[0].body.includes("docker.sock"), "docker's own error text is not forwarded to the alert service");
    assert.ok(!failed.all.includes(SECRET));

    // docker hangs: bounded by DOCKER_TIMEOUT, also a problem
    srv.hits.length = 0;
    const t0 = Date.now();
    const hung = await heartbeat(sb, srv, site, { DISK_MAX_PERCENT: "101", STUB_DOCKER_HANG: "ps", DOCKER_TIMEOUT: "1" });
    assert.equal(hung.code, 1, hung.all);
    assert.ok(Date.now() - t0 < 15000, "a hanging docker must not hang the heartbeat");
    assert.match(srv.hits[0].body, /could not inspect docker/);

    // a working docker that lists nothing is still healthy
    srv.hits.length = 0;
    const fine = await heartbeat(sb, srv, site, { DISK_MAX_PERCENT: "101" });
    assert.equal(fine.code, 0, fine.all);
    assert.deepEqual(paths(srv), [`/${SECRET}-site`]);
  } finally { await site.close(); await srv.close(); sb.cleanup(); }
});

test("heartbeat: no configuration or a dead alert service changes nothing about the checks", async () => {
  const sb = sandbox();
  const site = await siteServer(200);
  try {
    const none = await run("bash", [HEARTBEAT], { env: sb.env({ UPTIME_ALERT_ENV: path.join(sb.dir, "missing.env"), SITE_HEALTH_URL: `http://127.0.0.1:${site.port}/api/health`, DISK_PATH: sb.dir, DISK_MAX_PERCENT: "101" }) });
    assert.equal(none.code, 0, none.all);
    sb.w("uptime.env", "SITE_PING_URL=http://127.0.0.1:9/never\n");   // nothing listens on port 9
    const dead = await run("bash", [HEARTBEAT], { env: sb.env({ UPTIME_ALERT_ENV: path.join(sb.dir, "uptime.env"), SITE_HEALTH_URL: `http://127.0.0.1:${site.port}/api/health`, DISK_PATH: sb.dir, DISK_MAX_PERCENT: "101" }) });
    assert.equal(dead.code, 0, "a dead alert service must not turn a healthy check into a failure");
    assert.match(dead.all, /WARNING: heartbeat ping .* failed/);
  } finally { await site.close(); sb.cleanup(); }
});

// ----------------------------------------------------------------------------- reports to the panel (N13)
const OPS_TOKEN = "ops-token-0123456789abcdefghij";
const opsLines = (srv, tag = "report") => `OPS_REPORT_URL=http://127.0.0.1:${srv.port}/${tag}\nOPS_REPORT_TOKEN=${OPS_TOKEN}\n`;
const reports = (srv, tag = "/report") => srv.hits.filter((h) => h.path === tag).map((h) => ({ ...JSON.parse(h.body), auth: h.auth }));

test("ops reports: a successful backup reports PASS with the token as a header, a failed one FAIL with the step; the token never reaches the output", async () => {
  const sb = sandbox(), srv = await alertServer();
  try {
    sb.w("alerts.env", alerts(srv, opsLines(srv)));
    const ok = await run("bash", [BACKUP], { env: sb.env() });
    assert.equal(ok.code, 0, ok.all);
    const r = reports(srv);
    assert.equal(r.length, 1); assert.deepEqual([r[0].kind, r[0].status], ["backup", "pass"]); assert.match(r[0].detail, /snapshot 2\d{7}T\d{6}Z/);
    assert.equal(r[0].auth, `Bearer ${OPS_TOKEN}`);
    assert.ok(!ok.all.includes(OPS_TOKEN), "the token leaked into the output");
    srv.hits.length = 0;
    const bad = await run("bash", [BACKUP], { env: sb.env({ STUB_FAIL: "dump" }) });
    assert.notEqual(bad.code, 0);
    const f = reports(srv);
    assert.deepEqual([f[0].kind, f[0].status], ["backup", "fail"]); assert.match(f[0].detail, /database dump/);
    assert.ok(!bad.all.includes(OPS_TOKEN));
  } finally { await srv.close(); sb.cleanup(); }
});

test("ops reports: --check reports backup_check pass / fail, --alert-test reports alert_test sent (and says nothing about delivery)", async () => {
  const sb = sandbox(), srv = await alertServer();
  try {
    sb.w("alerts.env", alerts(srv, opsLines(srv)));
    const stamp = (hoursAgo) => new Date(Date.now() - hoursAgo * 3600e3).toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
    const place = (name) => { for (const base of ["backups/production-auto", "remote/production-auto"]) fs.mkdirSync(path.join(sb.dir, base, name), { recursive: true }); };
    place(stamp(2));
    await run("bash", [BACKUP, "--check"], { env: sb.env() });
    assert.deepEqual(reports(srv).map((x) => [x.kind, x.status]), [["backup_check", "pass"]]);
    srv.hits.length = 0;
    fs.rmSync(path.join(sb.dir, "backups"), { recursive: true }); fs.rmSync(path.join(sb.dir, "remote"), { recursive: true });
    place(stamp(80));
    const stale = await run("bash", [BACKUP, "--check"], { env: sb.env() });
    assert.equal(stale.code, 1);
    assert.deepEqual(reports(srv).map((x) => [x.kind, x.status]), [["backup_check", "fail"]]);
    srv.hits.length = 0;
    const t = await run("bash", [BACKUP, "--alert-test"], { env: sb.env() });
    assert.equal(t.code, 0, t.all);
    assert.deepEqual(reports(srv).map((x) => [x.kind, x.status]), [["alert_test", "sent"]]);
  } finally { await srv.close(); sb.cleanup(); }
});

test("ops reports: off without configuration; a broken endpoint, a refused token or a bad URL never changes a result", async () => {
  const sb = sandbox(), srv = await alertServer();
  // a snapshot is named by the second: clear the previous run so two quick runs cannot collide
  const clean = () => { for (const d of ["backups", "remote"]) fs.rmSync(path.join(sb.dir, d), { recursive: true, force: true }); };
  try {
    sb.w("alerts.env", alerts(srv));
    const none = await run("bash", [BACKUP], { env: sb.env() });
    assert.equal(none.code, 0, none.all);
    assert.equal(reports(srv).length, 0, "no report without configuration");
    assert.ok(!/status report/.test(none.all));
    // endpoint answers 500 → a warning, the backup is fine
    srv.setStatus(500);
    sb.w("alerts.env", alerts(srv, opsLines(srv)));
    clean();
    const broken = await run("bash", [BACKUP], { env: sb.env() });
    assert.equal(broken.code, 0, broken.all);
    assert.match(broken.all, /status report 'backup pass' failed/);
    assert.ok(!broken.all.includes(OPS_TOKEN));
    srv.setStatus(200); srv.hits.length = 0;
    // a plain-http non-local URL and a short token are ignored with a warning (the token would travel in clear text / is not a token)
    sb.w("alerts.env", alerts(srv, "OPS_REPORT_URL=http://evil.example/report\nOPS_REPORT_TOKEN=short\n"));
    clean();
    const bad = await run("bash", [BACKUP], { env: sb.env() });
    assert.equal(bad.code, 0, bad.all);
    assert.match(bad.all, /OPS_REPORT_URL .* must be an https URL/); assert.match(bad.all, /OPS_REPORT_TOKEN .* is not a valid token/);
    assert.equal(reports(srv).length, 0);
    // injection attempts in the detail are stripped (the body stays valid JSON)
    sb.w("alerts.env", alerts(srv, opsLines(srv)));
    clean();
    const inj = await run("bash", [BACKUP], { env: sb.env({ STUB_FAIL: "dump" }) });
    assert.notEqual(inj.code, 0);
    for (const h of srv.hits.filter((x) => x.path === "/report")) assert.doesNotThrow(() => JSON.parse(h.body));
  } finally { await srv.close(); sb.cleanup(); }
});

test("ops reports: the heartbeat reports pass / fail even when it has no heartbeat URL of its own", async () => {
  const sb = sandbox(), srv = await alertServer();
  let site = await siteServer(200);
  try {
    sb.w("uptime.env", opsLines(srv));
    const env = { UPTIME_ALERT_ENV: path.join(sb.dir, "uptime.env"), SITE_HEALTH_URL: `http://127.0.0.1:${site.port}/api/health`, DISK_PATH: sb.dir, DISK_MAX_PERCENT: "101" };
    const ok = await run("bash", [HEARTBEAT], { env: sb.env(env) });
    assert.equal(ok.code, 0, ok.all);
    assert.deepEqual(reports(srv).map((x) => [x.kind, x.status]), [["heartbeat", "pass"]]);
    srv.hits.length = 0;
    await site.close(); site = await siteServer(503);
    const down = await run("bash", [HEARTBEAT], { env: sb.env({ ...env, SITE_HEALTH_URL: `http://127.0.0.1:${site.port}/api/health` }) });
    assert.notEqual(down.code, 0);
    const r = reports(srv);
    assert.deepEqual([r[0].kind, r[0].status], ["heartbeat", "fail"]);
    assert.ok(!down.all.includes(OPS_TOKEN));
  } finally { await srv.close(); await site.close(); sb.cleanup(); }
});

test("ops reports: the restore drill reports through the same helper (source pin; the drill itself is covered in restore-drill.test.mjs)", () => {
  const src = fs.readFileSync(path.join(root, "scripts/self-host/restore-drill.sh"), "utf8");
  assert.match(src, /ops_report restore_drill fail/); assert.match(src, /ops_report restore_drill pass/);
  assert.match(src, /curl -sS -m 10 -o \/dev\/null -w '%\{http_code\}' -K -/, "the token goes to curl on stdin, never on the command line");
  for (const f of ["production-backup.sh", "restore-drill.sh", "uptime-heartbeat.sh"]) assert.ok(!/-H "Authorization/.test(fs.readFileSync(path.join(root, "scripts/self-host", f), "utf8")), `${f}: no token in the command line`);
});
