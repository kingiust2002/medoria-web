// Warehouse lots, expiry and quarantine — the application layer (lib/warehouse/lotsCore.js, core.js, store.js, actionsCore.js, pageData.js) and the
// screens' wiring. The database functions are stubbed here (their behaviour — usable stock, the guards, atomicity, replay — is proved on real
// PostgreSQL in warehouse-lots-migration.test.mjs); what is proved here is what the application adds: the cleaning of what is typed, the choice of
// function, who may do what, the messages, the approval of an adjustment that names a lot, and what the stock and lots screens are told.
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createMemoryAdmin } from "./helpers/memoryAdmin.mjs";
import {
  LOT_MESSAGES, cleanLotCode, cleanLotUpdate, daysBetween, describeLots, isLowUsable, lotState, summarizeAlerts, teamToday, unusableByProduct, usableOf, validDate,
} from "../lib/warehouse/lotsCore.js";
import { cleanMovement, names, stockError, STOCK_MESSAGES } from "../lib/warehouse/core.js";
import * as store from "../lib/warehouse/store.js";
import * as actions from "../lib/warehouse/actionsCore.js";
import { loadWarehouse } from "../lib/warehouse/pageData.js";
import { requireAll, evaluateAll } from "../lib/operator/access.js";
import { fileForApproval } from "../lib/operator/approvalFlow.js";
import { approveRequest } from "../lib/operator/approvals.js";
import { rowToUser, invalidateSessionUser } from "../lib/operator/accounts.js";
import { OPERATIONS, ROLES, can } from "../lib/operator/authz.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const KEY = "key-0000-0001";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const urow = (n, o = {}) => ({
  id: id(n), username: `user${n}`, display_name: `User ${n}`, password_hash: "scrypt:1:2:3:aa:bb", status: "active", role: "viewer", houses: ["health"], allow_perms: [], deny_perms: [],
  approval: {}, require_2fa: false, totp_secret_enc: null, recovery_hashes: [], must_change_password: false, authz_version: 1, version: 1, ...o,
});

const TODAY = teamToday();
const day = (n) => new Date(Date.parse(`${TODAY}T12:00:00.000Z`) + n * 86_400_000).toISOString().slice(0, 10);

// ── pure rules ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
test("a lot's state: rejected and quarantine are decisions and win; an expiry date is the LAST valid day", () => {
  assert.equal(lotState({ status: "active", expiry_date: null }, TODAY), "active");
  assert.equal(lotState({ status: "active", expiry_date: TODAY }, TODAY), "active", "the day itself is still valid");
  assert.equal(lotState({ status: "active", expiry_date: day(-1) }, TODAY), "expired");
  assert.equal(lotState({ status: "quarantine", expiry_date: day(-1) }, TODAY), "quarantine");
  assert.equal(lotState({ status: "rejected", expiry_date: day(30) }, TODAY), "rejected");
  assert.equal(lotState({ status: "active", expiry_date: `${day(-1)}T00:00:00+00:00` }, TODAY), "expired", "a full timestamp is read by its date");
  assert.equal(daysBetween(TODAY, day(5)), 5); assert.equal(daysBetween(TODAY, day(-2)), -2); assert.equal(daysBetween(TODAY, null), null);
});

const lots = [
  { id: 1, product_id: 10, lot_code: "A", expiry_date: day(10), status: "active", version: 1 },
  { id: 2, product_id: 10, lot_code: "B", expiry_date: day(-3), status: "active", version: 1 },
  { id: 3, product_id: 10, lot_code: "C", expiry_date: null, status: "quarantine", version: 2 },
  { id: 4, product_id: 11, lot_code: "D", expiry_date: day(100), status: "active", version: 1 },
  { id: 5, product_id: 11, lot_code: "E", expiry_date: day(1), status: "rejected", version: 3 },
  { id: 6, product_id: 11, lot_code: "F", expiry_date: day(-9), status: "active", version: 1 },    // empty lot: counts nowhere
];
const lotBalances = [
  { lot_id: 1, location_id: 1, quantity: "4.000" }, { lot_id: 1, location_id: 2, quantity: "1.000" }, { lot_id: 2, location_id: 1, quantity: "2.000" },
  { lot_id: 3, location_id: 1, quantity: "3.000" }, { lot_id: 4, location_id: 1, quantity: "6.000" }, { lot_id: 5, location_id: 2, quantity: "1.500" },
];

test("describeLots / unusableByProduct: quantity per lot and place, usable only for active lots, per product and per warehouse", () => {
  const d = describeLots(lots, lotBalances, TODAY);
  assert.deepEqual([d.get(1).quantity, d.get(1).byLocation, d.get(1).state, d.get(1).daysLeft], [5, { 1: 4, 2: 1 }, "active", 10]);
  assert.deepEqual([d.get(2).state, d.get(2).usableQuantity, d.get(2).daysLeft], ["expired", 0, -3]);
  assert.deepEqual([d.get(6).quantity, d.get(6).state], [0, "expired"]);
  assert.deepEqual([...unusableByProduct(d)].map(([k, v]) => [k, v]), [[10, { lotQuantity: 10, unusable: 5 }], [11, { lotQuantity: 7.5, unusable: 1.5 }]]);
  assert.deepEqual(unusableByProduct(d, { locationId: 2 }).get(10), { lotQuantity: 1, unusable: 0 }, "a warehouse filter looks at that warehouse only");
  assert.equal(usableOf(20, 4, 5), 11);
  assert.equal(usableOf(5, 4, 5), 0, "never negative");
  assert.equal(isLowUsable(10, 5, 6), true, "10 on hand, 5 of it unusable, minimum 6");
  assert.equal(isLowUsable(10, 0, 6), false); assert.equal(isLowUsable(10, 5, 0), false); assert.equal(isLowUsable(10, 5, null), false);
});

test("alerts count lots that still hold stock: expired, expiring within the window, quarantine, rejected, low usable", () => {
  const d = describeLots(lots, lotBalances, TODAY);
  const { alerts, lists } = summarizeAlerts({ described: d, products: [{ low: true, reserved: 1, usable: 3, unusable: 5 }, { low: false, reserved: 0, usable: 9, unusable: 0 }], today: TODAY, window: 30 });
  assert.deepEqual(alerts, { expired: 1, expiring: 1, quarantine: 1, rejected: 1, lowUsable: 1, reservedUncovered: 0 });
  assert.deepEqual(lists, { expired: [2], expiring: [1], quarantine: [3], rejected: [5] });
  assert.equal(summarizeAlerts({ described: d, products: [], today: TODAY, window: 5 }).alerts.expiring, 0, "a smaller window");
  assert.equal(summarizeAlerts({ described: d, products: [], today: TODAY, window: 30, locationId: 2 }).alerts.expiring, 1, "lot 1 holds 1 in warehouse 2");
  assert.equal(summarizeAlerts({ described: d, products: [{ low: false, reserved: 4, usable: 1, unusable: 5 }], today: TODAY }).alerts.reservedUncovered, 1, "reserved stock the usable stock no longer covers");
});

test("cleanLotUpdate / cleanLotCode / validDate", () => {
  assert.equal(validDate("2027-02-28"), true); assert.equal(validDate("2027-02-30"), false); assert.equal(validDate("27-02-28"), false); assert.equal(validDate("1999-01-01"), false); assert.equal(validDate(20270228), false);
  assert.deepEqual(cleanLotCode("  A-100 "), { ok: true, value: "A-100" });
  for (const bad of ["", "   ", "x".repeat(41), "a\nb", "a\u0000b", null, 5]) assert.equal(cleanLotCode(bad).ok, false, JSON.stringify(bad));
  const ok = cleanLotUpdate({ lotId: "4", version: "2", status: "quarantine", reason: " supplier recall " });
  assert.deepEqual(ok.value, { lotId: 4, version: 2, status: "quarantine", setExpiry: false, expiry: null, reason: "supplier recall" });
  assert.deepEqual(cleanLotUpdate({ lotId: 4, version: 2, setExpiry: true, expiry: "2027-05-01", reason: "label corrected" }).value.expiry, "2027-05-01");
  assert.equal(cleanLotUpdate({ lotId: 4, version: 2, setExpiry: true, expiry: "", reason: "no date" }).value.expiry, null, "an empty date clears it");
  assert.equal(cleanLotUpdate({ lotId: 4, version: 2, reason: "nothing" }).error, LOT_MESSAGES.nothing_to_change);
  assert.equal(cleanLotUpdate({ lotId: 4, version: 2, status: "frozen", reason: "abc" }).error, LOT_MESSAGES.bad_status);
  assert.equal(cleanLotUpdate({ lotId: 4, version: 2, status: "active", reason: "ab" }).error, LOT_MESSAGES.reason_required);
  assert.equal(cleanLotUpdate({ lotId: 0, version: 2, status: "active", reason: "abc" }).error, LOT_MESSAGES.bad_lot_id);
  assert.equal(cleanLotUpdate({ lotId: 4, version: 0, status: "active", reason: "abc" }).error, LOT_MESSAGES.bad_version);
  assert.equal(cleanLotUpdate({ lotId: 4, version: 2, setExpiry: true, expiry: "soon", reason: "abc" }).error, LOT_MESSAGES.bad_expiry);
});

test("cleanMovement: a receipt names a lot by CODE (expiry and quarantine optional); issue, transfer and adjust name an existing lot by id", () => {
  const ok = (o) => cleanMovement({ key: KEY, productId: 1, locationId: 2, qty: 3, ...o });
  const r = ok({ kind: "receive", lotCode: " A-1 ", expiry: "2027-03-01", lotStatus: "quarantine" }).value;
  assert.deepEqual([r.lotCode, r.expiry, r.lotStatus, r.lotId], ["A-1", "2027-03-01", "quarantine", null]);
  assert.deepEqual([ok({ kind: "receive" }).value.lotCode, ok({ kind: "receive" }).value.lotId], [null, null], "no lot named = stock without a lot, as before");
  assert.equal(ok({ kind: "issue", lotId: "7" }).value.lotId, 7);
  assert.equal(ok({ kind: "adjust", qty: -1, reason: "expired, destroyed", lotId: 7 }).value.lotId, 7);
  for (const bad of [
    { kind: "issue", lotCode: "NEW" }, { kind: "receive", lotId: 7 }, { kind: "issue", lotId: 0 }, { kind: "issue", lotId: "x" }, { kind: "receive", lotCode: "A", lotId: 7 },
    { kind: "receive", expiry: "2027-03-01" }, { kind: "receive", lotStatus: "quarantine" }, { kind: "receive", lotCode: "A", expiry: "tomorrow" },
    { kind: "receive", lotCode: "A", lotStatus: "rejected" }, { kind: "receive", lotCode: "A\nB" }, { kind: "receive", lotCode: "x".repeat(41) },
  ]) assert.equal(ok(bad).ok, false, JSON.stringify(bad));
});

test("stockError: the lot refusals have words and keep the available quantity", () => {
  for (const code of ["bad_lot", "unknown_lot", "lot_not_usable", "insufficient_lot_stock", "lot_stock_protected", "lot_expiry_mismatch", "lot_rejected", "reserved_stock_in_lot", "stale_version", "nothing_to_change", "lot_identity_is_fixed"]) {
    assert.equal(stockError({ message: `stock:${code}` }).error, STOCK_MESSAGES[code], code);
  }
  assert.deepEqual(stockError({ message: "stock:insufficient_lot_stock", details: "available=1.500" }).params, { available: "1.5" });
  assert.deepEqual(stockError({ message: "stock:reserved_stock_in_lot", details: "available=2.000" }).params, { available: "2" });
  assert.equal(names("beauty").lotPost, "beauty_stock_lot_post"); assert.equal(names("health").lots, "health_stock_lots");
});

// ── the store: which function a movement goes through ─────────────────────────────────────────────────────────────────────
let db, calls;
const rpc = {};
const resetRpc = () => {
  for (const k of Object.keys(rpc)) delete rpc[k];
  rpc.health_stock_post = (a) => { calls.push(["post", a]); return { data: { ok: true, replayed: false, movement_ids: [11], balance_after: 5 }, error: null }; };
  rpc.health_stock_lot_post = (a) => { calls.push(["lot_post", a]); return { data: { ok: true, replayed: false, movement_ids: [11], balance_after: 5, lot_id: a.p_lot_id ?? 42 }, error: null }; };
  rpc.health_stock_reverse = (a) => { calls.push(["reverse", a]); return { data: { ok: true, replayed: false, movement_ids: [12] }, error: null }; };
  rpc.health_stock_lot_reverse = (a) => { calls.push(["lot_reverse", a]); return { data: { ok: true, replayed: false, movement_ids: [12] }, error: null }; };
  rpc.health_stock_lot_update = (a) => { calls.push(["lot_update", a]); return { data: { ok: true, lot_id: a.p_lot, version: a.p_expected_version + 1 }, error: null }; };
};
const who = { userId: "u", label: "tester", requestId: "wh-1" };
const base = { key: KEY, kind: "issue", productId: 7, locationId: 1, toLocationId: null, qty: 2, reason: null, reference: null, reservationId: null, lotId: null, lotCode: null, expiry: null, lotStatus: null };

test("store.post: stock without a lot goes through the older function exactly as before; a lot goes through the lot function with every argument", async () => {
  calls = []; resetRpc();
  const admin = createMemoryAdmin({}, { rpc });
  assert.equal((await store.post(admin, "health", base, who)).ok, true);
  assert.deepEqual(calls.map((c) => c[0]), ["post"]);
  assert.equal("p_lot_id" in calls[0][1], false, "the older function is called with the older arguments");
  calls = [];
  const r = await store.post(admin, "health", { ...base, kind: "receive", lotCode: "A-1", expiry: "2027-03-01", lotStatus: "quarantine" }, who);
  assert.equal(r.ok, true); assert.equal(r.result.lot_id, 42);
  assert.deepEqual(calls.map((c) => c[0]), ["lot_post"]);
  assert.deepEqual([calls[0][1].p_lot_code, calls[0][1].p_expiry, calls[0][1].p_lot_status, calls[0][1].p_lot_id, calls[0][1].p_key, calls[0][1].p_actor_label], ["A-1", "2027-03-01", "quarantine", null, KEY, "tester"]);
  calls = [];
  await store.post(admin, "health", { ...base, lotId: 5 }, who);
  assert.deepEqual([calls[0][0], calls[0][1].p_lot_id, calls[0][1].p_lot_code], ["lot_post", 5, null]);
});

test("before migration 45 a lot cannot be named — and the answer says so, without touching the ledger", async () => {
  calls = []; resetRpc();
  delete rpc.health_stock_lot_post; delete rpc.health_stock_lot_reverse; delete rpc.health_stock_lot_update;       // the function does not exist: the API answers PGRST202
  const admin = createMemoryAdmin({}, { rpc });
  const r = await store.post(admin, "health", { ...base, lotId: 5 }, who);
  assert.deepEqual([r.ok, r.code], [false, "lots_unavailable"]);
  assert.deepEqual(calls, [], "nothing was posted");
  assert.equal((await store.post(admin, "health", base, who)).ok, true, "movements without a lot still work");
  // reversals fall back to the older function; a lot update is "unavailable"
  calls = [];
  assert.equal((await store.reverse(admin, "health", { key: KEY, movementId: 3, reason: "wrong" }, who)).ok, true);
  assert.deepEqual(calls.map((c) => c[0]), ["reverse"]);
  assert.equal((await store.updateLotStatus(admin, "health", { lotId: 1, version: 1, status: "quarantine", reason: "abc" }, who)).code, "lots_unavailable");
});

test("store.reverse prefers the lot-aware function; a lot update carries the version and the reason", async () => {
  calls = []; resetRpc();
  const admin = createMemoryAdmin({}, { rpc });
  assert.equal((await store.reverse(admin, "health", { key: KEY, movementId: 3, reason: "wrong" }, who)).ok, true);
  assert.deepEqual(calls.map((c) => c[0]), ["lot_reverse"]);
  calls = [];
  const u = await store.updateLotStatus(admin, "health", { lotId: 8, version: 3, status: "quarantine", setExpiry: false, expiry: null, reason: "recall" }, who);
  assert.deepEqual([u.ok, u.version, calls[0][1].p_lot, calls[0][1].p_expected_version, calls[0][1].p_status, calls[0][1].p_set_expiry, calls[0][1].p_reason], [true, 4, 8, 3, "quarantine", false, "recall"]);
});

// ── the actions, with the real access rules ──────────────────────────────────────────────────────────────────────────────
let audits;
function ctxFor(row) {
  const user = rowToUser(db.tables.operator_users.find((r) => r.id === row.id));
  const session = { sid: "s", uid: user.id, user, username: user.username };
  const audit = async (action, meta = {}) => { audits.push({ action, ...meta }); return { ok: true }; };
  const base = { admin: db, session, panel: "health", audit };
  return {
    ...base,
    require: (ops) => requireAll({ session, panel: "health", operations: [].concat(ops), audit }),
    evaluate: (ops) => evaluateAll({ session, panel: "health", operations: [].concat(ops), audit }),
    file: (spec) => fileForApproval(base, spec),
  };
}
const manager = urow(1, { role: "warehouse_manager" });          // adjusts under approval by default
const boss = urow(2, { role: "house_admin" });
const viewer = urow(3, { role: "viewer" });
const clerk = urow(4, { role: "viewer", allow_perms: ["health.inventory.view", "health.inventory.receive", "health.inventory.issue"] });   // may move stock, may NOT decide quarantine
beforeEach(() => {
  invalidateSessionUser();
  audits = []; calls = []; resetRpc();
  db = createMemoryAdmin({
    operator_users: [manager, boss, viewer, clerk], operator_change_requests: [],
    products: [{ id: 7, sku: "G-7" }], health_stock_balances: [{ location_id: 1, product_id: 7, quantity: 5, reserved: 0 }], health_stock_locations: [],
  }, { rpc, defaults: { operator_change_requests: () => ({ id: `00000000-0000-4000-9000-${String(Math.floor(Math.random() * 1e12)).padStart(12, "0")}`, status: "pending", requested_at: "2026-10-01T10:00:00.000Z" }) } });
});

test("the quarantine decision is its own right: a warehouse manager has it, a clerk who can move stock does not, a viewer does not", () => {
  assert.equal("inventory.lot_status" in OPERATIONS, true);
  assert.equal(OPERATIONS["inventory.lot_status"], "inventory.quarantine");
  assert.equal(can(rowToUser(manager), "health.inventory.quarantine"), true);
  assert.equal(can(rowToUser(clerk), "health.inventory.quarantine"), false);
  assert.equal(can(rowToUser(viewer), "health.inventory.quarantine"), false);
  assert.equal(can(rowToUser(boss), "health.inventory.quarantine"), true);
  assert.ok(ROLES.warehouse_manager.perms.includes("inventory.quarantine"));
});

test("changing a lot: needs the right, calls the database with the version, logs; a stale version and a database refusal come back as messages", async () => {
  for (const u of [viewer, clerk]) {
    const r = await actions.updateLot(ctxFor(u), { lotId: 8, version: 3, status: "quarantine", reason: "recall" });
    assert.equal(r.denied, true);
  }
  assert.deepEqual(calls, [], "the database function is never reached without the right");
  const r = await actions.updateLot(ctxFor(manager), { lotId: 8, version: 3, status: "quarantine", reason: "supplier recall" });
  assert.deepEqual([r.ok, r.version], [true, 4]);
  assert.deepEqual(audits.at(-1), { action: "stock.lot_update", entity: "stock", ids: [8], result: "success", detail: { status: "quarantine" } });
  assert.equal(calls[0][1].p_actor, manager.id);
  // input is cleaned before anything is sent
  calls = [];
  assert.equal((await actions.updateLot(ctxFor(manager), { lotId: 8, version: 3, reason: "abc" })).error, LOT_MESSAGES.nothing_to_change);
  assert.deepEqual(calls, []);
  // refusals
  rpc.health_stock_lot_update = () => ({ data: null, error: { message: "stock:stale_version" } });
  const stale = await actions.updateLot(ctxFor(manager), { lotId: 8, version: 3, status: "active", reason: "released" });
  assert.deepEqual([stale.ok, stale.stale, stale.error], [false, true, STOCK_MESSAGES.stale_version]);
  rpc.health_stock_lot_update = () => ({ data: null, error: { message: "stock:reserved_stock_in_lot", details: "available=2.000" } });
  const held = await actions.updateLot(ctxFor(manager), { lotId: 8, version: 3, status: "quarantine", reason: "recall" });
  assert.deepEqual([held.ok, held.error, held.params], [false, STOCK_MESSAGES.reserved_stock_in_lot, { available: "2" }]);
  assert.deepEqual([audits.at(-1).action, audits.at(-1).result, audits.at(-1).detail.reason], ["stock.lot_update", "failure", "reserved_stock_in_lot"]);
});

test("a movement that names a lot is logged with the lot; issue with a lot needs the same right as issue without one", async () => {
  const r = await actions.postMovement(ctxFor(clerk), { key: KEY, kind: "issue", productId: 7, locationId: 1, qty: 2, lotId: 5 });
  assert.deepEqual([r.ok, r.lotId], [true, 5]);
  assert.deepEqual(audits.at(-1).detail, { qty: 2, location: 1, lot: 5 });
  const denied = await actions.postMovement(ctxFor(viewer), { key: "key-0000-0002", kind: "issue", productId: 7, locationId: 1, qty: 2, lotId: 5 });
  assert.equal(denied.denied, true);
});

test("an adjustment that names a lot and needs approval is FILED with the lot; the approval posts it through the lot function with the stored key", async () => {
  const filed = await actions.postMovement(ctxFor(manager), { key: KEY, kind: "adjust", productId: 7, locationId: 1, qty: -2, reason: "expired, destroyed", lotId: 5 });
  assert.deepEqual([filed.ok, filed.pending], [true, true]);
  assert.deepEqual(calls, [], "nothing moved");
  const req = db.tables.operator_change_requests[0];
  assert.equal(req.proposed._lot_id, 5); assert.equal(req.proposed._key, KEY);
  const reviewer = rowToUser(db.tables.operator_users.find((r) => r.id === boss.id));
  const executors = actions.makeWarehouseExecutors({ panel: "health" });
  const res = await approveRequest(db, { reviewer, panel: "health", id: req.id, executors });
  assert.equal(res.ok, true, JSON.stringify(res));
  assert.deepEqual(calls.map((c) => c[0]), ["lot_post"]);
  assert.deepEqual([calls[0][1].p_key, calls[0][1].p_kind, calls[0][1].p_qty, calls[0][1].p_lot_id], [KEY, "adjust", -2, 5]);
  // a lot that is no longer there / usable makes the approval stale (nothing half-applied)
  const f2 = await actions.postMovement(ctxFor(manager), { key: "key-0000-0003", kind: "adjust", productId: 7, locationId: 1, qty: -1, reason: "recount of the lot", lotId: 5 });
  assert.equal(f2.pending, true);
  rpc.health_stock_lot_post = () => ({ data: null, error: { message: "stock:insufficient_lot_stock", details: "available=0" } });
  const req2 = db.tables.operator_change_requests.find((r) => r.id !== req.id);
  const res2 = await approveRequest(db, { reviewer, panel: "health", id: req2.id, executors });
  assert.equal(res2.ok, false); assert.equal(res2.error, "stale");
});

// ── what the screens are told ────────────────────────────────────────────────────────────────────────────────────────────
function warehouse({ withLots = true, lotsError = false } = {}) {
  const seed = {
    health_stock_locations: [{ id: 1, code: "MAIN", name: "Main", note: null, is_active: true, sort_order: 0, version: 1 }, { id: 2, code: "SHOP", name: "Shop", note: null, is_active: true, sort_order: 1, version: 1 }],
    health_stock_balances: [
      { location_id: 1, product_id: 10, quantity: "20.000", reserved: "2.000", updated_at: "t" }, { location_id: 2, product_id: 10, quantity: "1.000", reserved: "0.000", updated_at: "t" },
      { location_id: 1, product_id: 11, quantity: "9.000", reserved: "0.000", updated_at: "t" },
    ],
    health_stock_levels: [{ product_id: 10, min_level: "18.000" }, { product_id: 11, min_level: "5.000" }],
    products: [{ id: 10, sku: "SKU-10", name_fa: "ده", name_en: "Ten" }, { id: 11, sku: "SKU-11", name_fa: "یازده", name_en: "Eleven" }],
    health_stock_movements: [
      { id: 100, idempotency_key: "k1", leg: 0, group_id: "g", kind: "receive", product_id: 10, sku: "SKU-10", location_id: 1, delta: "4.000", balance_after: "20.000", reverses_id: null, created_at: "2026-10-01T10:00:00Z" },
      { id: 101, idempotency_key: "k2", leg: 0, group_id: "g2", kind: "issue", product_id: 11, sku: "SKU-11", location_id: 1, delta: "-1.000", balance_after: "9.000", reverses_id: null, created_at: "2026-10-02T10:00:00Z" },
    ],
    health_stock_reservations: [],
    ...(withLots ? {
      health_stock_lots: lots.map((l) => ({ ...l, created_at: "2026-09-01T00:00:00Z", created_label: "sara" })),
      health_stock_lot_balances: lotBalances,
      health_stock_movement_lots: [{ movement_id: 100, lot_id: 1, delta: "4.000" }],
      health_stock_lot_events: [{ id: 1, lot_id: 3, kind: "status", from_value: "active", to_value: "quarantine", reason: "supplier recall", actor_label: "sara", created_at: "2026-10-03T10:00:00Z" }],
    } : {}),
  };
  const admin = createMemoryAdmin(seed, { maxRows: 1000 });
  if (lotsError) admin.fail = (table) => (table === "health_stock_lot_balances" ? { code: "XX000", message: "boom" } : null);
  return admin;
}

test("the stock list tells usable from unusable: quarantined, rejected and expired stock is not usable; low is judged on usable stock; alerts come with it", async () => {
  const data = await loadWarehouse(warehouse(), "health", { tab: "stock" });
  assert.equal(data.ok, true); assert.equal(data.lotsAvailable, true);
  const ten = data.items.find((i) => i.productId === 10), eleven = data.items.find((i) => i.productId === 11);
  // product 10: 21 on hand, 2 reserved; lots: A (5, usable), B (2, expired), C (3, quarantine) → unusable 5
  assert.deepEqual([ten.total, ten.reserved, ten.unusable, ten.usable], [21, 2, 5, 14]);
  assert.equal(ten.low, true, "21 - 5 = 16 is below the minimum of 18, although 21 is not");
  assert.deepEqual(ten.lots.map((l) => [l.code, l.state, l.quantity]), [["B", "expired", 2], ["A", "active", 5], ["C", "quarantine", 3]], "soonest expiry first, no date last");
  assert.deepEqual([eleven.unusable, eleven.low], [1.5, false], "lot E is rejected (1.5, in warehouse 2 only); lot D (6) is fine: 9 - 0 = 9 ≥ 5");
  assert.deepEqual(data.alerts, { expired: 1, expiring: 1, quarantine: 1, rejected: 1, lowUsable: 1, reservedUncovered: 0 });
  assert.equal(data.alertWindow, 30);
  const lowOnly = await loadWarehouse(warehouse(), "health", { tab: "stock", low: "1" });
  assert.deepEqual(lowOnly.items.map((i) => i.productId), [10]);
  const shop = await loadWarehouse(warehouse(), "health", { tab: "stock", location: "2" });
  assert.deepEqual(shop.items.find((i) => i.productId === 10).unusable, 0, "in the shop only 1 of lot A is held");
  assert.equal((await loadWarehouse(warehouse(), "health", { tab: "stock", window: "90" })).alertWindow, 90);
  assert.equal((await loadWarehouse(warehouse(), "health", { tab: "stock", window: "7" })).alertWindow, 30, "only the offered windows are accepted");
});

test("without migration 45 the warehouse works as before; a lots table that EXISTS but cannot be read is an error, never 'everything is usable'", async () => {
  const before = await loadWarehouse(warehouse({ withLots: false }), "health", { tab: "stock" });
  assert.equal(before.ok, true); assert.equal(before.lotsAvailable, false);
  const ten = before.items.find((i) => i.productId === 10);
  assert.deepEqual([ten.total, ten.unusable, ten.usable, ten.lots, ten.low], [21, 0, 19, [], false]);
  const lotsTab = await loadWarehouse(warehouse({ withLots: false }), "health", { tab: "lots" });
  assert.deepEqual([lotsTab.ok, lotsTab.lotsAvailable, lotsTab.lots], [true, false, []]);
  const broken = await loadWarehouse(warehouse({ lotsError: true }), "health", { tab: "stock" });
  assert.equal(broken.ok, false); assert.ok(broken.error);
  assert.equal((await loadWarehouse(warehouse({ lotsError: true }), "health", { tab: "lots" })).ok, false);
});

test("the lots tab: lots with stock only, soonest expiry first (no date last), filtered by view, searchable by lot code / SKU / warehouse", async () => {
  const codes = async (p) => (await loadWarehouse(warehouse(), "health", { tab: "lots", ...p })).lots.map((l) => l.code);
  assert.deepEqual(await codes({}), ["B", "E", "A", "D", "C"], "F is empty and not listed");
  assert.deepEqual(await codes({ view: "expired" }), ["B"]);
  assert.deepEqual(await codes({ view: "quarantine" }), ["C"]);
  assert.deepEqual(await codes({ view: "rejected" }), ["E"]);
  assert.deepEqual(await codes({ view: "expiring" }), ["A"]);
  assert.deepEqual(await codes({ view: "expiring", window: "90" }), ["A"], "D expires in 100 days");
  assert.deepEqual(await codes({ q: "sku-11" }), ["E", "D"], "by the product's SKU");
  assert.deepEqual(await codes({ q: "c" }), ["C"], "by lot code");
  assert.deepEqual(await codes({ location: "2" }), ["E", "A"], "only the lots that hold stock in that warehouse");
  assert.deepEqual(await codes({ view: "bogus" }), await codes({}), "an unknown view is the default one");
  const first = (await loadWarehouse(warehouse(), "health", { tab: "lots" })).lots[0];
  assert.deepEqual([first.code, first.sku, first.state, first.qty, first.daysLeft, first.version], ["B", "SKU-10", "expired", 2, -3, 1]);
});

test("an opened lot shows its history; movements show the lot they moved", async () => {
  const data = await loadWarehouse(warehouse(), "health", { tab: "lots", lot: "3" });
  assert.equal(data.openLot, 3);
  assert.deepEqual(data.history.events.map((e) => [e.kind, e.from, e.to, e.reason, e.who]), [["status", "active", "quarantine", "supplier recall", "sara"]]);
  const moves = await loadWarehouse(warehouse(), "health", { tab: "movements" });
  assert.deepEqual(moves.movements.map((m) => [m.id, m.lotCode ?? null]), [[101, null], [100, "A"]]);
  const noLots = await loadWarehouse(warehouse({ withLots: false }), "health", { tab: "movements" });
  assert.equal(noLots.ok, true, "movements still list before migration 45");
});

// ── wiring ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
test("both panels expose updateLot and the screen shows the lots tab, the alert strip and lot fields; nothing public names a lot table", () => {
  for (const f of ["lib/operator/warehouseActions.js", "lib/beauty/operator/warehouseActions.js"]) assert.match(read(f), /export async function updateLot\(input\)[\s\S]*?core\.updateLot\(a\.ctx, input\)/);
  for (const f of ["components/operator/warehouse/WarehouseManager.jsx", "components/beauty/operator/WarehouseManager.jsx"]) assert.match(read(f), /updateLot/);
  const panel = read("components/operator/warehouse/WarehousePanel.jsx");
  assert.match(panel, /id: "lots"/); assert.match(panel, /<LotAlerts/); assert.match(panel, /<LotsTab/); assert.match(panel, /wh-lot-code/); assert.match(panel, /wh-lot-select/);
  // the buttons follow the right; the dialog sends the version it showed
  assert.match(read("components/operator/warehouse/LotsTab.jsx"), /useCan\("inventory\.lot_status"\)/);
  assert.match(read("components/operator/warehouse/LotsTab.jsx"), /version: lot\.version/);
  // internal only: no public file (page, route, public component or data layer) names a lot table or function
  const publicFiles = ["lib/supabase.js", "lib/beauty/catalog.js", "lib/inquiry/save.js", "lib/actions/quote.js", "lib/beauty/actions/quote.js"];
  for (const f of publicFiles) assert.ok(!/_stock_lot|stock_today/.test(read(f)), `${f} must not name warehouse lots`);
  // the older posting functions are still what a movement without a lot uses
  assert.match(read("lib/warehouse/store.js"), /m\.lotId == null && m\.lotCode == null\) return rpcResult\(await admin\.rpc\(t\.post, common\)\)/);
});
