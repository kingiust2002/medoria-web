// The warehouse's application layer (lib/warehouse): input cleaning, the translation of the database's refusals, the permission and
// approval rules around each action, and the store's calls — against an in-memory database whose stored procedures are stubbed.
// (The procedures themselves — negative stock, replay, races — are proved on real PostgreSQL in warehouse-migration.test.mjs.)
import test, { beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createMemoryAdmin } from "./helpers/memoryAdmin.mjs";
import { cleanLocation, cleanMovement, parseQty, stockError, STOCK_MESSAGES, names, idempotencyKey } from "../lib/warehouse/core.js";
import * as actions from "../lib/warehouse/actionsCore.js";
import { requireAll, evaluateAll } from "../lib/operator/access.js";
import { fileForApproval } from "../lib/operator/approvalFlow.js";
import { approveRequest } from "../lib/operator/approvals.js";
import { rowToUser, invalidateSessionUser } from "../lib/operator/accounts.js";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const urow = (n, o = {}) => ({
  id: id(n), username: `user${n}`, display_name: `User ${n}`, password_hash: "scrypt:1:2:3:aa:bb", status: "active", role: "viewer", houses: ["health"], allow_perms: [], deny_perms: [],
  approval: {}, require_2fa: false, totp_secret_enc: null, recovery_hashes: [], must_change_password: false, authz_version: 1, version: 1, ...o,
});
const KEY = "key-0000-0001";

test("parseQty: digits in any script, at most three decimals, never zero, signed only on request", () => {
  assert.equal(parseQty("12"), 12);
  assert.equal(parseQty("12,5"), 12.5);
  assert.equal(parseQty("۱۲٫۵"), 12.5);
  assert.equal(parseQty(7), 7);
  for (const bad of ["", "0", "0.000", "-1", "1.2345", "abc", "1e3", "100000000", null, undefined, {}]) assert.equal(parseQty(bad), null, String(bad));
  assert.equal(parseQty("-3", { signed: true }), -3);
  assert.equal(parseQty("+3", { signed: true }), 3);
});

test("stockError turns the database's refusals into messages (and keeps the available quantity)", () => {
  assert.equal(stockError({ message: "stock:location_inactive" }).error, STOCK_MESSAGES.location_inactive);
  const e = stockError({ message: "stock:insufficient_stock", details: "available=3.500" });
  assert.equal(e.code, "insufficient_stock");
  assert.deepEqual(e.params, { available: "3.5" });
  assert.equal(stockError({ code: "23505", message: 'duplicate key value violates unique constraint "health_stock_locations_code_key"' }).code, "code_taken");
  assert.equal(stockError({ code: "PGRST202", message: "function does not exist" }).code, "unavailable");
  assert.equal(stockError({ code: "42P01", message: "relation does not exist" }).code, "unavailable");
  assert.equal(stockError({ message: "stock:made_up" }).code, "failed", "an unknown code is a generic failure, never a crash");
  assert.equal(stockError(null).code, "failed");
});

test("cleanMovement: every kind needs its own fields; adjust is signed and needs a reason", () => {
  const ok = (o) => cleanMovement({ key: KEY, productId: 1, locationId: 2, qty: 3, ...o });
  assert.equal(ok({ kind: "receive" }).ok, true);
  assert.equal(ok({ kind: "issue", reference: "SO-1" }).value.reference, "SO-1");
  assert.equal(ok({ kind: "transfer", toLocationId: 3 }).value.toLocationId, 3);
  assert.equal(ok({ kind: "transfer", toLocationId: 2 }).ok, false, "to the same place");
  assert.equal(ok({ kind: "transfer" }).ok, false, "no destination");
  assert.equal(ok({ kind: "adjust", qty: -2, reason: "recount" }).value.qty, -2);
  assert.equal(ok({ kind: "adjust", qty: -2 }).ok, false, "no reason");
  assert.equal(ok({ kind: "receive", qty: -2 }).ok, false, "negative receive");
  assert.equal(ok({ kind: "receive", key: "x" }).ok, false, "short key");
  assert.equal(ok({ kind: "receive", productId: 0 }).ok, false);
  assert.equal(ok({ kind: "receive", locationId: "abc" }).ok, false);
  assert.equal(ok({ kind: "teleport" }).ok, false);
  assert.equal(ok({ kind: "receive", reservationId: 4 }).ok, false, "a reservation is consumed by an issue only");
  assert.equal(ok({ kind: "issue", reservationId: 4 }).value.reservationId, 4);
  assert.equal(ok({ kind: "receive", reason: "x".repeat(301) }).ok, false);
  assert.equal(idempotencyKey("abcdefgh"), "abcdefgh");
  assert.equal(idempotencyKey("with space  "), null);
});

test("cleanLocation: a fixed upper-case code on creation, bounded name and note", () => {
  assert.deepEqual(cleanLocation({ code: " main-1 ", name: " Main ", note: "" }, { creating: true }).value, { code: "MAIN-1", name: "Main", note: null });
  for (const bad of [{ code: "A", name: "x" }, { code: "bad code", name: "x" }, { code: "MAIN", name: "" }, { code: "MAIN", name: "x".repeat(81) }, { code: "MAIN", name: "x", note: "n".repeat(301) }, { code: "MAIN", name: "x", sort_order: 1.5 }]) {
    assert.equal(cleanLocation(bad, { creating: true }).ok, false, JSON.stringify(bad));
  }
  assert.equal("code" in cleanLocation({ code: "ZZZ", name: "x" }).value, false, "an edit never carries the code");
  assert.equal(names("beauty").post, "beauty_stock_post");
  assert.throws(() => names("mars"));
});

// ── the actions, with the real access rules ──────────────────────────────────────────────────────────────────────────────
let db, audits, posted;
const rpc = {
  health_stock_post: (a) => { posted.push(a); return { data: { ok: true, replayed: false, movement_ids: [11], balance_after: 5 }, error: null }; },
  health_stock_reverse: () => ({ data: { ok: true, replayed: false, movement_ids: [12, 13] }, error: null }),
  health_stock_reserve: () => ({ data: { ok: true, replayed: false, reservation_id: 9 }, error: null }),
  health_stock_release: () => ({ data: { ok: true, replayed: true, reservation_id: 9 }, error: null }),
};
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
const manager = urow(1, { role: "warehouse_manager" });             // adjust needs approval by default
const boss = urow(2, { role: "house_admin" });                        // reviews inventory
const viewer = urow(3, { role: "viewer" });
beforeEach(() => {
  invalidateSessionUser();
  audits = []; posted = [];
  db = createMemoryAdmin({
    operator_users: [manager, boss, viewer],
    operator_change_requests: [],
    products: [{ id: 7, sku: "G-7" }],
    health_stock_balances: [{ location_id: 1, product_id: 7, quantity: 5, reserved: 0 }],
    health_stock_locations: [],
  }, { rpc, defaults: { operator_change_requests: () => ({ id: `00000000-0000-4000-9000-${String(Math.floor(Math.random() * 1e12)).padStart(12, "0")}`, status: "pending", requested_at: "2026-10-01T10:00:00.000Z" }) } });
});
const mv = (o = {}) => ({ key: KEY, kind: "receive", productId: 7, locationId: 1, qty: 5, ...o });

test("a viewer cannot move stock, and the database function is never called", async () => {
  for (const kind of ["receive", "issue"]) {
    const r = await actions.postMovement(ctxFor(viewer), mv({ kind }));
    assert.equal(r.ok, false); assert.equal(r.denied, true);
  }
  assert.equal((await actions.reverseMovement(ctxFor(viewer), { key: KEY, movementId: 1, reason: "mistake" })).denied, true);
  assert.equal((await actions.reserveStock(ctxFor(viewer), { key: KEY, productId: 7, locationId: 1, qty: 1 })).denied, true);
  assert.equal((await actions.createLocation(ctxFor(viewer), { code: "NEW", name: "x" })).denied, true);
  assert.equal(db.rpcLog.length, 0);
  assert.ok(audits.every((a) => a.action === "access.denied" && a.result === "rejected"));
});

test("a warehouse manager receives and issues directly; the call carries the person, the key and the request id", async () => {
  const r = await actions.postMovement(ctxFor(manager), mv({ reference: " PO-9 " }));
  assert.deepEqual([r.ok, r.balanceAfter, r.movementIds], [true, 5, [11]]);
  assert.equal(posted.length, 1);
  assert.deepEqual([posted[0].p_key, posted[0].p_kind, posted[0].p_product, posted[0].p_location, posted[0].p_qty, posted[0].p_reference], [KEY, "receive", 7, 1, 5, "PO-9"]);
  assert.equal(posted[0].p_actor, manager.id);
  assert.equal(posted[0].p_actor_label, "user1");
  assert.match(posted[0].p_request, /^wh-/);
  assert.deepEqual(audits.map((a) => [a.action, a.result]), [["stock.receive", "success"]]);
});

test("a database refusal comes back as a message and is logged as a failure", async () => {
  rpc.health_stock_post = () => ({ data: null, error: { message: "stock:insufficient_stock", details: "available=2.000" } });
  const r = await actions.postMovement(ctxFor(manager), mv({ kind: "issue", qty: 9 }));
  rpc.health_stock_post = (a) => { posted.push(a); return { data: { ok: true, replayed: false, movement_ids: [11], balance_after: 5 }, error: null }; };
  assert.equal(r.ok, false);
  assert.equal(r.error, STOCK_MESSAGES.insufficient_stock);
  assert.deepEqual(r.params, { available: "2" });
  assert.deepEqual([audits[0].action, audits[0].result, audits[0].detail.reason], ["stock.issue", "failure", "insufficient_stock"]);
});

test("a replayed request is reported as such and not logged twice", async () => {
  rpc.health_stock_post = () => ({ data: { ok: true, replayed: true, movement_ids: [11] }, error: null });
  const r = await actions.postMovement(ctxFor(manager), mv());
  rpc.health_stock_post = (a) => { posted.push(a); return { data: { ok: true, replayed: false, movement_ids: [11], balance_after: 5 }, error: null }; };
  assert.equal(r.replayed, true);
  assert.equal(audits.length, 0);
});

test("a stock adjustment by a manager whose policy says 'approve' is FILED, not posted; the reviewer's approval posts it once with the stored key", async () => {
  const filed = await actions.postMovement(ctxFor(manager), mv({ kind: "adjust", qty: -2, reason: "damaged in transit" }));
  assert.deepEqual([filed.ok, filed.pending], [true, true]);
  assert.equal(posted.length, 0, "nothing moved");
  const req = db.tables.operator_change_requests[0];
  assert.deepEqual([req.operation, req.entity, req.entity_id, req.status], ["inventory.adjust", "stock", 7, "pending"]);
  assert.deepEqual(req.before, { quantity: 5 });
  assert.equal(req.proposed.quantity, 3, "the reviewer reads 5 → 3");
  assert.equal(req.proposed._key, KEY);
  const reviewer = rowToUser(db.tables.operator_users.find((r) => r.id === boss.id));
  const executors = actions.makeWarehouseExecutors({ panel: "health" });
  const done = await approveRequest(db, { reviewer, panel: "health", id: req.id, executors });
  assert.equal(done.ok, true, JSON.stringify(done));
  assert.equal(posted.length, 1);
  assert.deepEqual([posted[0].p_kind, posted[0].p_qty, posted[0].p_key, posted[0].p_actor, posted[0].p_request], ["adjust", -2, KEY, manager.id, req.id]);
  const again = await approveRequest(db, { reviewer, panel: "health", id: req.id, executors });
  assert.equal(again.ok, false, "a decided request is not run twice");
  assert.equal(posted.length, 1);
});

test("an approved adjustment that no longer fits (the stock is gone) fails safely as stale", async () => {
  await actions.postMovement(ctxFor(manager), mv({ kind: "adjust", qty: -4, reason: "recount" }));
  const req = db.tables.operator_change_requests[0];
  rpc.health_stock_post = () => ({ data: null, error: { message: "stock:insufficient_stock", details: "available=1" } });
  const reviewer = rowToUser(db.tables.operator_users.find((r) => r.id === boss.id));
  const done = await approveRequest(db, { reviewer, panel: "health", id: req.id, executors: actions.makeWarehouseExecutors({ panel: "health" }) });
  rpc.health_stock_post = (a) => { posted.push(a); return { data: { ok: true, replayed: false, movement_ids: [11], balance_after: 5 }, error: null }; };
  assert.equal(done.ok, false);
  assert.equal(done.error, "stale");
  assert.equal(db.tables.operator_change_requests[0].status, "failed");
});

test("a house admin adjusts directly (no approval policy of their own)", async () => {
  const r = await actions.postMovement(ctxFor(boss), mv({ kind: "adjust", qty: 1, reason: "found a box" }));
  assert.deepEqual([r.ok, r.pending], [true, undefined]);
  assert.equal(posted.length, 1);
});

test("reverse, reserve, release: input is cleaned first, then the permission, then the function", async () => {
  const ctx = ctxFor(boss);
  assert.equal((await actions.reverseMovement(ctx, { key: KEY, movementId: 1, reason: "x" })).error, STOCK_MESSAGES.reason_required);
  assert.equal((await actions.reverseMovement(ctx, { key: "k", movementId: 1, reason: "mistake" })).error, STOCK_MESSAGES.bad_key);
  assert.equal((await actions.reverseMovement(ctx, { key: KEY, movementId: 0, reason: "mistake" })).error, STOCK_MESSAGES.unknown_movement);
  assert.equal(db.rpcLog.length, 0);
  assert.deepEqual((await actions.reverseMovement(ctx, { key: KEY, movementId: 1, reason: "mistake" })).movementIds, [12, 13]);
  assert.equal((await actions.reserveStock(ctx, { key: KEY, productId: 7, locationId: 1, qty: "2" })).reservationId, 9);
  assert.equal((await actions.reserveStock(ctx, { key: KEY, productId: 7, locationId: 1, qty: "0" })).error, STOCK_MESSAGES.bad_quantity);
  assert.equal((await actions.releaseReservation(ctx, { key: KEY, reservationId: 9 })).replayed, true);
  assert.deepEqual(db.rpcLog.map((c) => c[0]), ["health_stock_reverse", "health_stock_reserve", "health_stock_release"]);
});

test("locations: created with the person's id, edited only at the version the screen showed", async () => {
  const ctx = ctxFor(boss);
  const made = await actions.createLocation(ctx, { code: "main", name: "Main", note: "" });
  assert.equal(made.ok, true);
  const row = db.tables.health_stock_locations[0];
  assert.deepEqual([row.code, row.name, row.created_by], ["MAIN", "Main", boss.id]);
  row.version = 1; row.id = 5;
  assert.equal((await actions.updateLocation(ctx, 5, { name: "Main hall" }, 1)).ok, true);
  assert.equal(db.tables.health_stock_locations[0].name, "Main hall");
  const stale = await actions.updateLocation(ctx, 5, { name: "Other" }, 99);
  assert.deepEqual([stale.ok, stale.stale], [false, true]);
  assert.equal(db.tables.health_stock_locations[0].name, "Main hall");
  assert.equal((await actions.createLocation(ctx, { code: "!", name: "x" })).ok, false);
});

test("a product typed as a SKU is resolved only after the permission check; unknown SKUs are refused", async () => {
  db.tables.products.push({ id: 8, sku: "Glove-8" });
  const r = await actions.postMovement(ctxFor(manager), { key: KEY, kind: "receive", sku: "glove-8", locationId: 1, qty: 2 });
  assert.equal(r.ok, true);
  assert.equal(posted.at(-1).p_product, 8, "case-insensitive exact match");
  const none = await actions.postMovement(ctxFor(manager), { key: KEY, kind: "receive", sku: "nope", locationId: 1, qty: 2 });
  assert.equal(none.error, STOCK_MESSAGES.unknown_product);
  const n = db.rpcLog.length;
  const denied = await actions.postMovement(ctxFor(viewer), { key: KEY, kind: "receive", sku: "G-7", locationId: 1, qty: 2 });
  assert.equal(denied.denied, true);
  assert.equal(db.rpcLog.length, n);
  assert.equal(cleanMovement({ key: KEY, kind: "receive", locationId: 1, qty: 2 }).ok, false, "neither id nor SKU");
});
