// lib/warehouse/pageData.js — SERVER ONLY (the page that calls it has checked `inventory.view`). Everything the warehouse screen shows
// for one tab, shaped for the client: plain JSON, no secrets, no other house. Reads go through the store; a missing migration or an
// unreachable database becomes { ok: false, error } (the screen says so; it never shows a half-empty warehouse as if it were empty).
import * as store from "./store.js";

export const TABS = ["stock", "movements", "reservations", "locations"];
export const PAGE_SIZE = 50;

const productName = (p) => (p ? p.name_fa || p.name_en || p.name_ru || p.name_tg || "" : "");

// searchParams: { tab, location, q, page }
export async function loadWarehouse(admin, house, params = {}) {
  const tab = TABS.includes(params.tab) ? params.tab : "stock";
  const q = String(params.q ?? "").trim().slice(0, 80);
  const page = Math.max(1, Math.min(Number(params.page) || 1, 1000));
  const locationId = Number(params.location) > 0 ? Number(params.location) : null;

  const locs = await store.listLocations(admin, house);
  if (!locs.ok) return { ok: false, error: locs.error };
  const base = { ok: true, tab, q, page, locationId, locations: locs.locations };

  if (tab === "stock") {
    const res = await store.overview(admin, house, { locationId, limit: 500 });
    if (!res.ok) return { ok: false, error: res.error };
    const needle = q.toLowerCase();
    const byProduct = new Map();
    for (const r of res.rows) {
      const p = r.product;
      if (needle && !(p && [p.sku, p.name_fa, p.name_en, p.name_ru, p.name_tg].filter(Boolean).some((v) => String(v).toLowerCase().includes(needle)))) continue;
      const e = byProduct.get(r.product_id) || { productId: r.product_id, sku: p?.sku || "", name: productName(p), total: 0, reserved: 0, places: [] };
      e.total += Number(r.quantity); e.reserved += Number(r.reserved);
      e.places.push({ locationId: r.location_id, quantity: Number(r.quantity), reserved: Number(r.reserved) });
      byProduct.set(r.product_id, e);
    }
    const items = [...byProduct.values()].map((e) => ({ ...e, total: round(e.total), reserved: round(e.reserved) })).sort((a, b) => a.sku.localeCompare(b.sku));
    return { ...base, items, truncated: res.rows.length >= 500 };
  }

  if (tab === "movements") {
    let productId = null;
    if (q) {
      const f = await store.findProductBySku(admin, house, q);
      if (!f.ok) return { ...base, movements: [], hasMore: false, noSuchProduct: true };
      productId = f.product.id;
    }
    const res = await store.listMovements(admin, house, { productId, locationId, limit: PAGE_SIZE + 1, offset: (page - 1) * PAGE_SIZE });
    if (!res.ok) return { ok: false, error: res.error };
    const rows = res.movements.slice(0, PAGE_SIZE).map((m) => ({
      id: m.id, kind: m.kind, sku: m.sku || "", productId: m.product_id, locationId: m.location_id, delta: Number(m.delta), balanceAfter: Number(m.balance_after),
      reason: m.reason || "", reference: m.reference || "", reversesId: m.reverses_id, group: m.group_id, leg: m.leg, who: m.actor_label || "", at: m.created_at,
    }));
    // a movement can be reversed while no row of its group is a reversal and none is reversed yet
    const reversed = new Set(rows.filter((m) => m.reversesId).map((m) => m.reversesId));
    for (const m of rows) m.canReverse = m.kind !== "reversal" && !reversed.has(m.id) && !rows.some((o) => o.group === m.group && reversed.has(o.id));
    return { ...base, movements: rows, hasMore: res.movements.length > PAGE_SIZE };
  }

  if (tab === "reservations") {
    const res = await store.listReservations(admin, house, { status: "active", limit: 200 });
    if (!res.ok) return { ok: false, error: res.error };
    return { ...base, reservations: res.reservations.map((r) => ({ id: r.id, productId: r.product_id, sku: r.sku || "", locationId: r.location_id, qty: Number(r.qty), reference: r.reference || "", note: r.note || "", who: r.created_label || "", at: r.created_at })) };
  }
  return base;       // locations: the list is already there
}

const round = (n) => Math.round(n * 1000) / 1000;
