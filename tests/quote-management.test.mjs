// Customer-request management (tracking code, assignee, reminders, notice failures):
//   * assigning needs a session and never reaches the database without one; bad input rejects the call
//   * each panel's assign action is bound to its own table
//   * "waiting" / "overdue" are computed from status, first response and age
//   * the Telegram notice shows the code; the reminder carries counts only (no customer data)
//   * a notice that failed is recorded (class only) and counted by the reminder
//   * the reminder endpoint is off without a token and refuses a wrong one
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseAssignee, assignQuoteGuarded, isWaiting, isOverdue, waitingHours, summarizeQuotes,
  ASSIGNEE_MAX, QUOTE_OPS_MESSAGES as M,
} from "../lib/operator/quoteOps.js";
import { notifyOutcome, recordNotifyResult } from "../lib/notify/record.js";
import { formatQuoteNotice, formatReminderNotice, sendTelegramText, notifyNewQuote } from "../lib/notify/telegram.js";
import { insertRequest } from "../lib/inquiry/save.js";
import { runQuoteReminders } from "../lib/notify/reminders.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

const H = 3_600_000;
const NOW = Date.parse("2026-10-25T12:00:00Z");
const ago = (h) => new Date(NOW - h * H).toISOString();

function fakeAdmin({ rows = [{ id: 7 }], error = null } = {}) {
  const calls = [];
  const admin = {
    from(table) {
      const call = { table, op: null, values: null, eq: null };
      calls.push(call);
      const chain = {
        update(v) { call.op = "update"; call.values = v; return chain; },
        eq(col, val) { call.eq = [col, val]; return chain; },
        select() { return Promise.resolve({ data: error ? null : rows, error }); },
        // like the real builder, the chain can be awaited as it is
        then(resolve, reject) { return Promise.resolve({ data: error ? null : rows, error }).then(resolve, reject); },
      };
      return chain;
    },
  };
  return { admin, calls };
}
const deps = (admin, session = { role: "admin" }) => {
  const seen = { adminRequested: 0 };
  return { seen, base: { getSession: async () => session, getAdminClient: () => { seen.adminRequested++; return admin ?? null; } } };
};

// ── assignee ────────────────────────────────────────────────────────────────

test("parseAssignee trims, collapses whitespace, strips control and bidi-override characters", () => {
  assert.deepEqual(parseAssignee("  سارا   احمدی "), { value: "سارا احمدی" });
  assert.deepEqual(parseAssignee("Ali‮ evil\u0000\n"), { value: "Ali evil" });
  assert.deepEqual(parseAssignee(""), { value: null });
  assert.deepEqual(parseAssignee("   "), { value: null });
  assert.deepEqual(parseAssignee(null), { value: null });
  assert.equal(parseAssignee("x".repeat(ASSIGNEE_MAX)).value.length, ASSIGNEE_MAX);
  assert.equal(parseAssignee("x".repeat(ASSIGNEE_MAX + 1)).error, M.tooLong);
  for (const bad of [5, {}, ["a"], true]) assert.equal(parseAssignee(bad).error, M.badAssignee);
});

test("assigning without a session never requests the database client", async () => {
  const { admin, calls } = fakeAdmin();
  const { seen, base } = deps(admin, null);
  const res = await assignQuoteGuarded({ ...base, table: "quote_requests", id: 7, assignee: "Sara" });
  assert.deepEqual(res, { ok: false, error: M.noSession });
  assert.equal(seen.adminRequested, 0);
  assert.equal(calls.length, 0);
});

test("assigning checks the id and the name before the database", async () => {
  const { admin, calls } = fakeAdmin();
  const { base } = deps(admin);
  for (const id of [0, -1, "1 or 1=1", 2.5, null, [1], {}]) {
    assert.equal((await assignQuoteGuarded({ ...base, table: "quote_requests", id, assignee: "a" })).error, M.badId);
  }
  assert.equal((await assignQuoteGuarded({ ...base, table: "quote_requests", id: 1, assignee: 5 })).error, M.badAssignee);
  assert.equal((await assignQuoteGuarded({ ...base, table: "quote_requests", id: 1, assignee: "x".repeat(61) })).error, M.tooLong);
  assert.equal(calls.length, 0);
});

test("assigning updates only assigned_to of that one row, in the panel's own table, and logs without the name", async () => {
  const { admin, calls } = fakeAdmin();
  const { base } = deps(admin);
  const logged = [];
  const res = await assignQuoteGuarded({ ...base, table: "beauty_quote_requests", id: "7", assignee: " Sara ", audit: async (e) => logged.push(e) });
  assert.deepEqual(res, { ok: true, assignee: "Sara" });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].table, "beauty_quote_requests");
  assert.deepEqual(calls[0].values, { assigned_to: "Sara", assigned_user_id: null });
  assert.deepEqual(calls[0].eq, ["id", 7]);
  assert.equal(logged.length, 1);
  assert.equal(logged[0].action, "quote.assign");
  assert.deepEqual(logged[0].detail, { assigned: true, person: false });
  assert.ok(!JSON.stringify(logged).includes("Sara"), "the typed name must not be in the activity log");

  const cleared = await assignQuoteGuarded({ ...base, table: "quote_requests", id: 7, assignee: "" });
  assert.deepEqual(cleared, { ok: true, assignee: null });
  assert.deepEqual(calls[1].values, { assigned_to: null, assigned_user_id: null });
});

test("assigning: unknown id, missing column (migration 32 not run) and a failing log are all handled", async () => {
  const none = fakeAdmin({ rows: [] });
  assert.equal((await assignQuoteGuarded({ ...deps(none.admin).base, table: "quote_requests", id: 9, assignee: "a" })).notFound, true);
  const noCol = fakeAdmin({ error: { code: "42703", message: 'column "assigned_to" does not exist' } });
  assert.equal((await assignQuoteGuarded({ ...deps(noCol.admin).base, table: "quote_requests", id: 9, assignee: "a" })).error, M.needsMigration);
  const bad = fakeAdmin({ error: { code: "XX000", message: "boom" } });
  assert.equal((await assignQuoteGuarded({ ...deps(bad.admin).base, table: "quote_requests", id: 9, assignee: "a" })).error, M.failed);
  const ok = fakeAdmin();
  const res = await assignQuoteGuarded({ ...deps(ok.admin).base, table: "quote_requests", id: 7, assignee: "a", audit: async () => { throw new Error("log down"); } });
  assert.equal(res.ok, true, "the activity log is best effort for a reversible change");
});

test("each panel's assignQuote is bound to its own session check and its own table", () => {
  const health = read("lib/operator/actions.js");
  const beauty = read("lib/beauty/operator/actions.js");
  assert.match(health, /assignQuoteGuarded\(\{ getSession, getAdminClient, table: "quote_requests"/);
  assert.match(beauty, /assignQuoteGuarded\(\{ getSession, getAdminClient, table: "beauty_quote_requests"/);
  assert.ok(!/beauty_quote_requests/.test(health.slice(health.indexOf("export async function assignQuote"), health.indexOf("export async function assignQuote") + 400)));
  assert.match(health, /makeAudit\("health"/);
  assert.match(beauty, /makeAudit\("beauty"/);
});

// ── waiting / overdue ───────────────────────────────────────────────────────

test("a request is waiting only while it is new and unanswered; overdue after 24 hours", () => {
  const fresh = { status: "new", created_at: ago(2) };
  const old = { status: "new", created_at: ago(30) };
  assert.equal(isWaiting(fresh), true);
  assert.equal(isOverdue(fresh, { now: NOW }), false);
  assert.equal(isOverdue(old, { now: NOW }), true);
  assert.equal(isOverdue({ status: "new", created_at: ago(24) }, { now: NOW }), true);
  assert.equal(isOverdue({ status: "new", created_at: ago(23.9) }, { now: NOW }), false);
  for (const status of ["contacted", "in_progress", "quoted", "closed", "archived", "spam"]) {
    assert.equal(isOverdue({ status, created_at: ago(99) }, { now: NOW }), false, `${status} is not waiting`);
  }
  assert.equal(isOverdue({ status: "new", created_at: ago(99), first_response_at: ago(50) }, { now: NOW }), false);
  assert.equal(waitingHours({ created_at: "not a date" }, NOW), 0);
  assert.equal(waitingHours({ created_at: ago(-5) }, NOW), 0, "a future date never counts as waiting");
});

test("summarizeQuotes counts waiting, overdue, oldest and notice failures (parked requests are not alarms)", () => {
  const rows = [
    { status: "new", created_at: ago(2) },
    { status: "new", created_at: ago(30) },
    { status: "new", created_at: ago(75), notify_status: "failed" },
    { status: "contacted", created_at: ago(100), notify_status: "failed" },
    { status: "spam", created_at: ago(100), notify_status: "failed" },
    { status: "archived", created_at: ago(100), notify_status: "failed" },
    { status: "new", created_at: ago(40), notify_status: "sent" },
  ];
  assert.deepEqual(summarizeQuotes(rows, { now: NOW }), { waiting: 4, overdue: 3, notifyFailures: 2, oldestHours: 75, followUpsDue: 0 });
  assert.deepEqual(summarizeQuotes([], { now: NOW }), { waiting: 0, overdue: 0, notifyFailures: 0, oldestHours: 0, followUpsDue: 0 });
  assert.deepEqual(summarizeQuotes(null, { now: NOW }), { waiting: 0, overdue: 0, notifyFailures: 0, oldestHours: 0, followUpsDue: 0 });
});

// ── notice record ───────────────────────────────────────────────────────────

test("notifyOutcome keeps a short class only", () => {
  assert.deepEqual(notifyOutcome({ sent: true }), { status: "sent", detail: null });
  assert.deepEqual(notifyOutcome({ sent: false, reason: "not_configured" }), { status: "skipped", detail: null });
  assert.deepEqual(notifyOutcome({ sent: false, reason: "http_401" }), { status: "failed", detail: "http_401" });
  assert.deepEqual(notifyOutcome({ sent: false, reason: "network" }), { status: "failed", detail: "network" });
  assert.deepEqual(notifyOutcome({ sent: false }), { status: "failed", detail: "error" });
  const weird = notifyOutcome({ sent: false, reason: "https://api.telegram.org/bot123:SECRET/sendMessage ".repeat(3) });
  assert.match(weird.detail, /^[a-z0-9_]{1,40}$/);
  assert.ok(!/telegram|secret|https/i.test(weird.detail) || weird.detail.length <= 40);
});

test("recordNotifyResult writes the outcome to the right row and never throws", async () => {
  const ok = fakeAdmin();
  assert.equal(await recordNotifyResult(ok.admin, "quote_requests", 7, { sent: false, reason: "http_403" }), true);
  assert.deepEqual(ok.calls[0].values, { notify_status: "failed", notify_detail: "http_403" });
  assert.deepEqual(ok.calls[0].eq, ["id", 7]);
  const noCol = fakeAdmin({ error: { code: "42703", message: "column does not exist" } });
  assert.equal(await recordNotifyResult(noCol.admin, "quote_requests", 7, { sent: true }), false);
  assert.equal(await recordNotifyResult(null, "quote_requests", 7, { sent: true }), false);
  assert.equal(await recordNotifyResult(ok.admin, "quote_requests", undefined, { sent: true }), false);
  const throwing = { from() { throw new Error("db gone"); } };
  assert.equal(await recordNotifyResult(throwing, "quote_requests", 7, { sent: true }), false);
});

test("both submit actions go through the shared insert, record the notice result and pass the tracking code into the notice", () => {
  // The insert moved into lib/inquiry/save.js (inquiry list, #192); what #189 needs from it is unchanged: the stored row
  // comes back, so its tracking code can reach the notice.
  const save = read("lib/inquiry/save.js");
  assert.match(save, /await db\.from\(table\)\.insert\(row\)\.select\(\)\.single\(\)/, "insertRequest must read the stored row back");
  assert.match(save, /await db\.from\(table\)\.insert\(\{ \.\.\.rest, message \}\)\.select\(\)\.single\(\)/, "the fallback insert (no items column) must read it back too");
  for (const [file, table] of [["lib/actions/quote.js", "quote_requests"], ["lib/beauty/actions/quote.js", "beauty_quote_requests"]]) {
    const src = read(file);
    assert.match(src, new RegExp(`const \\{ data: saved, error \\} = await insertRequest\\(db, "${table}", row\\);`), `${file} must insert through insertRequest and keep the stored row`);
    assert.ok(!/\.insert\(row\)/.test(src), `${file} must not bypass the shared insert`);
    assert.match(src, /tracking_code: saved\?\.tracking_code/);
    assert.match(src, new RegExp(`recordNotifyResult\\(db, "${table}", saved\\?\\.id, notice\\)`));
    // the visitor's answer never depends on the notice or on the code
    assert.match(src, /return \{ ok: true \};/);
    assert.ok(!/tracking_code[^\n]*return \{ ok: true,/.test(src), "the code must not be returned to the visitor");
    // order: items resolved -> insert -> notice -> record -> ok
    const order = ["resolveItems(", "await insertRequest(", "await notifyNewQuote(", "await recordNotifyResult(", "return { ok: true };"].map((t) => src.lastIndexOf(t));
    assert.ok(order.every((n, k) => n > 0 && (k === 0 || n > order[k - 1])), `${file}: wrong order ${order}`);
  }
});

// The same pipeline the two actions run, with the real modules and a stand-in database: the stored row comes back from
// the shared insert with its tracking code, the notice carries code AND product list, the result is recorded on that row.
test("saving a list request keeps everything: stored row, tracking_code, notice result, product list (also before migration 33)", async () => {
  const ENV = { TELEGRAM_BOT_TOKEN: "123456789:AAH-testtoken_testtoken_testtoken_1234", TELEGRAM_CHAT_ID_HEALTH: "-1001111111111", NEXT_PUBLIC_SITE_URL: "https://medoriaco.com" };
  const items = [{ product_id: 1, sku: "G-1", name: "Gloves", quantity: 50 }, { product_id: 2, sku: "M-2", name: "Masks", quantity: 7 }, { product_id: 3, sku: null, name: "Gowns", quantity: 1 }, { product_id: 4, sku: null, name: "Caps", quantity: 2 }];
  const row = { name: "Dr K", phone: "+992900", message: "hello", preferred_contact: "whatsapp", language: "en", product_name: "Gloves +3", product_id: null, product_sku: null, quantity: null, items };

  async function pipeline({ failItemsColumn }) {
    const calls = [];
    let failed = !failItemsColumn;
    const db = {
      from: (table) => {
        const c = { table };
        calls.push(c);
        const chain = {
          insert(r) { c.insert = r; return chain; },
          select() { return chain; },
          single() {
            if (!failed && "items" in c.insert) { failed = true; return Promise.resolve({ data: null, error: { code: "PGRST204", message: "Could not find the 'items' column" } }); }
            return Promise.resolve({ data: { id: 77, tracking_code: "MH-AAAA-BBBB-CCCC", ...c.insert }, error: null });
          },
          update(v) { c.update = v; return chain; },
          eq(col, val) { c.eq = [col, val]; return Promise.resolve({ error: null }); },
        };
        return chain;
      },
    };
    const sent = [];
    const fetchImpl = async (_url, init) => { sent.push(JSON.parse(init.body)); return { ok: true, status: 200 }; };
    const { data: saved, error } = await insertRequest(db, "quote_requests", row);
    assert.equal(error, undefined ?? error);
    const notice = await notifyNewQuote({ kind: "health", id: saved?.id, row: { ...row, tracking_code: saved?.tracking_code } }, { env: ENV, fetchImpl });
    const recorded = await recordNotifyResult(db, "quote_requests", saved?.id, notice);
    return { calls, sent, saved, recorded };
  }

  for (const failItemsColumn of [false, true]) {
    const r = await pipeline({ failItemsColumn });
    const label = failItemsColumn ? "database without the items column" : "database with migration 33";
    assert.equal(r.saved.id, 77, label);
    assert.equal(r.saved.tracking_code, "MH-AAAA-BBBB-CCCC", `${label}: the stored row's tracking code must come back`);
    assert.equal(r.sent.length, 1, label);
    const text = r.sent[0].text;
    assert.match(text, /^Medoria Health: new inquiry #77\nCode: MH-AAAA-BBBB-CCCC\n/, label);
    assert.match(text, /Products \(4\): Gloves x 50; Masks x 7; Gowns x 1 \+1 more/, `${label}: the product list is in the notice`);
    assert.equal(r.recorded, true, label);
    const upd = r.calls.find((c) => c.update);
    assert.deepEqual(upd.update, { notify_status: "sent", notify_detail: null }, label);
    assert.deepEqual(upd.eq, ["id", 77], `${label}: the result is recorded on the stored row`);
    const inserts = r.calls.filter((c) => c.insert);
    if (failItemsColumn) {
      assert.equal(inserts.length, 2, "the insert is repeated once without the items column");
      assert.ok(!("items" in inserts[1].insert));
      assert.match(inserts[1].insert.message, /- Gloves \(G-1\) × 50\n- Masks \(M-2\) × 7/, "the product list moved into the message: nothing is lost");
    } else {
      assert.equal(inserts.length, 1);
      assert.deepEqual(inserts[0].insert.items, items);
    }
  }
  // a failed notice is recorded as failed, with a class only
  const failedDb = { from: () => { const ch = { update(v) { ch.v = v; return ch; }, eq() { return Promise.resolve({ error: null, v: ch.v }); } }; return ch; } };
  assert.equal(await recordNotifyResult(failedDb, "quote_requests", 77, { sent: false, reason: "http_401" }), true);
});

// ── Telegram text ───────────────────────────────────────────────────────────

test("the new-inquiry notice shows the tracking code; without one it looks as before", () => {
  const row = { name: "Dr Karimov", product_name: "Gloves", quantity: 5, preferred_contact: "whatsapp", language: "tg", tracking_code: "MH-3F9A-C21B-77E0" };
  const withCode = formatQuoteNotice({ kind: "health", id: 12, row, siteUrl: "https://medoriaco.com" });
  assert.match(withCode, /^Medoria Health: new inquiry #12\nCode: MH-3F9A-C21B-77E0\nName: Dr Karimov/);
  const without = formatQuoteNotice({ kind: "health", id: 12, row: { ...row, tracking_code: undefined }, siteUrl: "https://medoriaco.com" });
  assert.ok(!/Code:/.test(without));
});

test("the reminder carries counts and the panel link only", () => {
  const summary = { waiting: 4, overdue: 3, notifyFailures: 2, oldestHours: 75, followUpsDue: 0 };
  const health = formatReminderNotice({ kind: "health", summary, siteUrl: "https://medoriaco.com/" });
  assert.match(health, /^Medoria Health: reminder\n3 inquiry\(ies\) unanswered for 24h\+ \(oldest 75h\)\n2 inquiry notice\(s\) could not be delivered/);
  assert.match(health, /Open: https:\/\/medoriaco\.com\/operator\/quotes$/);
  const beauty = formatReminderNotice({ kind: "beauty", summary: { ...summary, notifyFailures: 0 }, siteUrl: "https://medoriaco.com" });
  assert.match(beauty, /^Medoria Beauty: reminder/);
  assert.ok(!/delivered/.test(beauty));
  assert.match(beauty, /\/beauty\/operator\/quotes$/);
});

// ── reminder run ────────────────────────────────────────────────────────────

const ENV = {
  TELEGRAM_BOT_TOKEN: "123456789:AAH-testtoken_testtoken_testtoken_1234",
  TELEGRAM_CHAT_ID_HEALTH: "-1001111111111",
  TELEGRAM_CHAT_ID_BEAUTY: "-1002222222222",
  NEXT_PUBLIC_SITE_URL: "https://medoriaco.com",
};

// A db with one list per table; records the query it was asked.
function listDb(tables) {
  const queries = [];
  return {
    queries,
    from(table) {
      const q = { table, cols: null, gte: null, limit: null };
      queries.push(q);
      const res = tables[table];
      const chain = {
        select(cols) { q.cols = cols; return chain; },
        gte(col, v) { q.gte = [col, v]; return chain; },
        limit(n) { q.limit = n; return Promise.resolve(res instanceof Error ? { data: null, error: { code: "42703" } } : { data: res, error: null }); },
      };
      return chain;
    },
  };
}
function recordingFetch(status = 200) {
  const sent = [];
  const fetchImpl = async (url, init) => { sent.push({ url: String(url), body: JSON.parse(init.body) }); return { ok: status < 400, status }; };
  return { sent, fetchImpl };
}

test("the reminder run tells each house about its own overdue requests, with counts only", async () => {
  const db = listDb({
    quote_requests: [
      { status: "new", created_at: ago(30), customer: "Secret Clinic", phone: "+992900000001" },
      { status: "new", created_at: ago(2) },
    ],
    beauty_quote_requests: [{ status: "new", created_at: ago(50), notify_status: "failed" }, { status: "closed", created_at: ago(90) }],
  });
  const { sent, fetchImpl } = recordingFetch();
  const report = await runQuoteReminders({ db, env: ENV, fetchImpl, now: NOW });
  assert.equal(report.ok, true);
  assert.equal(sent.length, 2);
  const health = sent.find((s) => s.body.chat_id === "-1001111111111");
  const beauty = sent.find((s) => s.body.chat_id === "-1002222222222");
  assert.match(health.body.text, /^Medoria Health: reminder\n1 inquiry\(ies\) unanswered for 24h\+ \(oldest 30h\)\nOpen:/);
  assert.match(beauty.body.text, /^Medoria Beauty: reminder\n1 inquiry\(ies\) unanswered for 24h\+ \(oldest 50h\)\n1 inquiry notice\(s\) could not be delivered/);
  for (const s of sent) assert.ok(!/Secret|\+992/.test(JSON.stringify(s.body)), "no customer data in a reminder");
  // only the columns it needs, and only recent rows
  assert.equal(db.queries[0].cols, "status, created_at, first_response_at, notify_status");
  assert.equal(db.queries[0].gte[0], "created_at");
  assert.ok(db.queries[0].limit > 0);
});

test("nothing to report means no message", async () => {
  const db = listDb({ quote_requests: [{ status: "new", created_at: ago(1) }], beauty_quote_requests: [] });
  const { sent, fetchImpl } = recordingFetch();
  const report = await runQuoteReminders({ db, env: ENV, fetchImpl, now: NOW });
  assert.equal(sent.length, 0);
  assert.equal(report.ok, true);
  assert.ok(report.houses.every((h) => h.nothingToReport));
});

test("a house without Telegram is skipped; a delivery failure and a query failure make the run fail", async () => {
  const onlyHealth = { ...ENV, TELEGRAM_CHAT_ID_BEAUTY: "" };
  const db = listDb({ quote_requests: [{ status: "new", created_at: ago(40) }], beauty_quote_requests: [{ status: "new", created_at: ago(40) }] });
  const a = recordingFetch();
  const r1 = await runQuoteReminders({ db, env: onlyHealth, fetchImpl: a.fetchImpl, now: NOW });
  assert.equal(r1.ok, true);
  assert.equal(r1.houses.find((h) => h.kind === "beauty").skipped, "not_configured");
  assert.equal(a.sent.length, 1);

  const b = recordingFetch(401);
  const r2 = await runQuoteReminders({ db, env: ENV, fetchImpl: b.fetchImpl, now: NOW });
  assert.equal(r2.ok, false);
  assert.equal(r2.houses[0].reason, "http_401");

  const broken = listDb({ quote_requests: new Error("x"), beauty_quote_requests: [] });
  const c = recordingFetch();
  const r3 = await runQuoteReminders({ db: broken, env: ENV, fetchImpl: c.fetchImpl, now: NOW });
  assert.equal(r3.ok, false, "a table without migration 32 must be visible as a failure, not silence");
  assert.equal(r3.houses[0].error, "query_failed");
});

test("sendTelegramText reports the class of a failure and never the bot token", async () => {
  const logs = [];
  const orig = console.error; console.error = (...a) => logs.push(a.join(" "));
  try {
    const boom = async () => { throw Object.assign(new Error(`connect ECONNREFUSED https://api.telegram.org/bot${ENV.TELEGRAM_BOT_TOKEN}/sendMessage`), { name: "FetchError" }); };
    const res = await sendTelegramText("health", "hi", { env: ENV, fetchImpl: boom });
    assert.deepEqual(res, { sent: false, reason: "network" });
  } finally { console.error = orig; }
  assert.ok(!logs.join("\n").includes("AAH-testtoken"));
});

// ── the endpoint ────────────────────────────────────────────────────────────

test("the reminder endpoint is off without a long token, refuses a wrong one, and compares in constant time", () => {
  const src = read("app/api/internal/quote-reminders/route.js");
  assert.match(src, /expected\.length < 24\) return new NextResponse\(null, \{ status: 404/);
  assert.match(src, /status: 401/);
  assert.match(src, /timingSafeEqual/);
  assert.match(src, /export async function POST/);
  assert.ok(!/export async function GET/.test(src), "a link opened in a browser must do nothing");
  assert.match(src, /status: report\.ok \? 200 : 502/);
  assert.ok(!/console\.(log|info)\(/.test(src));
});

test("the panel shows code, assignee, waiting and notice-failure markers, and filters by them", () => {
  const panel = read("components/operator/QuotesPanel.jsx");
  assert.match(panel, /label=\{t\("کد پیگیری"\)\} value=\{x\.tracking_code\}/);
  assert.match(panel, /actions\.assignQuote\(/);
  assert.match(panel, /isOverdue\(x, \{ now \}\)/);
  assert.match(panel, /اعلان تلگرام نرسید/);
  assert.match(panel, /نیازمند پیگیری/);
  assert.match(panel, /x\.tracking_code, x\.assigned_to\]/);
  for (const f of ["components/operator/QuotesManager.jsx", "components/beauty/operator/QuotesManager.jsx"]) {
    assert.match(read(f), /assignQuote/);
  }
});

test("migration 32 adds the columns to both tables, is one transaction, and does not touch the private-table lock-down", () => {
  const raw = read("migrations/32_quote_management.sql");
  const sql = raw.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  assert.match(sql, /^BEGIN;/m);
  assert.match(sql, /^COMMIT;/m);
  for (const t of ["quote_requests", "beauty_quote_requests"]) assert.ok(sql.includes(`'${t}'`));
  for (const c of ["tracking_code", "assigned_to", "first_response_at", "notify_status", "notify_detail"]) assert.match(sql, new RegExp(`ADD COLUMN IF NOT EXISTS ${c}`));
  assert.match(sql, /gen_random_uuid\(\)/);
  assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS/);
  assert.match(sql, /RAISE EXCEPTION 'migration 32 self-check failed/);
  assert.match(sql, /SECURITY DEFINER SET search_path = public, pg_catalog/);
  assert.ok(!/\b(DELETE FROM|TRUNCATE|DROP TABLE|DROP COLUMN)\b/i.test(sql));
  assert.ok(!/\bGRANT\b|\bCREATE POLICY\b|DISABLE ROW LEVEL SECURITY/i.test(sql), "migration 32 must not open anything");
  assert.ok(!/ON\s+(?:public\.)?(?:quote_requests|beauty_quote_requests)[^;]*\bTO\s+(anon|authenticated|PUBLIC)\b/i.test(sql));
});
