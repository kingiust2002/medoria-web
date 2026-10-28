// lib/warehouse/actionsCore.js — the work behind the warehouse server actions of BOTH panels. Plain module: the action files own the
// session check and pass ctx = { admin, session, panel, audit, require, evaluate, file }:
//   ctx.require(ops)  → null | refusal          (needs-approval counts as a refusal)
//   ctx.evaluate(ops) → { mode, refusal? }       (for the one operation that can be filed for approval: a stock adjustment)
//   ctx.file(spec)    → the object to return     (files the change request)
// Every movement is one database function call (idempotent, never negative); the activity log gets a line AFTER it (best effort: the
// ledger itself, append-only with the person's id, is the record that matters).
import { cleanLocation, cleanMovement, idempotencyKey, names, OPERATION_OF_KIND, parseQty, STOCK_MESSAGES } from "./core.js";
import { cleanLotUpdate } from "./lotsCore.js";
import * as store from "./store.js";
import { tr } from "../panel/i18n.js";

const STALE = tr("این انبار در این فاصله تغییر کرده است؛ صفحه را تازه کنید.");

const whoOf = (ctx, requestId) => {
  const u = ctx.session?.user;
  return { userId: u?.id ?? null, label: String(u?.username || ctx.session?.username || "operator").slice(0, 80), requestId: requestId || null };
};
const requestId = () => `wh-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

async function log(ctx, action, result, ids, detail) {
  try { await ctx.audit(action, { entity: "stock", ids, result, detail }); } catch { /* the ledger has the record */ }
}
const out = (res) => (res.ok ? res : { ok: false, error: res.error, ...(res.params ? { params: res.params } : {}), code: res.code });

// the product exists in THIS house? (the database function checks again; this gives a precise message before any write)
async function productExists(ctx, id) {
  const { data, error } = await ctx.admin.from(names(ctx.panel).products).select("id").eq("id", id).limit(1);
  return error ? null : Boolean(data?.length);
}

// input as in cleanMovement. kind: receive | issue | transfer | adjust
export async function postMovement(ctx, input) {
  const m = cleanMovement(input);
  if (!m.ok) return { ok: false, error: m.error };
  const v = m.value;
  const op = OPERATION_OF_KIND[v.kind];
  if (v.kind === "adjust") {
    const ev = await ctx.evaluate(op);
    if (ev.mode === "denied") return ev.refusal;
    if (ev.mode === "approval") {
      const r = await resolveProduct(ctx, v);
      return r.ok ? fileAdjustment(ctx, r.value) : r;
    }
  } else {
    const refusal = await ctx.require(op);
    if (refusal) return refusal;
  }
  const resolved = await resolveProduct(ctx, v);
  if (!resolved.ok) return resolved;
  return execute(ctx, resolved.value);
}

// the product typed as a SKU → its id (only after the permission check, so nobody probes SKUs without the right)
async function resolveProduct(ctx, v) {
  if (v.productId) return { ok: true, value: v };
  const found = await store.findProductBySku(ctx.admin, ctx.panel, v.sku);
  return found.ok ? { ok: true, value: { ...v, productId: found.product.id } } : { ok: false, error: found.error };
}

async function execute(ctx, v, rid = requestId(), who = whoOf(ctx, rid)) {
  const res = await store.post(ctx.admin, ctx.panel, v, who);
  if (!res.ok) {
    await log(ctx, `stock.${v.kind}`, "failure", [v.productId], { reason: res.code, qty: v.qty });
    return out(res);
  }
  if (!res.replayed) await log(ctx, `stock.${v.kind}`, "success", [v.productId], { qty: v.qty, location: v.locationId, ...(v.toLocationId ? { to: v.toLocationId } : {}), ...(res.result.lot_id ? { lot: res.result.lot_id } : {}) });
  return { ok: true, replayed: res.replayed, balanceAfter: res.result.balance_after ?? null, movementIds: res.result.movement_ids || [], lotId: res.result.lot_id ?? null };
}

// A stock adjustment that must be approved: nothing moves now; the request carries the exact arguments (and the idempotency key, so an
// approval that is executed twice still posts once).
async function fileAdjustment(ctx, v) {
  if (!(await productExists(ctx, v.productId))) return { ok: false, error: STOCK_MESSAGES.unknown_product };
  const balances = await store.stockOfProduct(ctx.admin, ctx.panel, v.productId);
  const current = balances.ok ? Number((balances.balances.find((b) => b.location_id === v.locationId)?.quantity) ?? 0) : null;
  return ctx.file({
    operation: "inventory.adjust", entity: "stock", entityId: v.productId, subject: `#${v.productId}`,
    before: current == null ? null : { quantity: current },
    proposed: { quantity: current == null ? null : Math.round((current + v.qty) * 1000) / 1000, reason: v.reason, _key: v.key, _product_id: v.productId, _location_id: v.locationId, _qty: v.qty, ...(v.lotId ? { _lot_id: v.lotId } : {}) },
    reason: v.reason,
  });
}

// how an approved stock adjustment is applied (see approvals.js executors): posts with the stored key, so it is safe to run twice
export function makeWarehouseExecutors({ panel }) {
  return {
    "inventory.adjust": async ({ admin, request }) => {
      const p = request.proposed || {};
      const v = { key: p._key, kind: "adjust", productId: p._product_id, locationId: p._location_id, toLocationId: null, qty: p._qty, reason: p.reason, reference: null, reservationId: null, lotId: p._lot_id ?? null };
      const res = await store.post(admin, panel, v, { userId: request.requested_by, label: "approved-request", requestId: request.id });
      return res.ok ? { ok: true } : { ok: false, error: ["insufficient_stock", "insufficient_lot_stock", "lot_not_usable", "unknown_lot", "lot_stock_protected"].includes(res.code) ? "stale" : res.code || "failed" };
    },
  };
}

export async function reverseMovement(ctx, input = {}) {
  const key = idempotencyKey(input.key);
  if (!key) return { ok: false, error: STOCK_MESSAGES.bad_key };
  const id = Number(input.movementId);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: STOCK_MESSAGES.unknown_movement };
  const reason = String(input.reason ?? "").trim();
  if (reason.length < 3 || reason.length > 300) return { ok: false, error: STOCK_MESSAGES.reason_required };
  const refusal = await ctx.require("inventory.adjust");
  if (refusal) return refusal;
  const res = await store.reverse(ctx.admin, ctx.panel, { key, movementId: id, reason }, whoOf(ctx, requestId()));
  if (!res.ok) { await log(ctx, "stock.reverse", "failure", undefined, { reason: res.code, movement: id }); return out(res); }
  if (!res.replayed) await log(ctx, "stock.reverse", "success", undefined, { movement: id });
  return { ok: true, replayed: res.replayed, movementIds: res.result.movement_ids || [] };
}

export async function reserveStock(ctx, input = {}) {
  const key = idempotencyKey(input.key);
  if (!key) return { ok: false, error: STOCK_MESSAGES.bad_key };
  const hasId = input.productId != null && input.productId !== "";
  const sku = typeof input.sku === "string" ? input.sku.trim() : "";
  let productId = hasId ? Number(input.productId) : null;
  const locationId = Number(input.locationId), qty = parseQty(input.qty);
  if (hasId ? !Number.isInteger(productId) || productId <= 0 : !sku || sku.length > 80) return { ok: false, error: STOCK_MESSAGES.bad_product };
  if (!Number.isInteger(locationId) || locationId <= 0) return { ok: false, error: STOCK_MESSAGES.unknown_location };
  if (qty == null) return { ok: false, error: STOCK_MESSAGES.bad_quantity };
  const reference = String(input.reference ?? "").trim(), note = String(input.note ?? "").trim();
  if (reference.length > 80 || note.length > 300) return { ok: false, error: tr("شمارهٔ سند یا توضیح زیادی طولانی است.") };
  const refusal = await ctx.require("inventory.reserve");
  if (refusal) return refusal;
  if (!productId) {
    const r = await resolveProduct(ctx, { productId: null, sku });
    if (!r.ok) return r;
    productId = r.value.productId;
  }
  const res = await store.reserve(ctx.admin, ctx.panel, { key, productId, locationId, qty, reference: reference || null, note: note || null }, whoOf(ctx, requestId()));
  if (!res.ok) { await log(ctx, "stock.reserve", "failure", [productId], { reason: res.code, qty }); return out(res); }
  if (!res.replayed) await log(ctx, "stock.reserve", "success", [productId], { qty, location: locationId });
  return { ok: true, replayed: res.replayed, reservationId: res.result.reservation_id };
}

export async function releaseReservation(ctx, input = {}) {
  const key = idempotencyKey(input.key);
  if (!key) return { ok: false, error: STOCK_MESSAGES.bad_key };
  const id = Number(input.reservationId);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: STOCK_MESSAGES.unknown_reservation };
  const refusal = await ctx.require("inventory.reserve");
  if (refusal) return refusal;
  const res = await store.release(ctx.admin, ctx.panel, { key, reservationId: id }, whoOf(ctx, requestId()));
  if (!res.ok) { await log(ctx, "stock.release", "failure", undefined, { reason: res.code, reservation: id }); return out(res); }
  if (!res.replayed) await log(ctx, "stock.release", "success", undefined, { reservation: id });
  return { ok: true, replayed: res.replayed };
}

// ── warehouses (locations) ────────────────────────────────────────────────────────────────────────────────────────────
export async function createLocation(ctx, input) {
  const refusal = await ctx.require("inventory.locations");
  if (refusal) return refusal;
  const c = cleanLocation(input, { creating: true });
  if (!c.ok) return { ok: false, error: c.error };
  const res = await store.createLocation(ctx.admin, ctx.panel, c.value, ctx.session?.user?.id);
  if (!res.ok) { await log(ctx, "stock.location_create", "failure", undefined, { reason: res.code }); return out(res); }
  await log(ctx, "stock.location_create", "success", [res.location.id], { code: res.location.code });
  return { ok: true, location: res.location };
}

export async function updateLocation(ctx, id, input, expectedVersion) {
  const refusal = await ctx.require("inventory.locations");
  if (refusal) return refusal;
  const n = Number(id), ver = Number(expectedVersion);
  if (!Number.isInteger(n) || n <= 0 || !Number.isInteger(ver)) return { ok: false, error: STOCK_MESSAGES.unknown_location };
  const c = cleanLocation(input);
  if (!c.ok) return { ok: false, error: c.error };
  const res = await store.updateLocation(ctx.admin, ctx.panel, n, ver, c.value);
  if (!res.ok) {
    await log(ctx, "stock.location_update", "failure", [n], { reason: res.code });
    return res.code === "stale" ? { ok: false, error: STALE, stale: true } : out(res);
  }
  await log(ctx, "stock.location_update", "success", [n], { fields: Object.keys(c.value) });
  return { ok: true, location: res.location };
}

// ── lots: quarantine, release, reject, correct the expiry date (migration 45) ─────────────────────────────────────────────
// A quality decision: needs inventory.quarantine (operation inventory.lot_status), always direct. The database re-checks the version the screen
// showed, requires a reason, refuses a change that would leave reserved stock without usable stock, and writes the lot's history.
export async function updateLot(ctx, input = {}) {
  const refusal = await ctx.require("inventory.lot_status");
  if (refusal) return refusal;
  const c = cleanLotUpdate(input);
  if (!c.ok) return { ok: false, error: c.error };
  const v = c.value;
  const res = await store.updateLotStatus(ctx.admin, ctx.panel, v, whoOf(ctx, requestId()));
  if (!res.ok) {
    await log(ctx, "stock.lot_update", "failure", [v.lotId], { reason: res.code });
    return res.code === "stale_version" ? { ok: false, error: STOCK_MESSAGES.stale_version, stale: true } : out(res);
  }
  await log(ctx, "stock.lot_update", "success", [v.lotId], { ...(v.status ? { status: v.status } : {}), ...(v.setExpiry ? { expiry: v.expiry || "none" } : {}) });
  return { ok: true, version: res.version };
}
