// lib/warehouse/pageData.js — SERVER ONLY (the page that calls it has checked `inventory.view`). Everything the warehouse screen shows
// for one tab, shaped for the client: plain JSON, no secrets, no other house. Reads go through the store; a missing migration or an
// unreachable database becomes { ok: false, error } (the screen says so; it never shows a half-empty warehouse as if it were empty).
import * as store from "./store.js";
import { names } from "./core.js";
import { readAll } from "../operator/listQuery.js";
import * as counts from "./countsStore.js";
import { summarize } from "./countsCore.js";
import { describeLots, unusableByProduct, usableOf, isLowUsable, summarizeAlerts, teamToday, EXPIRING_DAYS, DEFAULT_EXPIRING_DAYS } from "./lotsCore.js";
import { tr } from "../panel/i18n.js";

export const TABS = ["stock", "lots", "movements", "reservations", "counts", "locations"];
export const LOT_VIEWS = ["all", "expired", "expiring", "quarantine", "rejected"];
export const PAGE_SIZE = 50;

const productName = (p) => (p ? p.name_fa || p.name_en || p.name_ru || p.name_tg || "" : "");

// searchParams: { tab, location, q, page, low, count }
export async function loadWarehouse(admin, house, params = {}) {
  const tab = TABS.includes(params.tab) ? params.tab : "stock";
  const q = String(params.q ?? "").trim().slice(0, 80);
  const page = Math.max(1, Math.min(Number(params.page) || 1, 100000));
  const locationId = Number(params.location) > 0 ? Number(params.location) : null;

  const locs = await store.listLocations(admin, house);
  if (!locs.ok) return { ok: false, error: locs.error };
  const base = { ok: true, tab, q, page, locationId, locations: locs.locations };

  if (tab === "stock") {
    // EVERY balance row of the house (or of one warehouse) is read, grouped by product, filtered, sorted and cut into pages here on the server:
    // a capped read would make products vanish from the list and from its search.
    const res = await store.allBalances(admin, house, { locationId });
    if (!res.ok) return { ok: false, error: res.error };
    const lv = await counts.listLevels(admin, house);                   // without migration 41 the stock list still works, only without minimums
    const min = lv.ok ? Object.fromEntries(lv.levels.map((l) => [l.product_id, Number(l.min_level)])) : {};
    const hits = q ? await store.searchProductIds(admin, house, q) : { ok: true, ids: null };
    if (!hits.ok) return { ok: false, error: hits.error };
    // lots (migration 45): quarantined, rejected and expired stock is NOT usable. Without the migration there are no lots; a lot table that
    // exists but cannot be read is an error (never show stock as usable when its lots are unknown).
    const lotInfo = await loadLots(admin, house);
    if (lotInfo.error) return { ok: false, error: lotInfo.error };
    const today = teamToday();
    const described = lotInfo.described;
    const unusable = unusableByProduct(described, { locationId });
    const byProduct = new Map();
    for (const r of res.rows) {
      const e = byProduct.get(r.product_id) || { productId: r.product_id, sku: "", name: "", total: 0, reserved: 0, places: [] };
      e.total += Number(r.quantity); e.reserved += Number(r.reserved);
      e.places.push({ locationId: r.location_id, quantity: Number(r.quantity), reserved: Number(r.reserved) });
      byProduct.set(r.product_id, e);
    }
    const lotsOf = new Map();
    for (const l of described.values()) { if (!l.quantity) continue; if (!lotsOf.has(l.productId)) lotsOf.set(l.productId, []); lotsOf.get(l.productId).push(l); }
    const all = [...byProduct.values()]
      .map((e) => {
        const un = unusable.get(e.productId)?.unusable ?? 0, total = round(e.total), reserved = round(e.reserved);
        return { ...e, total, reserved, unusable: un, usable: usableOf(total, reserved, un), minLevel: min[e.productId] ?? null, low: isLowUsable(total, un, min[e.productId] ?? null) };
      });
    const windowDays = EXPIRING_DAYS.includes(Number(params.window)) ? Number(params.window) : DEFAULT_EXPIRING_DAYS;
    const { alerts } = summarizeAlerts({ described, products: all, today, window: windowDays, locationId });
    const lowOnly = params.low === "1" || params.low === 1;
    let items = all
      .filter((e) => !hits.ids || hits.ids.has(e.productId))
      .filter((e) => !lowOnly || e.low)
      .map((e) => ({ ...e, lots: (lotsOf.get(e.productId) || []).sort(byExpiry).slice(0, 40).map(lotForClient) }));
    // SKUs of every product that has stock, to order the list by SKU (one narrow column, read in chunks)
    const skus = await readAll((from, to) => admin.from(names(house).products).select("id,sku").order("id", { ascending: true }).range(from, to));
    if (!skus.ok) return { ok: false, error: STOCK_READ_ERROR };
    const skuOf = new Map(skus.rows.map((x) => [x.id, x.sku || ""]));
    for (const it of items) it.sku = skuOf.get(it.productId) || "";
    items.sort((a, b) => a.sku.localeCompare(b.sku) || a.productId - b.productId);
    const total = items.length, pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE)), at = Math.min(page, pageCount);
    items = items.slice((at - 1) * PAGE_SIZE, at * PAGE_SIZE);
    const named = await store.productsByIds(admin, house, items.map((i) => i.productId));
    if (!named.ok) return { ok: false, error: named.error };
    for (const it of items) { const p = named.map[it.productId]; it.sku = p?.sku || it.sku; it.name = productName(p); }
    return { ...base, page: at, items, total, pageCount, lowOnly, levelsUnavailable: !lv.ok, lotsAvailable: lotInfo.available, alerts, alertWindow: windowDays, today };
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
    const lotLinks = await store.lotsOfMovements(admin, house, rows.map((m) => m.id));             // empty before migration 45
    if (lotLinks.ok) for (const m of rows) { const l = lotLinks.map.get(m.id); if (l) { m.lotId = l.lotId; m.lotCode = l.code; } }
    // a movement can be reversed while no row of its group is a reversal and none is reversed yet
    const reversed = new Set(rows.filter((m) => m.reversesId).map((m) => m.reversesId));
    for (const m of rows) m.canReverse = m.kind !== "reversal" && !reversed.has(m.id) && !rows.some((o) => o.group === m.group && reversed.has(o.id));
    return { ...base, movements: rows, hasMore: res.movements.length > PAGE_SIZE };
  }

  if (tab === "reservations") {
    const res = await store.listReservations(admin, house, { status: "active", limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
    if (!res.ok) return { ok: false, error: res.error };
    return { ...base, hasMore: res.hasMore, reservations: res.reservations.map((r) => ({ id: r.id, productId: r.product_id, sku: r.sku || "", locationId: r.location_id, qty: Number(r.qty), reference: r.reference || "", note: r.note || "", who: r.created_label || "", at: r.created_at })) };
  }
  if (tab === "lots") {
    const lotInfo = await loadLots(admin, house);
    if (lotInfo.error) return { ok: false, error: lotInfo.error };
    if (!lotInfo.available) return { ...base, lotsAvailable: false, lots: [], total: 0, pageCount: 1, alerts: null };
    const today = teamToday();
    const windowDays = EXPIRING_DAYS.includes(Number(params.window)) ? Number(params.window) : DEFAULT_EXPIRING_DAYS;
    const view = LOT_VIEWS.includes(params.view) ? params.view : "all";
    const { alerts } = summarizeAlerts({ described: lotInfo.described, products: [], today, window: windowDays, locationId });
    // the lot's history (events and movements) when one is opened
    const lotId = Number(params.lot) > 0 ? Number(params.lot) : null;
    let history = null;
    if (lotId && lotInfo.described.has(lotId)) {
      const h = await store.lotHistory(admin, house, lotId);
      history = h.ok ? { events: h.events.map((e) => ({ id: e.id, kind: e.kind, from: e.from_value, to: e.to_value, reason: e.reason || "", who: e.actor_label || "", at: e.created_at })), movements: h.movements.map((m) => ({ id: m.id, kind: m.kind, locationId: m.location_id, delta: Number(m.delta), reason: m.reason || "", reference: m.reference || "", who: m.actor_label || "", at: m.created_at })) } : { error: h.error };
    }
    let list = [...lotInfo.described.values()].map((l) => ({ ...l, qty: locationId ? Number(l.byLocation[locationId] || 0) : l.quantity })).filter((l) => l.qty > 0 || l.id === lotId);
    if (view === "expired") list = list.filter((l) => l.state === "expired");
    else if (view === "quarantine") list = list.filter((l) => l.state === "quarantine");
    else if (view === "rejected") list = list.filter((l) => l.state === "rejected");
    else if (view === "expiring") list = list.filter((l) => l.state === "active" && l.daysLeft != null && l.daysLeft <= windowDays);
    let productIds = null;
    if (q) {
      const hits = await store.searchProductIds(admin, house, q);
      if (!hits.ok) return { ok: false, error: hits.error };
      productIds = hits.ids;
      const needle = q.toLowerCase();
      list = list.filter((l) => l.code.toLowerCase().includes(needle) || (productIds && productIds.has(l.productId)));
    }
    list.sort(byExpiry);
    const total = list.length, pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE)), at = Math.min(page, pageCount);
    list = list.slice((at - 1) * PAGE_SIZE, at * PAGE_SIZE);
    const named = await store.productsByIds(admin, house, [...new Set(list.map((l) => l.productId))]);
    if (!named.ok) return { ok: false, error: named.error };
    return {
      ...base, page: at, total, pageCount, view, alerts, alertWindow: windowDays, today, lotsAvailable: true, history, openLot: lotId,
      lots: list.map((l) => ({ ...lotForClient(l), qty: l.qty, productId: l.productId, sku: named.map[l.productId]?.sku || "", name: productName(named.map[l.productId]) })),
    };
  }
  if (tab === "counts") {
    const id = Number(params.count) > 0 ? Number(params.count) : null;
    if (id) {
      const got = await counts.getCount(admin, house, id);
      if (!got.ok) return { ...base, countError: got.error, list: [] };
      const c = got.count;
      return {
        ...base, count: { id: c.id, locationId: c.location_id, status: c.status, note: c.note || "", at: c.created_at, who: c.created_label || "", closedAt: c.closed_at, closedWho: c.closed_label || "", differences: c.differences },
        lines: got.lines.map((l) => ({ productId: l.product_id, sku: l.sku || "", name: l.name, expected: l.expected, counted: l.counted })),
        summary: summarize(got.lines),
      };
    }
    const res = await counts.listCounts(admin, house, { limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
    if (!res.ok) return { ...base, list: [], countError: res.error };      // the rest of the warehouse keeps working without migration 41
    return { ...base, hasMore: res.hasMore, list: res.counts.map((c) => ({ id: c.id, locationId: c.location_id, status: c.status, note: c.note || "", at: c.created_at, who: c.created_label || "", closedAt: c.closed_at, differences: c.differences })) };
  }
  return base;       // locations: the list is already there
}

const STOCK_READ_ERROR = tr("موجودی انبار خوانده نشد. دوباره تلاش کنید.");
const round = (n) => Math.round(n * 1000) / 1000;

// the lots of the house (all of them, in chunks) described for a day; `available: false` when migration 45 is not applied
async function loadLots(admin, house) {
  const lots = await store.allLots(admin, house);
  if (!lots.ok) return lots.unavailable ? { available: false, described: new Map() } : { error: lots.error };
  const bal = await store.allLotBalances(admin, house);
  if (!bal.ok) return { error: bal.error };
  return { available: true, described: describeLots(lots.rows, bal.rows, teamToday()) };
}
// soonest expiry first, lots without a date last
const byExpiry = (a, b) => (a.expiry && b.expiry ? a.expiry.localeCompare(b.expiry) : a.expiry ? -1 : b.expiry ? 1 : 0) || a.code.localeCompare(b.code) || a.id - b.id;
const lotForClient = (l) => ({ id: l.id, code: l.code, expiry: l.expiry, status: l.status, state: l.state, version: l.version, quantity: l.quantity, byLocation: l.byLocation, daysLeft: l.daysLeft });
