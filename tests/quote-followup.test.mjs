// Follow-up of customer requests (migration 37 + lib/operator/quoteOps.js, quoteFollowUpCore.js, quoteReport.js): the follow-up
// date, "today / overdue", the customer file, the Telegram retry (once per 30 s, only after a failure), the report and its CSV.
import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryAdmin } from "./helpers/memoryAdmin.mjs";
import { parseFollowUp, followUpState, teamDay, customerHistory, phoneKey, retryState, summarizeQuotes, assignQuoteGuarded, QUOTE_OPS_MESSAGES as M } from "../lib/operator/quoteOps.js";
import { setFollowUp, retryNotice, exportQuotes, userResolver, houseAssignees } from "../lib/operator/quoteFollowUpCore.js";
import { summarizeReport, quotesCsv, cleanDays, CSV_HEAD } from "../lib/operator/quoteReport.js";

const NOW = Date.parse("2026-10-27T10:00:00Z");      // 15:00 in Dushanbe, still the 27th
const day = (n) => `2026-10-${String(n).padStart(2, "0")}T12:00:00.000Z`;

test("a follow-up is a calendar day: real dates only, within a sensible range, empty clears it", () => {
  assert.deepEqual(parseFollowUp("2026-10-30", NOW), { value: day(30) });
  assert.deepEqual(parseFollowUp("", NOW), { value: null });
  assert.deepEqual(parseFollowUp(null, NOW), { value: null });
  for (const bad of ["2026-02-30", "30/10/2026", "2026-13-01", 20261030, "2026-10-30T10:00", "yesterday"]) assert.equal(parseFollowUp(bad, NOW).error, M.badDate, String(bad));
  assert.equal(parseFollowUp("2019-01-01", NOW).error, M.dateRange);
  assert.equal(parseFollowUp("2040-01-01", NOW).error, M.dateRange);
});

test("today is the team's day (UTC+5); overdue / today / later; finished requests have no follow-up state", () => {
  assert.equal(teamDay(Date.parse("2026-10-27T20:00:00Z")), "2026-10-28", "20:00 UTC is already tomorrow in Dushanbe");
  assert.equal(followUpState({ status: "new", follow_up_at: day(26) }, NOW), "overdue");
  assert.equal(followUpState({ status: "contacted", follow_up_at: day(27) }, NOW), "today");
  assert.equal(followUpState({ status: "quoted", follow_up_at: day(28) }, NOW), "later");
  assert.equal(followUpState({ status: "new", follow_up_at: null }, NOW), null);
  for (const status of ["closed", "archived", "spam"]) assert.equal(followUpState({ status, follow_up_at: day(1) }, NOW), null, status);
  assert.equal(summarizeQuotes([{ status: "new", created_at: "2026-10-27T09:00:00Z", follow_up_at: day(26) }, { status: "contacted", created_at: "2026-10-01T00:00:00Z", first_response_at: "2026-10-01T01:00:00Z", follow_up_at: day(27) }, { status: "new", created_at: "2026-10-27T09:00:00Z", follow_up_at: day(29) }], { now: NOW }).followUpsDue, 2);
});

test("the customer file is the other requests with the same phone number", () => {
  assert.equal(phoneKey("+992 90 000 0042"), "900000042");
  assert.equal(phoneKey("123"), null);
  const rows = [
    { id: 1, phone: "+992900000042", created_at: "2026-10-01", status: "closed", product_name: "A", tracking_code: "MH-1" },
    { id: 2, phone: "992 90 000 0042", created_at: "2026-10-20", status: "new", product_name: "B" },
    { id: 3, phone: "+992911111111", created_at: "2026-10-21", status: "new" },
    { id: 4, phone: "", created_at: "2026-10-22", status: "new" },
  ];
  assert.deepEqual(customerHistory(rows, rows[0]).map((h) => h.id), [2]);
  assert.deepEqual(customerHistory(rows, rows[1]).map((h) => h.id), [1]);
  assert.deepEqual(customerHistory(rows, rows[2]), []);
  assert.deepEqual(customerHistory(rows, rows[3]), [], "no phone, no file");
  assert.ok(!("message" in customerHistory(rows, rows[0])[0]), "only short facts, no message text");
});

const ctx = (db, over = {}) => ({ admin: db, table: "quote_requests", kind: "health", audit: async (e) => { (ctx.logged ||= []).push(e); }, ...over });

test("setFollowUp: stores the day, clears it, refuses bad ids / dates / missing rows / a missing column, and logs without the date", async () => {
  ctx.logged = [];
  const db = createMemoryAdmin({ quote_requests: [{ id: 7, status: "new" }] });
  assert.deepEqual(await setFollowUp(ctx(db), "7", "2026-10-30", NOW), { ok: true, followUpAt: day(30) });
  assert.equal(db.tables.quote_requests[0].follow_up_at, day(30));
  assert.deepEqual(ctx.logged[0], { action: "quote.follow_up", entity: "quote_requests", ids: [7], detail: { assigned: true } });
  assert.ok(!JSON.stringify(ctx.logged).includes("2026-10-30"));
  assert.equal((await setFollowUp(ctx(db), 7, "", NOW)).followUpAt, null);
  assert.equal(db.tables.quote_requests[0].follow_up_at, null);
  assert.equal((await setFollowUp(ctx(db), "x", "2026-10-30", NOW)).error, M.badId);
  assert.equal((await setFollowUp(ctx(db), 7, "nope", NOW)).error, M.badDate);
  assert.equal((await setFollowUp(ctx(db), 99, "2026-10-30", NOW)).notFound, true);
  db.fail = () => ({ code: "42703", message: 'column "follow_up_at" does not exist' });
  assert.equal((await setFollowUp(ctx(db), 7, "2026-10-30", NOW)).error, M.needsMigration37);
});

test("retryNotice: only after a failure, at most once per 30 s, records the result and the attempt, never says why in the log", async () => {
  ctx.logged = [];
  const row = { id: 5, status: "new", name: "A", notify_status: "failed", notify_detail: "http_401", notify_attempts: 1, notify_last_attempt_at: new Date(NOW - 5000).toISOString() };
  const db = createMemoryAdmin({ quote_requests: [row] });
  const sent = []; const ok = async (a) => { sent.push(a); return { sent: true }; }; const bad = async () => ({ sent: false, reason: "http_401" });
  assert.deepEqual(retryState(row, NOW), { allowed: false, reason: "wait", seconds: 25 });
  assert.equal((await retryNotice(ctx(db), 5, { now: NOW, send: ok })).wait, 25);
  assert.equal(sent.length, 0, "nothing is sent while waiting");
  const later = NOW + 60_000;
  const r = await retryNotice(ctx(db), 5, { now: later, send: bad });
  assert.equal(r.ok, false);
  assert.deepEqual([db.tables.quote_requests[0].notify_status, db.tables.quote_requests[0].notify_attempts], ["failed", 2]);
  const r2 = await retryNotice(ctx(db), 5, { now: later + 60_000, send: ok });
  assert.equal(r2.ok, true);
  assert.deepEqual([sent[0].kind, sent[0].id], ["health", 5]);
  assert.deepEqual([db.tables.quote_requests[0].notify_status, db.tables.quote_requests[0].notify_attempts], ["sent", 3]);
  assert.deepEqual(ctx.logged.map((e) => [e.action, e.result]), [["quote.notice_retry", "failure"], ["quote.notice_retry", "success"]]);
  assert.equal((await retryNotice(ctx(db), 5, { now: later + 120_000, send: ok })).error.length > 0, true, "a delivered notice is not sent again");
  assert.equal(sent.length, 1);
  assert.equal((await retryNotice(ctx(db), 99, { now: later, send: ok })).notFound, true);
  const none = await retryNotice(ctx(createMemoryAdmin({ quote_requests: [{ id: 1, notify_status: "failed" }] })), 1, { now: later, send: async () => ({ sent: false, reason: "not_configured" }) });
  assert.equal(none.ok, false);
});

test("the report counts the period only, uses no customer text, and the CSV is formula-safe with every column", () => {
  const rows = [
    { status: "new", created_at: "2026-10-26T10:00:00Z", assigned_to: "Sara", notify_status: "failed" },
    { status: "contacted", created_at: "2026-10-20T10:00:00Z", first_response_at: "2026-10-20T14:00:00Z", assigned_to: "Sara", follow_up_at: day(27) },
    { status: "closed", created_at: "2026-10-10T10:00:00Z", first_response_at: "2026-10-10T12:00:00Z", assigned_to: "Ali" },
    { status: "new", created_at: "2026-08-01T10:00:00Z" },
  ];
  const r = summarizeReport(rows, { now: NOW, days: 30 });
  assert.equal(r.total, 3, "the August request is outside the period");
  assert.deepEqual(r.byStatus, { new: 1, contacted: 1, closed: 1 });
  assert.deepEqual(r.byAssignee, [{ name: "Sara", count: 2 }, { name: "Ali", count: 1 }]);
  assert.equal(r.answered, 2); assert.equal(r.avgFirstResponseHours, 3);
  assert.equal(r.followUpsToday, 1); assert.equal(r.notifyFailures, 1);
  assert.equal(summarizeReport(rows, { now: NOW, days: 7 }).total, 2, "the boundary day is inside the period");
  assert.equal(summarizeReport(rows, { now: NOW + 86_400_000, days: 7 }).total, 1);
  assert.equal(cleanDays("90"), 90); assert.equal(cleanDays("5"), 30); assert.equal(cleanDays(undefined), 30);
  const csv = quotesCsv([{ tracking_code: "MH-1", name: "=HYPERLINK(\"x\")", phone: "+99290", message: "never exported", status: "new" }]);
  assert.ok(csv.startsWith("﻿tracking_code,created_at,status,name"));
  assert.ok(csv.includes("'=HYPERLINK") || !csv.includes(",=HYPERLINK"), "a formula is neutralised");
  assert.ok(!csv.includes("never exported"), "the free-text message is not a column");
  assert.equal(CSV_HEAD.length, 15);
});

test("exportQuotes: newest first, bounded to the period, logs the count (not the rows), and says so when empty", async () => {
  ctx.logged = [];
  const old = new Date(NOW - 200 * 86_400_000).toISOString();
  const db = createMemoryAdmin({ quote_requests: [{ id: 1, name: "A", created_at: "2026-10-26T00:00:00Z", status: "new" }, { id: 2, name: "B", created_at: "2026-10-20T00:00:00Z", status: "new" }, { id: 3, name: "Old", created_at: old, status: "new" }] });
  const r = await exportQuotes(ctx(db), { days: 30, now: NOW });
  assert.equal(r.ok, true); assert.equal(r.count, 2);
  assert.ok(r.csv.indexOf(",A,") < r.csv.indexOf(",B,")); assert.ok(!r.csv.includes("Old"));
  assert.match(r.filename, /^requests-health-30d-2026-10-27\.csv$/);
  assert.deepEqual([ctx.logged[0].action, ctx.logged[0].count], ["quotes.exported", 2]);
  assert.ok(!JSON.stringify(ctx.logged).includes('"A"'));
  assert.equal((await exportQuotes(ctx(createMemoryAdmin({ quote_requests: [] })), { days: 7, now: NOW })).ok, false);
});

test("a typed label that is exactly a person's display name also stores the person (migration 37); otherwise only the label", async () => {
  const db = createMemoryAdmin({
    operator_users: [
      { id: "u1", display_name: "Sara K", houses: ["health"], status: "active" }, { id: "u2", display_name: "Ali", houses: ["beauty"], status: "active" },
      { id: "u3", display_name: "Dina", houses: ["health"], status: "disabled" }, { id: "u4", display_name: "Twin", houses: ["health"], status: "active" }, { id: "u5", display_name: "twin", houses: ["health"], status: "active" },
    ],
    quote_requests: [{ id: 7 }],
  });
  const resolve = userResolver("health");
  assert.equal(await resolve(db, " sara k "), "u1");
  assert.equal(await resolve(db, "Ali"), null, "a person of the other house");
  assert.equal(await resolve(db, "Dina"), null, "a disabled person");
  assert.equal(await resolve(db, "Twin"), null, "ambiguous names are not guessed");
  assert.deepEqual(await houseAssignees(db, "health"), ["Sara K", "Twin", "twin"]);
  const base = { getSession: async () => ({ sid: "s" }), getAdminClient: () => db };
  assert.equal((await assignQuoteGuarded({ ...base, table: "quote_requests", id: 7, assignee: "Sara K", resolveUser: resolve })).ok, true);
  assert.deepEqual([db.tables.quote_requests[0].assigned_to, db.tables.quote_requests[0].assigned_user_id], ["Sara K", "u1"]);
  await assignQuoteGuarded({ ...base, table: "quote_requests", id: 7, assignee: "Somebody", resolveUser: resolve });
  assert.deepEqual([db.tables.quote_requests[0].assigned_to, db.tables.quote_requests[0].assigned_user_id], ["Somebody", null]);
});
