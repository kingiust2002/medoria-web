// lib/warehouse/store.js — the warehouse's reads and writes against the service-role client. SERVER ONLY (the caller passes the admin
// client; nothing here is importable from a public page — tests/warehouse-no-leak.test.mjs). Movements, reversals and reservations go
// through the database functions of migration 36 (one transaction, idempotent, never negative); locations are plain rows.
import { names, stockError, STOCK_UNAVAILABLE } from "./core.js";

const fail = (err) => ({ ok: false, ...stockError(err) });
const unavailable = { ok: false, code: "unavailable", error: STOCK_UNAVAILABLE };

export async function listLocations(admin, house, { activeOnly = false } = {}) {
  const t = names(house);
  let q = admin.from(t.locations).select("id,code,name,note,is_active,sort_order,created_at,updated_at,version");
  if (activeOnly) q = q.eq("is_active", true);
  const { data, error } = await q.order("sort_order", { ascending: true }).order("id", { ascending: true });
  if (error) return fail(error);
  return { ok: true, locations: data || [] };
}

export async function createLocation(admin, house, value, actorId) {
  const t = names(house);
  const { data, error } = await admin.from(t.locations).insert({ ...value, created_by: actorId || null }).select("id,code,name,note,is_active,sort_order,version").single();
  if (error) return fail(error);
  return { ok: true, location: data };
}

// optimistic: only the version the screen showed may be changed
export async function updateLocation(admin, house, id, expectedVersion, patch) {
  const t = names(house);
  const { data, error } = await admin.from(t.locations).update(patch).eq("id", id).eq("version", expectedVersion).select("id,code,name,note,is_active,sort_order,version");
  if (error) return fail(error);
  if (!data?.length) return { ok: false, code: "stale", error: "stale" };
  return { ok: true, location: data[0] };
}

export async function getLocation(admin, house, id) {
  const t = names(house);
  const { data, error } = await admin.from(t.locations).select("id,code,name,is_active,version").eq("id", id).maybeSingle();
  if (error) return fail(error);
  return data ? { ok: true, location: data } : { ok: false, code: "unknown_location", error: stockError({ message: "stock:unknown_location" }).error };
}

// the stock of one product in every warehouse
export async function stockOfProduct(admin, house, productId) {
  const t = names(house);
  const { data, error } = await admin.from(t.balances).select("location_id,product_id,quantity,reserved,updated_at").eq("product_id", productId);
  if (error) return fail(error);
  return { ok: true, balances: data || [] };
}

// overview rows (optionally one warehouse), with product names merged in; `q` filters by SKU / name on the products side
export async function overview(admin, house, { locationId = null, limit = 200 } = {}) {
  const t = names(house);
  let query = admin.from(t.balances).select("location_id,product_id,quantity,reserved,updated_at");
  if (locationId) query = query.eq("location_id", locationId);
  const { data, error } = await query.order("updated_at", { ascending: false }).limit(Math.min(Math.max(Number(limit) || 200, 1), 1000));
  if (error) return fail(error);
  const ids = [...new Set((data || []).map((r) => r.product_id))];
  let products = {};
  if (ids.length) {
    const p = await admin.from(t.products).select("id,sku,name_fa,name_en,name_ru,name_tg").in("id", ids);
    if (p.error) return fail(p.error);
    products = Object.fromEntries((p.data || []).map((x) => [x.id, x]));
  }
  return { ok: true, rows: (data || []).map((r) => ({ ...r, product: products[r.product_id] || null })) };
}

export async function listMovements(admin, house, { productId = null, locationId = null, limit = 50, offset = 0 } = {}) {
  const t = names(house);
  let q = admin.from(t.movements).select("id,idempotency_key,leg,group_id,kind,product_id,sku,location_id,delta,balance_after,reason,reference,reverses_id,reservation_id,actor_user_id,actor_label,created_at");
  if (productId) q = q.eq("product_id", productId);
  if (locationId) q = q.eq("location_id", locationId);
  const n = Math.min(Math.max(Number(limit) || 50, 1), 200), from = Math.max(Number(offset) || 0, 0);
  const { data, error } = await q.order("id", { ascending: false }).range(from, from + n - 1);
  if (error) return fail(error);
  return { ok: true, movements: data || [] };
}

export async function listReservations(admin, house, { status = "active", limit = 100 } = {}) {
  const t = names(house);
  let q = admin.from(t.reservations).select("id,product_id,sku,location_id,qty,status,reference,note,created_at,created_label,closed_at,closed_label");
  if (status) q = q.eq("status", status);
  const { data, error } = await q.order("id", { ascending: false }).limit(Math.min(Math.max(Number(limit) || 100, 1), 500));
  if (error) return fail(error);
  return { ok: true, reservations: data || [] };
}

// ── movements (database functions) ──────────────────────────────────────────────────────────────────────────────────────
function rpcResult(res) {
  if (res.error) return fail(res.error);
  const d = res.data;
  if (!d || d.ok !== true) return unavailable;
  return { ok: true, replayed: Boolean(d.replayed), result: d };
}

export async function post(admin, house, m, who) {
  const t = names(house);
  return rpcResult(await admin.rpc(t.post, {
    p_key: m.key, p_kind: m.kind, p_product: m.productId, p_location: m.locationId, p_to_location: m.toLocationId ?? null, p_qty: m.qty,
    p_reason: m.reason ?? null, p_reference: m.reference ?? null, p_reservation: m.reservationId ?? null,
    p_actor: who.userId ?? null, p_actor_label: who.label ?? null, p_request: who.requestId ?? null,
  }));
}

export async function reverse(admin, house, { key, movementId, reason }, who) {
  const t = names(house);
  return rpcResult(await admin.rpc(t.reverse, { p_key: key, p_movement: movementId, p_reason: reason, p_actor: who.userId ?? null, p_actor_label: who.label ?? null, p_request: who.requestId ?? null }));
}

export async function reserve(admin, house, { key, productId, locationId, qty, reference, note }, who) {
  const t = names(house);
  return rpcResult(await admin.rpc(t.reserve, {
    p_key: key, p_product: productId, p_location: locationId, p_qty: qty, p_reference: reference ?? null, p_note: note ?? null,
    p_actor: who.userId ?? null, p_actor_label: who.label ?? null, p_request: who.requestId ?? null,
  }));
}

export async function release(admin, house, { key, reservationId }, who) {
  const t = names(house);
  return rpcResult(await admin.rpc(t.release, { p_key: key, p_reservation: reservationId, p_actor: who.userId ?? null, p_actor_label: who.label ?? null, p_request: who.requestId ?? null }));
}
