// lib/warehouse/store.js — the warehouse's reads and writes against the service-role client. SERVER ONLY (the caller passes the admin
// client; nothing here is importable from a public page — tests/warehouse-no-leak.test.mjs). Movements, reversals and reservations go
// through the database functions of migration 36 (one transaction, idempotent, never negative); locations are plain rows.
import { names, stockError, STOCK_UNAVAILABLE } from "./core.js";
import { readAll } from "../operator/listQuery.js";

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

// a product by its SKU (exact, any case) — the screens let a person type the SKU instead of picking from thousands of products
export async function findProductBySku(admin, house, sku) {
  const t = names(house);
  const safe = String(sku).replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data, error } = await admin.from(t.products).select("id,sku,name_fa,name_en").ilike("sku", safe).limit(2);
  if (error) return fail(error);
  if (!data?.length) return { ok: false, code: "unknown_product", error: stockError({ message: "stock:unknown_product" }).error };
  return { ok: true, product: data[0] };
}

// the stock of one product in every warehouse
export async function stockOfProduct(admin, house, productId) {
  const t = names(house);
  const { data, error } = await admin.from(t.balances).select("location_id,product_id,quantity,reserved,updated_at").eq("product_id", productId);
  if (error) return fail(error);
  return { ok: true, balances: data || [] };
}

// EVERY balance row (optionally of one warehouse), read in chunks — the stock screen groups, filters and pages these on the server, so a
// capped read would make products vanish from it. `fail` on an unreadable chunk or on an absurd row count; never a silently partial list.
export async function allBalances(admin, house, { locationId = null } = {}) {
  const t = names(house);
  const res = await readAll((from, to) => {
    let q = admin.from(t.balances).select("location_id,product_id,quantity,reserved,updated_at");
    if (locationId) q = q.eq("location_id", locationId);
    return q.order("product_id", { ascending: true }).order("location_id", { ascending: true }).range(from, to);
  });
  return res.ok ? { ok: true, rows: res.rows } : fail(res.error);
}

// products by id (names, SKU) for the rows a page shows
export async function productsByIds(admin, house, ids) {
  const t = names(house);
  const map = {};
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await admin.from(t.products).select("id,sku,name_fa,name_en,name_ru,name_tg").in("id", ids.slice(i, i + 200));
    if (error) return fail(error);
    for (const x of data || []) map[x.id] = x;
  }
  return { ok: true, map };
}

// ids of the products whose SKU or name contains `term` (the stock screen's search runs over the whole catalogue, then over the balances)
export async function searchProductIds(admin, house, term) {
  const t = names(house);
  const safe = String(term).slice(0, 80).replace(/[,()"'\\*]/g, " ").replace(/[%_]/g, "\\$&").trim();
  if (!safe) return { ok: true, ids: null };
  const res = await readAll((from, to) => admin.from(t.products).select("id").or(["sku", "name_fa", "name_en", "name_ru", "name_tg"].map((c) => `${c}.ilike.%${safe}%`).join(",")).order("id", { ascending: true }).range(from, to));
  return res.ok ? { ok: true, ids: new Set(res.rows.map((r) => r.id)) } : fail(res.error);
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

export async function listReservations(admin, house, { status = "active", limit = 100, offset = 0 } = {}) {
  const t = names(house);
  let q = admin.from(t.reservations).select("id,product_id,sku,location_id,qty,status,reference,note,created_at,created_label,closed_at,closed_label");
  if (status) q = q.eq("status", status);
  const n = Math.min(Math.max(Number(limit) || 100, 1), 500), from = Math.max(Number(offset) || 0, 0);
  const { data, error } = await q.order("id", { ascending: false }).range(from, from + n);      // one extra row tells whether another page exists
  if (error) return fail(error);
  return { ok: true, reservations: (data || []).slice(0, n), hasMore: (data || []).length > n };
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
