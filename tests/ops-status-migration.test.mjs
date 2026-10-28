// Migration 52 (what the server's scripts reported) run for real on a throw-away PostgreSQL cluster (skipped where the server binaries are not installed).
// Proves: it is idempotent; the table is PRIVATE; one row per kind; each kind accepts only its own statuses; the report time is the database's clock (a sender
// cannot backdate); last_pass_at remembers the last success through failures; kind is fixed; service_role can write but never delete.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createCluster, SKIP } from "./helpers/pgCluster.mjs";

const pg = createCluster("pg52", 7740);
before(() => pg.start({ migrations: { 52: "52_ops_status.sql" } }));
after(() => pg.stop());
const must = (r) => pg.must(r);
const psql = (sql, o) => pg.psql(sql, o);
const sc = (sql) => pg.psql(sql, { role: "service_role" });
const up = (kind, status, extra = "") => `INSERT INTO ops_status(kind, status${extra ? ", " + extra.split("=")[0] : ""}) VALUES ('${kind}', '${status}'${extra ? ", " + extra.split("=")[1] : ""}) ON CONFLICT (kind) DO UPDATE SET status = EXCLUDED.status, detail = EXCLUDED.detail, reported_by = EXCLUDED.reported_by`;

test("idempotent; private; service_role writes but never deletes", { skip: SKIP }, () => {
  must(psql(pg.M(52), { file: true })); must(psql(pg.M(52), { file: true }));
  must(sc(up("backup", "pass")));
  for (const role of ["anon", "authenticated"]) {
    assert.equal(psql("SELECT * FROM ops_status", { role }).ok, false, `${role} must not read`);
    assert.equal(psql(up("heartbeat", "pass"), { role }).ok, false, `${role} must not write`);
  }
  assert.equal(sc("DELETE FROM ops_status").ok, false);
});

test("each kind accepts only its own statuses", { skip: SKIP }, () => {
  for (const kind of ["backup", "backup_check", "restore_drill", "heartbeat"]) { must(sc(up(kind, "pass"))); must(sc(up(kind, "fail"))); assert.equal(sc(up(kind, "sent")).ok, false, `${kind}/sent`); assert.equal(sc(up(kind, "confirmed")).ok, false); }
  must(sc(up("alert_test", "sent"))); assert.equal(sc(up("alert_test", "pass")).ok, false); assert.equal(sc(up("alert_test", "confirmed")).ok, false);
  must(sc(up("alert_confirmed", "confirmed"))); assert.equal(sc(up("alert_confirmed", "pass")).ok, false);
  assert.equal(sc(up("disk", "pass")).ok, false, "an unknown kind");
});

test("the time is the database's clock; last_pass_at survives failures", { skip: SKIP }, () => {
  must(sc("INSERT INTO ops_status(kind, status, reported_at) VALUES ('restore_drill', 'pass', '2020-01-01') ON CONFLICT (kind) DO UPDATE SET status = EXCLUDED.status, reported_at = EXCLUDED.reported_at"));
  assert.equal(must(sc("SELECT reported_at > NOW() - interval '1 minute' FROM ops_status WHERE kind = 'restore_drill'")), "t", "a backdated report is stamped now");
  const pass = must(sc("SELECT last_pass_at FROM ops_status WHERE kind = 'restore_drill'"));
  assert.ok(pass);
  must(sc("SELECT pg_sleep(0.05)"));
  must(sc(up("restore_drill", "fail", "detail='checksum mismatch'")));
  assert.equal(must(sc("SELECT last_pass_at FROM ops_status WHERE kind = 'restore_drill'")), pass, "the last success is remembered");
  assert.equal(must(sc("SELECT status FROM ops_status WHERE kind = 'restore_drill'")), "fail");
  must(sc("INSERT INTO ops_status(kind, status) VALUES ('heartbeat', 'fail') ON CONFLICT (kind) DO UPDATE SET status = EXCLUDED.status"));
  assert.equal(must(sc("SELECT last_pass_at IS NOT NULL FROM ops_status WHERE kind = 'heartbeat'")), "t", "heartbeat passed earlier in this test file");
});

test("detail and reporter are bounded; the kind never changes", { skip: SKIP }, () => {
  assert.equal(sc(up("backup", "pass", `detail='${"x".repeat(201)}'`)).ok, false);
  assert.equal(sc(up("backup", "pass", `reported_by='${"x".repeat(81)}'`)).ok, false);
  must(sc(up("backup", "pass", `detail='${"x".repeat(200)}'`)));
  assert.equal(sc("UPDATE ops_status SET kind = 'heartbeat' WHERE kind = 'backup'").ok, false);
});
