// Stock counts and minimum levels (lib/warehouse/countsCore.js, countsStore.js, countsActions.js): the arithmetic, the cleaning of what is
// typed, who may do what, the approval of a closing (and its refusal when the count changed meanwhile), and that closing posts each
// difference once. The database functions are stubbed (their behaviour is proved on real PostgreSQL in warehouse-migration.test.mjs); the
// tables of migration 41 are proved in warehouse-counts-migration.test.mjs.
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createMemoryAdmin } from "./helpers/memoryAdmin.mjs";
import { simulateCountClose } from "./helpers/countCloseSim.mjs";
import { cleanCountedEntries, cleanLevel, COUNT_MESSAGES, countCsv, countDelta, countKey, differencesOf, isLow, movementsCsv, parseCounted, proposalText, stockCsv, summarize } from "../lib/warehouse/countsCore.js";
import * as counts from "../lib/warehouse/countsActions.js";
import { requireAll, evaluateAll } from "../lib/operator/access.js";
import { fileForApproval } from "../lib/operator/approvalFlow.js";
import { approveRequest } from "../lib/operator/approvals.js";
import { rowToUser, invalidateSessionUser } from "../lib/operator/accounts.js";
import { AUDIT_LABELS, sanitizeDetail } from "../lib/operator/security.js";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const urow = (n, o = {}) => ({
  id: id(n), username: `user${n}`, display_name: `User ${n}`, password_hash: "scrypt:1:2:3:aa:bb", status: "active", role: "viewer", houses: ["health"], allow_perms: [], deny_perms: [],
  approval: {}, require_2fa: false, totp_secret_enc: null, recovery_hashes: [], must_change_password: false, authz_version: 1, version: 1, ...o,
});

test("countDelta / countKey / parseCounted: exact to three decimals, an empty count is not zero", () => {
  assert.equal(countDelta(10, 9), -1);
  assert.equal(countDelta(0.1, 0.3), 0.2, "no floating-point dust");
  assert.equal(countDelta(5, null), null);
  assert.equal(countDelta(5, ""), null);
  assert.equal(countDelta(5, 0), -5, "counting an empty shelf is a count");
  assert.equal(countKey(3, 45), "count-3-45");
  assert.deepEqual(parseCounted("0"), { ok: true, value: 0 });
  assert.deepEqual(parseCounted("۱۲٫۵"), { ok: true, value: 12.5 });
  assert.deepEqual(parseCounted(""), { ok: true, value: null });
  for (const bad of ["-1", "x", "1.2345", "100000000"]) assert.equal(parseCounted(bad).ok, false, bad);
});

test("cleanCountedEntries: bounded, one row per product, the first bad row refuses the whole save", () => {
  assert.deepEqual(cleanCountedEntries([{ productId: 1, counted: "3" }, { productId: 1, counted: "9" }, { productId: 2, counted: "" }]).entries, [{ productId: 1, counted: 3 }, { productId: 2, counted: null }]);
  assert.equal(cleanCountedEntries([]).ok, false);
  assert.equal(cleanCountedEntries([{ productId: 0, counted: "1" }]).ok, false);
  assert.equal(cleanCountedEntries([{ productId: 1, counted: "1" }, { productId: 2, counted: "no" }]).error, COUNT_MESSAGES.bad_counted);
  assert.equal(cleanCountedEntries(Array.from({ length: 501 }, (_, i) => ({ productId: i + 1, counted: "1" }))).error, COUNT_MESSAGES.too_many);
});

test("cleanLevel / isLow: empty removes the level, zero never flags", () => {
  assert.deepEqual(cleanLevel({ productId: 4, minLevel: "5" }).value, { productId: 4, sku: null, minLevel: 5 });
  assert.equal(cleanLevel({ sku: " A-1 ", minLevel: "" }).value.minLevel, null);
  assert.equal(cleanLevel({ minLevel: "5" }).ok, false, "no product");
  assert.equal(cleanLevel({ productId: 4, minLevel: "-2" }).error, COUNT_MESSAGES.bad_level);
  assert.deepEqual([isLow(2, 5), isLow(5, 5), isLow(2, 0), isLow(2, null)], [true, false, false, false]);
});

test("differencesOf / summarize / proposalText", () => {
  const lines = [
    { product_id: 9, sku: "B", expected: 4, counted: 4 }, { product_id: 3, sku: "A", expected: 10, counted: 7 },
    { product_id: 5, sku: "C", expected: 1, counted: null }, { product_id: 2, sku: "D", expected: 0, counted: 2.5 },
  ];
  assert.deepEqual(differencesOf(8, lines), [{ productId: 2, sku: "D", delta: 2.5, key: "count-8-2" }, { productId: 3, sku: "A", delta: -3, key: "count-8-3" }]);
  assert.deepEqual(summarize(lines), { total: 4, counted: 3, uncounted: 1, differences: 2, short: 1, over: 1 });
  assert.equal(proposalText(differencesOf(8, lines)), "D: +2.5; A: -3");
  assert.match(proposalText(Array.from({ length: 20 }, (_, i) => ({ productId: i, sku: `S${i}`, delta: 1 }))), /… \(\+8\)$/);
});

test("the CSV reports are formula-safe and carry the computed columns", () => {
  const csv = stockCsv([{ sku: "=HYPERLINK(1)", name: "Gloves", warehouse: "Main", quantity: 4, reserved: 1, minLevel: 5, low: true }]);
  assert.match(csv, /^﻿sku,name,warehouse,quantity,reserved,available,min_level,low\r\n'=HYPERLINK\(1\),Gloves,Main,4,1,3,5,yes$/);
  assert.match(countCsv([{ sku: "A", expected: 5, counted: 3 }, { sku: "B", expected: 2, counted: null }]), /A,5,3,-2\r\nB,2,,$/);
  assert.match(movementsCsv([{ id: 1, created_at: "2026-10-01", kind: "receive", sku: "A", warehouse: "Main", delta: 5, balance_after: 5, reason: "@x", reference: "", actor_label: "sara" }]), /\r\n1,2026-10-01,receive,A,Main,5,5,'@x,,sara$/);
});

// ── the actions ─────────────────────────────────────────────────────────────────────────────────────────────────────────
let db, audits, posted, nextCount;
const rpc = {
  health_stock_post: (a) => { posted.push(a); return rpc.result(a); }, result: () => ({ data: { ok: true, replayed: false, movement_ids: [1], balance_after: 0 }, error: null }),
  // the transactional close of migration 41 (see tests/helpers/countCloseSim.mjs): every difference through health_stock_post, all or nothing
  health_stock_count_close: (args) => simulateCountClose({ tables: db.tables, house: "health", args, snapshot: () => posted.length, restore: (n) => posted.splice(n),
    post: (a) => { const r = rpc.health_stock_post(a); return r.error ? r : null; } }),
};
const manager = urow(1, { role: "warehouse_manager" });             // closing a count needs approval by default
const boss = urow(2, { role: "house_admin" });
const viewer = urow(3, { role: "viewer" });
function ctxFor(row) {
  const user = rowToUser(db.tables.operator_users.find((r) => r.id === row.id));
  const session = { sid: "s", uid: user.id, user, username: user.username };
  const audit = async (action, meta = {}) => { audits.push({ action, ...meta }); return { ok: true }; };
  const base = { admin: db, session, panel: "health", audit };
  return { ...base, require: (ops) => requireAll({ session, panel: "health", operations: [].concat(ops), audit }), evaluate: (ops) => evaluateAll({ session, panel: "health", operations: [].concat(ops), audit }), file: (spec) => fileForApproval(base, spec) };
}
beforeEach(() => {
  invalidateSessionUser();
  audits = []; posted = []; nextCount = 0;
  rpc.result = () => ({ data: { ok: true, replayed: false, movement_ids: [1], balance_after: 0 }, error: null });
  db = createMemoryAdmin({
    operator_users: [manager, boss, viewer], operator_change_requests: [],
    products: [{ id: 7, sku: "G-7", name_en: "Gloves" }, { id: 8, sku: "M-8", name_en: "Masks" }],
    health_stock_locations: [{ id: 1, code: "MAIN", name: "Main", is_active: true }, { id: 2, code: "OLD", name: "Old", is_active: false }],
    health_stock_balances: [{ location_id: 1, product_id: 7, quantity: 10, reserved: 0 }, { location_id: 1, product_id: 8, quantity: 4, reserved: 0 }],
    health_stock_levels: [], health_stock_counts: [], health_stock_count_lines: [],
  }, {
    rpc, unique: { health_stock_levels: [["product_id"]] },
    defaults: {
      health_stock_counts: () => ({ id: ++nextCount, status: "open", created_at: "2026-10-01T10:00:00.000Z", closed_at: null }),
      operator_change_requests: () => ({ id: `00000000-0000-4000-9000-${String(Math.floor(Math.random() * 1e12)).padStart(12, "0")}`, status: "pending", requested_at: "2026-10-01T10:00:00.000Z" }),
    },
  });
});
const start = async (who = boss) => (await counts.startCount(ctxFor(who), { locationId: 1, note: " monthly " })).id;
const enter = (who, countId, entries) => counts.saveCounted(ctxFor(who), { countId, entries });

test("a viewer can do nothing here and no database function is called", async () => {
  const c = ctxFor(viewer);
  for (const r of [await counts.startCount(c, { locationId: 1 }), await counts.saveCounted(c, { countId: 1, entries: [{ productId: 7, counted: 1 }] }), await counts.cancelCount(c, { countId: 1 }), await counts.closeCount(c, { countId: 1 }), await counts.setMinLevel(c, { productId: 7, minLevel: 2 }), await counts.exportStockCsv(c), await counts.exportMovementsCsv(c), await counts.exportCountCsv(c, { countId: 1 })]) {
    assert.equal(r.ok, false); assert.equal(r.denied, true);
  }
  assert.equal(db.rpcLog.length, 0);
  assert.equal(db.tables.health_stock_counts.length, 0);
});

test("starting a count snapshots the warehouse; an inactive or unknown warehouse is refused; one open count per warehouse", async () => {
  const r = await counts.startCount(ctxFor(boss), { locationId: 1, note: " monthly " });
  assert.deepEqual([r.ok, r.id, r.lines], [true, 1, 2]);
  assert.equal(db.tables.health_stock_counts[0].note, "monthly");
  assert.deepEqual(db.tables.health_stock_count_lines.map((l) => [l.product_id, l.sku, l.expected, l.counted ?? null]), [[7, "G-7", 10, null], [8, "M-8", 4, null]]);
  assert.equal((await counts.startCount(ctxFor(boss), { locationId: 2 })).error, COUNT_MESSAGES.location_inactive);
  assert.equal((await counts.startCount(ctxFor(boss), { locationId: 99 })).ok, false);
  db.fail = (table, op) => (table === "health_stock_counts" && op === "insert" ? { code: "23505", message: 'duplicate key value violates unique constraint "health_stock_counts_one_open"' } : null);
  const second = await counts.startCount(ctxFor(boss), { locationId: 1 });
  assert.equal(second.error, COUNT_MESSAGES.count_open_exists);
  assert.deepEqual(audits.filter((a) => a.action === "stock.count_start").map((a) => a.result), ["success", "failure", "failure", "failure"]);
});

test("a count whose lines cannot be written is cancelled again, never left open and empty", async () => {
  db.fail = (table, op) => (table === "health_stock_count_lines" && op === "insert" ? { code: "XX000", message: "boom" } : null);
  const r = await counts.startCount(ctxFor(boss), { locationId: 1 });
  assert.equal(r.ok, false);
  assert.equal(db.tables.health_stock_counts[0].status, "cancelled");
});

test("entering counted quantities; an unknown line is refused; add a product that was not on the list", async () => {
  const cid = await start();
  assert.deepEqual(await enter(boss, cid, [{ productId: 7, counted: "9" }, { productId: 8, counted: "" }]), { ok: true, saved: 2 });
  assert.deepEqual(db.tables.health_stock_count_lines.map((l) => l.counted ?? null), [9, null]);
  assert.equal(db.tables.health_stock_count_lines[0].counted_label, "user2");
  assert.equal((await enter(boss, cid, [{ productId: 99, counted: "1" }])).error, COUNT_MESSAGES.bad_count);
  db.tables.products.push({ id: 9, sku: "N-9" });
  const added = await counts.addCountLine(ctxFor(boss), { countId: cid, sku: "n-9", counted: "2" });
  assert.deepEqual([added.ok, added.productId], [true, 9]);
  assert.deepEqual(db.tables.health_stock_count_lines.find((l) => l.product_id === 9).expected, 0);
  assert.equal((await counts.addCountLine(ctxFor(boss), { countId: cid, sku: "NOPE", counted: "2" })).ok, false);
});

test("closing directly posts one adjustment per difference with its own key, then closes; closing again changes nothing", async () => {
  const cid = await start();
  await enter(boss, cid, [{ productId: 7, counted: "9" }, { productId: 8, counted: "4" }]);
  const r = await counts.closeCount(ctxFor(boss), { countId: cid });
  assert.deepEqual([r.ok, r.differences], [true, 1]);
  assert.equal(posted.length, 1, "the line without a difference posts nothing");
  assert.deepEqual([posted[0].p_kind, posted[0].p_product, posted[0].p_location, posted[0].p_qty, posted[0].p_key, posted[0].p_reference, posted[0].p_actor], ["adjust", 7, 1, -1, "count-1-7", "count-1", boss.id]);
  assert.equal(db.tables.health_stock_counts[0].status, "closed");
  assert.equal(db.tables.health_stock_counts[0].differences, 1);
  const again = await counts.closeCount(ctxFor(boss), { countId: cid });
  assert.deepEqual([again.ok, again.differences], [true, 1], "closing a closed count is a harmless replay");
  assert.equal(posted.length, 1, "…that posts nothing");
  assert.equal(audits.filter((a) => a.action === "stock.count_close" && a.result === "success").length, 1, "and is not logged as a second close");
  assert.ok(audits.some((a) => a.action === "stock.count_close" && a.result === "success" && a.detail.differences === 1));
});

test("a difference that cannot be posted rolls EVERYTHING back, keeps the count open and names the line; closing again works", async () => {
  const cid = await start();
  await enter(boss, cid, [{ productId: 7, counted: "0" }, { productId: 8, counted: "6" }]);
  rpc.result = (a) => (a.p_product === 8 ? { data: null, error: { message: "stock:insufficient_stock", details: "available=3" } } : { data: { ok: true, replayed: false, movement_ids: [2] }, error: null });
  const r = await counts.closeCount(ctxFor(boss), { countId: cid });
  assert.equal(r.ok, false);
  assert.deepEqual(r.failed.map((f) => f.sku), ["M-8"], "the second of two differences failed");
  assert.equal(r.error, COUNT_MESSAGES.some_failed);
  assert.deepEqual(r.failed[0].params, { available: "3" });
  assert.equal(db.tables.health_stock_counts[0].status, "open");
  assert.deepEqual(posted, [], "the first difference was undone with the rest — no partial posting");
  rpc.result = () => ({ data: { ok: true, replayed: false, movement_ids: [2] }, error: null });
  const retry = await counts.closeCount(ctxFor(boss), { countId: cid });
  assert.deepEqual([retry.ok, retry.differences], [true, 2]);
  assert.deepEqual(posted.map((p) => p.p_key), ["count-1-7", "count-1-8"], "each difference is posted once, with its own key");
  assert.equal(db.tables.health_stock_counts[0].status, "closed");
});

test("nothing counted: a close is refused; cancelling ends it without posting", async () => {
  const cid = await start();
  assert.equal((await counts.closeCount(ctxFor(boss), { countId: cid })).error, COUNT_MESSAGES.nothing_counted);
  assert.deepEqual(await counts.cancelCount(ctxFor(boss), { countId: cid }), { ok: true });
  assert.equal(db.tables.health_stock_counts[0].status, "cancelled");
  assert.equal(posted.length, 0);
  assert.equal((await counts.cancelCount(ctxFor(boss), { countId: cid })).ok, false, "decided once");
});

test("a manager whose policy says 'approve' files the closing; the reviewer's approval posts it once, as the manager", async () => {
  const cid = await start(manager);
  await enter(manager, cid, [{ productId: 7, counted: "8" }, { productId: 8, counted: "5" }]);
  const filed = await counts.closeCount(ctxFor(manager), { countId: cid });
  assert.deepEqual([filed.ok, filed.pending], [true, true]);
  assert.equal(posted.length, 0, "nothing moved");
  const req = db.tables.operator_change_requests[0];
  assert.deepEqual([req.operation, req.entity, req.entity_id, req.status, req.resource], ["inventory.count_close", "stock_count", cid, "pending", "inventory"]);
  assert.equal(req.proposed.summary, "G-7: -2; M-8: +1");
  assert.equal(db.tables.health_stock_counts[0].status, "open");
  const reviewer = rowToUser(db.tables.operator_users.find((r) => r.id === boss.id));
  const executors = counts.makeCountExecutors({ panel: "health" });
  const done = await approveRequest(db, { reviewer, panel: "health", id: req.id, executors });
  assert.equal(done.ok, true, JSON.stringify(done));
  assert.deepEqual(posted.map((p) => [p.p_key, p.p_qty, p.p_actor, p.p_request]), [["count-1-7", -2, manager.id, req.id], ["count-1-8", 1, manager.id, req.id]]);
  assert.equal(db.tables.health_stock_counts[0].status, "closed");
  assert.equal((await approveRequest(db, { reviewer, panel: "health", id: req.id, executors })).ok, false);
  assert.equal(posted.length, 2);
});

test("an approval whose count changed since it was filed fails as stale and posts nothing", async () => {
  const cid = await start(manager);
  await enter(manager, cid, [{ productId: 7, counted: "8" }]);
  await counts.closeCount(ctxFor(manager), { countId: cid });
  await enter(manager, cid, [{ productId: 7, counted: "3" }]);          // edited after filing
  const req = db.tables.operator_change_requests[0];
  const reviewer = rowToUser(db.tables.operator_users.find((r) => r.id === boss.id));
  const done = await approveRequest(db, { reviewer, panel: "health", id: req.id, executors: counts.makeCountExecutors({ panel: "health" }) });
  assert.equal(done.ok, false);
  assert.equal(posted.length, 0);
  assert.equal(db.tables.health_stock_counts[0].status, "open");
});

test("minimum levels: set, change, remove, by SKU; a missing product is refused", async () => {
  assert.deepEqual(await counts.setMinLevel(ctxFor(boss), { sku: "g-7", minLevel: "5" }), { ok: true, removed: false });
  assert.deepEqual(db.tables.health_stock_levels.map((l) => [l.product_id, l.min_level, l.updated_label]), [[7, 5, "user2"]]);
  await counts.setMinLevel(ctxFor(boss), { productId: 7, minLevel: "8" });
  assert.equal(db.tables.health_stock_levels.length, 1);
  assert.equal(db.tables.health_stock_levels[0].min_level, 8);
  assert.deepEqual(await counts.setMinLevel(ctxFor(boss), { productId: 7, minLevel: "" }), { ok: true, removed: true });
  assert.equal(db.tables.health_stock_levels.length, 0);
  assert.equal((await counts.setMinLevel(ctxFor(boss), { sku: "NOPE", minLevel: "1" })).ok, false);
});

test("reports need the export right (a manager has none by default), include the minimum level, and are logged", async () => {
  assert.equal((await counts.exportStockCsv(ctxFor(manager))).denied, true);
  await counts.setMinLevel(ctxFor(boss), { productId: 8, minLevel: "10" });
  const r = await counts.exportStockCsv(ctxFor(boss), {});
  assert.equal(r.ok, true);
  assert.match(r.filename, /^stock-health-\d{4}-\d{2}-\d{2}\.csv$/);
  assert.match(r.csv, /M-8,Masks,Main,4,0,4,10,yes/);
  assert.match(r.csv, /G-7,Gloves,Main,10,0,10,,\r?$/m);
  const cid = await start();
  assert.match((await counts.exportCountCsv(ctxFor(boss), { countId: cid })).csv, /^﻿sku,expected,counted,difference/);
  assert.ok(audits.filter((a) => a.action === "stock.export").length >= 2);
});

test("the activity log keeps what these actions say (count, lines, differences, minimum) and labels every action", () => {
  assert.deepEqual(sanitizeDetail({ count: 3, lines: 40, differences: 2, min: 5, added: true, kind: "stock", secret: "x", sku: "A-1" }), { count: 3, lines: 40, differences: 2, min: 5, added: true, kind: "stock", sku: "A-1" });
  for (const a of ["stock.count_start", "stock.count_save", "stock.count_cancel", "stock.count_close", "stock.level", "stock.export"]) assert.ok(AUDIT_LABELS[a], a);
});
