// The System status screen's model (N13, lib/ops/*): a report becomes a state by one rule — nothing heard is "unknown", a failure is "fail", an old
// success is "overdue", only a fresh success is "ok" — the alert path is never "verified", the ingest accepts only what a script may send, the live checks
// say "unknown" when they cannot run, and the pages / route / action are wired the way the docs promise.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createMemoryAdmin } from "./helpers/memoryAdmin.mjs";
import { cleanReport, cleanDetail, opsState, opsOverview, alertProof, OPS_KINDS, REPORTABLE, MONITORED, OPS_MESSAGES as M } from "../lib/ops/status.js";
import { ingestReport, confirmAlert, readOpsRows } from "../lib/ops/ingest.js";
import { migrationProbes, databaseProbe, configChecks, MIGRATION_PROBES, UNPROBED } from "../lib/operator/systemChecks.js";

const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const NOW = Date.parse("2026-10-28T12:00:00.000Z");
const ago = (ms) => new Date(NOW - ms).toISOString();
const H = 3_600_000;

test("a report is a state by one rule; nothing is green without a fresh success", () => {
  assert.equal(opsState("backup", null, NOW).state, "unknown");
  assert.equal(opsState("backup", undefined, NOW).state, "unknown");
  assert.equal(opsState("backup", { status: "pass", reported_at: "garbage" }, NOW).state, "unknown");
  assert.equal(opsState("backup", { status: "pass", reported_at: ago(3 * H) }, NOW).state, "ok");
  assert.equal(opsState("backup", { status: "pass", reported_at: ago(37 * H) }, NOW).state, "overdue", "a success older than 36 h is overdue, not ok");
  assert.equal(opsState("backup", { status: "fail", reported_at: ago(1 * H), last_pass_at: ago(30 * H), detail: "step: dump" }, NOW).state, "fail");
  assert.equal(opsState("backup", { status: "fail", reported_at: ago(1 * H), last_pass_at: ago(30 * H) }, NOW).lastPassAt, ago(30 * H));
  assert.equal(opsState("backup", { status: "sent", reported_at: ago(1 * H) }, NOW).state, "unknown", "a status that is not a pass is never ok");
  assert.equal(opsState("heartbeat", { status: "pass", reported_at: ago(10 * 60_000) }, NOW).state, "ok");
  assert.equal(opsState("heartbeat", { status: "pass", reported_at: ago(16 * 60_000) }, NOW).state, "overdue", "no heartbeat for 15 minutes = the server may be down");
  assert.equal(opsState("restore_drill", { status: "pass", reported_at: ago(20 * 24 * H) }, NOW).state, "ok");
  assert.equal(opsState("restore_drill", { status: "pass", reported_at: ago(40 * 24 * H) }, NOW).state, "overdue", "a drill older than ~a month is overdue");
  assert.equal(opsState("alert_test", { status: "sent", reported_at: ago(1 * H) }, NOW).state, "unknown", "an alert test is not a monitored thing");
});

test("the headline can only be as good as its worst part", () => {
  const rows = (o) => MONITORED.map((k) => ({ kind: k, status: "pass", reported_at: ago(5 * 60_000), ...o[k] }));
  assert.equal(opsOverview([], NOW).headline, "attention", "nothing reported = attention, never ok");
  assert.ok(opsOverview([], NOW).items.every((i) => i.state === "unknown"));
  assert.equal(opsOverview(rows({}), NOW).headline, "reported_ok");
  assert.equal(opsOverview(rows({ backup: { status: "fail" } }), NOW).headline, "problem");
  assert.equal(opsOverview(rows({ restore_drill: { reported_at: ago(60 * 24 * H) } }), NOW).headline, "attention");
  assert.equal(opsOverview(rows({ heartbeat: undefined, backup: undefined }).slice(2), NOW).headline, "attention", "missing rows are unknown");
});

test("the alert path is never verified by the app: only a person's statement after the last test counts, and it stays a statement", () => {
  assert.equal(alertProof(null, null).state, "never_tested");
  assert.equal(alertProof(null, { reported_at: ago(H) }).state, "never_tested", "a confirmation without a test proves nothing");
  const test_ = { reported_at: ago(5 * H) };
  assert.equal(alertProof(test_, null).state, "awaiting");
  assert.equal(alertProof(test_, { reported_at: ago(9 * H), reported_by: "ann" }).state, "awaiting", "a confirmation older than the last test does not count");
  const ok = alertProof(test_, { reported_at: ago(4 * H), reported_by: "ann", detail: "Telegram" });
  assert.deepEqual([ok.state, ok.by, ok.note], ["confirmed", "ann", "Telegram"]);
  assert.ok(!Object.values(OPS_MESSAGES_STATES()).includes("verified"));
  function OPS_MESSAGES_STATES() { return { a: alertProof(null, null).state, b: ok.state, c: alertProof(test_, null).state }; }
});

test("what a script may send; free text is one short line and never carries a URL", () => {
  assert.deepEqual(REPORTABLE.sort(), ["alert_test", "backup", "backup_check", "heartbeat", "restore_drill"]);
  assert.equal(cleanReport({ kind: "backup", status: "pass", detail: "snapshot 2026" }).ok, true);
  assert.equal(cleanReport({ kind: "alert_test", status: "sent" }).ok, true);
  assert.equal(cleanReport({ kind: "alert_confirmed", status: "confirmed" }).error, M.badKind, "a script cannot confirm an alert");
  assert.equal(cleanReport({ kind: "backup", status: "sent" }).error, M.badStatus);
  assert.equal(cleanReport({ kind: "alert_test", status: "pass" }).error, M.badStatus);
  for (const bad of [null, "x", [], {}, { kind: "disk", status: "pass" }]) assert.equal(cleanReport(bad).ok, false, JSON.stringify(bad));
  assert.equal(cleanDetail("failed\nat https://hc-ping.com/abcd-1234?x=1 step\u0000 two"), "failed at [url] step two");
  assert.equal(cleanDetail("x".repeat(500)).length, 200);
  assert.equal(cleanDetail("   "), null); assert.equal(cleanDetail(null), null);
  assert.equal(cleanReport({ kind: "backup", status: "fail", detail: "see http://127.0.0.1/secret-token" }).detail, "see [url]");
});

const mk = (extra = {}) => createMemoryAdmin({ ops_status: [], ...extra }, { unique: { ops_status: [["kind"]] } });

test("ingest stores the latest report per kind and nothing else; a missing table says so", async () => {
  const db = mk();
  assert.deepEqual(await ingestReport(db, { kind: "backup", status: "pass", detail: "snapshot 1" }), { ok: true, kind: "backup", status: "pass" });
  await ingestReport(db, { kind: "backup", status: "fail", detail: "step: dump" });
  assert.equal(db.tables.ops_status.length, 1, "one row per kind (the latest)");
  assert.deepEqual([db.tables.ops_status[0].status, db.tables.ops_status[0].reported_by], ["fail", "script"]);
  assert.equal((await ingestReport(db, { kind: "nope", status: "pass" })).status, 400);
  assert.equal((await ingestReport(db, { kind: "backup", status: "pass", reported_at: "2020-01-01", reported_by: "owner" })).ok, true);
  assert.equal(db.tables.ops_status[0].reported_by, "script", "the sender cannot choose who reported");
  assert.ok(!("reported_at" in db.tables.ops_status[0]) || db.tables.ops_status[0].reported_at !== "2020-01-01", "the sender cannot choose the time");
  const none = createMemoryAdmin({});
  const r = await ingestReport(none, { kind: "backup", status: "pass" });
  assert.deepEqual([r.ok, r.status, r.error], [false, 503, M.unavailable]);
  const read1 = await readOpsRows(none);
  assert.equal(read1.ok, false); assert.equal(read1.needsMigration, true);
});

test("an owner's confirmation needs a test first, is short, is stored with their name, and stays a statement", async () => {
  const db = mk();
  assert.equal((await confirmAlert(db, { label: "ann", note: "ok" })).error, M.noTest);
  await ingestReport(db, { kind: "alert_test", status: "sent" });
  assert.equal((await confirmAlert(db, { label: "ann", note: "x".repeat(121) })).error, M.note);
  const ok = await confirmAlert(db, { label: "ann", note: "arrived on Telegram https://t.me/secret" });
  assert.equal(ok.ok, true);
  const row = db.tables.ops_status.find((r) => r.kind === "alert_confirmed");
  assert.deepEqual([row.status, row.reported_by, row.detail], ["confirmed", "ann", "arrived on Telegram [url]"]);
  assert.equal((await confirmAlert(db, { label: "bob", note: "" })).ok, true);
  assert.equal(db.tables.ops_status.find((r) => r.kind === "alert_confirmed").detail, null);
});

test("live checks: present / missing / unknown per migration, never 'ok' for something that could not be read", async () => {
  const db = createMemoryAdmin({ operator_users: [{ id: 1 }], site_content: [{ id: 1 }], products: [{ id: 1, variant_of: null }], publish_rules: [] });
  db.fail = (table, op) => (table === "publish_rules" ? { code: "XX000", message: "boom" } : null);
  const res = await migrationProbes(db);
  const st = (n) => res.find((x) => x.migration === n)?.state;
  assert.equal(st(34), "present"); assert.equal(st(42), "present"); assert.equal(st(44), "present");
  assert.equal(st(46), "unknown", "a read that failed for another reason is unknown, not present");
  assert.equal(st(49), "missing", "a table that is not there");
  assert.equal(st(51), "no_probe");
  assert.deepEqual(res.map((x) => x.migration), [...res.map((x) => x.migration)].sort((a, b) => a - b));
  assert.equal(res.length, MIGRATION_PROBES.length + UNPROBED.length);
  assert.equal((await databaseProbe(createMemoryAdmin({ products: [] }))).state, "ok");
  const broken = createMemoryAdmin({ products: [] }); broken.fail = () => ({ message: "down" });
  assert.equal((await databaseProbe(broken)).state, "failed");
  const thrower = { from() { throw new Error("no connection"); } };
  assert.equal((await databaseProbe(thrower)).state, "failed");
  assert.ok((await migrationProbes(thrower)).filter((x) => x.state !== "no_probe").every((x) => x.state === "unknown"));
});

test("settings are reported as present or absent, never their value", () => {
  const c = configChecks({ OPERATOR_SESSION_SECRET: "x".repeat(20), SUPABASE_SERVICE_ROLE_KEY: "k", OPS_REPORT_TOKEN: "short", SCHEDULE_TOKEN: "t".repeat(30) });
  assert.deepEqual(c, { session: true, serviceRole: true, opsToken: false, cronToken: true, reminderToken: false, telegram: false, translate: false });
  assert.ok(Object.values(c).every((v) => typeof v === "boolean"));
});

test("wiring: the route, the pages of both houses, the action, the settings link and the no-green promise", () => {
  const route = read("app/api/internal/ops-report/route.js");
  assert.match(route, /OPS_REPORT_TOKEN/); assert.match(route, /status: 404/); assert.match(route, /timingSafeEqual/); assert.match(route, /MAX_BODY/); assert.match(route, /ingestReport\(db, body\)/);
  assert.doesNotMatch(route, /request\.url|searchParams/, "no secrets or data in the address");
  for (const [f, panel, guard] of [["app/operator/(panel)/system/page.jsx", "health", "requireHealthSession"], ["app/beauty/operator/(panel)/system/page.jsx", "beauty", "requireBeautySession"]]) {
    const s = read(f);
    assert.match(s, new RegExp(`${guard}\\("users\\.view"\\)`), f); assert.match(s, new RegExp(`loadSystemStatus\\(session, "${panel}"\\)`), f);
  }
  for (const f of ["lib/operator/opsActions.js", "lib/beauty/operator/opsActions.js"]) {
    const s = read(f);
    assert.match(s, /^"use server";/); assert.match(s, /await getSession\(\)/); assert.match(s, /requireUsersManage\(/); assert.match(s, /confirmAlert\(/);
  }
  for (const f of ["app/operator/(panel)/settings/page.jsx", "app/beauty/operator/(panel)/settings/page.jsx"]) assert.match(read(f), /link-system/, f);
  const ui = read("components/operator/SystemStatus.jsx");
  assert.doesNotMatch(ui, /verified|راستی‌آزمایی شد/i, "the screen never claims verification");
  assert.match(ui, /\{ok: \{|ok: \{ label: tr/);
  assert.equal(Object.keys(OPS_KINDS).length, 4);
  assert.match(read("lib/ops/systemData.js"), /import "server-only"/);
});
