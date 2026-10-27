// lib/warehouse/countsStore.js — reads and writes of stock counts and minimum levels (migration 41) against the service-role client.
// SERVER ONLY (see tests/warehouse-no-leak.test.mjs). A count never changes a balance: closing it posts differences through store.post.
import { names, stockError } from "./core.js";
import { COUNT_MESSAGES } from "./countsCore.js";
import { tr } from "../panel/i18n.js";

const countNames = (house) => ({ ...names(house), levels: `${house}_stock_levels`, counts: `${house}_stock_counts`, lines: `${house}_stock_count_lines` });

// the database's refusals of migration 41 + the shared ones of migration 36
function fail(err) {
  const msg = String(err?.message || "");
  if (/stock:count_closed/.test(msg)) return { ok: false, code: "count_closed", error: COUNT_MESSAGES.count_closed };
  if (err?.code === "23505" && /stock_counts_one_open/.test(msg)) return { ok: false, code: "count_open_exists", error: COUNT_MESSAGES.count_open_exists };
  if (err?.code === "42P01" || err?.code === "PGRST205") return { ok: false, code: "unavailable", error: COUNT_MESSAGES.unavailable };
  const s = stockError(err);
  return s.code === "failed" ? { ok: false, code: "failed", error: COUNT_MESSAGES.generic } : { ok: false, ...s };
}
const PRODUCT_COLS = "id,sku,name_fa,name_en,name_ru,name_tg";
const productName = (p) => (p ? p.name_fa || p.name_en || p.name_ru || p.name_tg || "" : "");

async function productsById(admin, house, ids) {
  if (!ids.length) return { ok: true, map: {} };
  const { data, error } = await admin.from(countNames(house).products).select(PRODUCT_COLS).in("id", ids);
  return error ? fail(error) : { ok: true, map: Object.fromEntries((data || []).map((p) => [p.id, p])) };
}

// ── minimum levels ────────────────────────────────────────────────────────────────────────────────────────────────────────
export async function listLevels(admin, house) {
  const { data, error } = await admin.from(countNames(house).levels).select("product_id,min_level,updated_at,updated_label").limit(5000);
  return error ? fail(error) : { ok: true, levels: data || [] };
}

export async function setLevel(admin, house, { productId, minLevel }, who) {
  const t = countNames(house);
  if (minLevel == null) {
    const { error } = await admin.from(t.levels).delete().eq("product_id", productId);
    return error ? fail(error) : { ok: true, removed: true };
  }
  const { error } = await admin.from(t.levels).upsert({ product_id: productId, min_level: minLevel, updated_at: new Date().toISOString(), updated_by: who.userId ?? null, updated_label: who.label ?? null }, { onConflict: "product_id" });
  return error ? fail(error) : { ok: true };
}

// ── counts ────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export async function listCounts(admin, house, { limit = 50 } = {}) {
  const t = countNames(house);
  const { data, error } = await admin.from(t.counts).select("id,location_id,status,note,created_at,created_label,closed_at,closed_label,differences").order("id", { ascending: false }).limit(Math.min(Math.max(Number(limit) || 50, 1), 200));
  return error ? fail(error) : { ok: true, counts: data || [] };
}

export async function getCount(admin, house, id) {
  const t = countNames(house);
  const c = await admin.from(t.counts).select("id,location_id,status,note,created_at,created_by,created_label,closed_at,closed_label,differences").eq("id", id).maybeSingle();
  if (c.error) return fail(c.error);
  if (!c.data) return { ok: false, code: "bad_count", error: COUNT_MESSAGES.bad_count };
  const l = await admin.from(t.lines).select("product_id,sku,expected,counted,counted_at,counted_label").eq("count_id", id).order("product_id", { ascending: true }).limit(5000);
  if (l.error) return fail(l.error);
  const p = await productsById(admin, house, (l.data || []).map((x) => x.product_id));
  if (!p.ok) return p;
  return { ok: true, count: c.data, lines: (l.data || []).map((x) => ({ ...x, expected: Number(x.expected), counted: x.counted == null ? null : Number(x.counted), name: productName(p.map[x.product_id]) })) };
}

// A count starts as a snapshot of one warehouse: every product that has a balance row there, with the quantity the system holds right now.
// If the lines cannot be written the count is cancelled again (never left open and empty).
export async function startCount(admin, house, { locationId, note }, who) {
  const t = countNames(house);
  const loc = await admin.from(t.locations).select("id,is_active").eq("id", locationId).maybeSingle();
  if (loc.error) return fail(loc.error);
  if (!loc.data) return { ok: false, code: "unknown_location", error: stockError({ message: "stock:unknown_location" }).error };
  if (!loc.data.is_active) return { ok: false, code: "location_inactive", error: COUNT_MESSAGES.location_inactive };
  const ins = await admin.from(t.counts).insert({ location_id: locationId, note: note || null, created_by: who.userId ?? null, created_label: who.label ?? null }).select("id").single();
  if (ins.error) return fail(ins.error);
  const id = ins.data.id;
  const bal = await admin.from(t.balances).select("product_id,quantity").eq("location_id", locationId).limit(5000);
  const abort = async (err) => { await admin.from(t.counts).update({ status: "cancelled", closed_at: new Date().toISOString(), closed_label: who.label ?? null }).eq("id", id); return fail(err); };
  if (bal.error) return abort(bal.error);
  const rows = bal.data || [];
  const p = await productsById(admin, house, rows.map((r) => r.product_id));
  if (!p.ok) return abort({ message: "x" });
  if (rows.length) {
    const lines = rows.map((r) => ({ count_id: id, product_id: r.product_id, sku: p.map[r.product_id]?.sku ?? null, expected: Number(r.quantity) }));
    const w = await admin.from(t.lines).insert(lines);
    if (w.error) return abort(w.error);
  }
  return { ok: true, id, lines: rows.length };
}

// the counted quantities typed on the screen ([{ productId, counted|null }]); only lines of an OPEN count can change (the database refuses otherwise)
export async function saveCounted(admin, house, countId, entries, who) {
  const t = countNames(house);
  const now = new Date().toISOString();
  for (const e of entries) {
    const patch = e.counted == null ? { counted: null, counted_at: null, counted_label: null } : { counted: e.counted, counted_at: now, counted_label: who.label ?? null };
    const { data, error } = await admin.from(t.lines).update(patch).eq("count_id", countId).eq("product_id", e.productId).select("product_id");
    if (error) return fail(error);
    if (!data?.length) return { ok: false, code: "bad_count", error: COUNT_MESSAGES.bad_count };
  }
  return { ok: true, saved: entries.length };
}

// a product found on the shelf that the snapshot did not list: expected 0
export async function addLine(admin, house, countId, product, countedValue, who) {
  const t = countNames(house);
  const { error } = await admin.from(t.lines).insert({ count_id: countId, product_id: product.id, sku: product.sku ?? null, expected: 0, counted: countedValue, counted_at: countedValue == null ? null : new Date().toISOString(), counted_label: countedValue == null ? null : who.label ?? null });
  if (error) return /23505|duplicate/.test(`${error.code} ${error.message}`) ? { ok: false, code: "already_listed", error: tr("این محصول در این شمارش هست.") } : fail(error);
  return { ok: true };
}

// open → closed | cancelled, once: only a row that is still open is changed
export async function finish(admin, house, countId, status, { differences = null }, who) {
  const t = countNames(house);
  const { data, error } = await admin.from(t.counts).update({ status, closed_at: new Date().toISOString(), closed_by: who.userId ?? null, closed_label: who.label ?? null, differences: status === "closed" ? differences : null }).eq("id", countId).eq("status", "open").select("id");
  if (error) return fail(error);
  return data?.length ? { ok: true } : { ok: false, code: "count_closed", error: COUNT_MESSAGES.count_closed };
}

// ── report data ──────────────────────────────────────────────────────────────────────────────────────────────────────────
// stock rows with names, warehouse and minimum level (the whole house, bounded), for the CSV and the low-stock view
export async function stockRows(admin, house, { locationId = null, limit = 5000 } = {}) {
  const t = countNames(house);
  let q = admin.from(t.balances).select("location_id,product_id,quantity,reserved");
  if (locationId) q = q.eq("location_id", locationId);
  const b = await q.limit(limit);
  if (b.error) return fail(b.error);
  const rows = b.data || [];
  const [p, lv, lc] = await Promise.all([productsById(admin, house, [...new Set(rows.map((r) => r.product_id))]), listLevels(admin, house), listLocationsLite(admin, t)]);
  for (const r of [p, lv, lc]) if (!r.ok) return r;
  const min = Object.fromEntries(lv.levels.map((l) => [l.product_id, Number(l.min_level)]));
  return { ok: true, rows: rows.map((r) => ({ productId: r.product_id, sku: p.map[r.product_id]?.sku || "", name: productName(p.map[r.product_id]), locationId: r.location_id, warehouse: lc.map[r.location_id] || "", quantity: Number(r.quantity), reserved: Number(r.reserved), minLevel: min[r.product_id] ?? null })), levels: min, truncated: rows.length >= limit };
}

async function listLocationsLite(admin, t) {
  const { data, error } = await admin.from(t.locations).select("id,name").limit(500);
  return error ? fail(error) : { ok: true, map: Object.fromEntries((data || []).map((l) => [l.id, l.name])) };
}

export async function movementRows(admin, house, { from = null, to = null, limit = 5000 } = {}) {
  const t = countNames(house);
  let q = admin.from(t.movements).select("id,created_at,kind,sku,product_id,location_id,delta,balance_after,reason,reference,actor_label");
  if (from) q = q.gte("created_at", from);
  if (to) q = q.lte("created_at", to);
  const m = await q.order("id", { ascending: false }).limit(limit);
  if (m.error) return fail(m.error);
  const lc = await listLocationsLite(admin, t);
  if (!lc.ok) return lc;
  return { ok: true, rows: (m.data || []).map((r) => ({ ...r, warehouse: lc.map[r.location_id] || "" })), truncated: (m.data || []).length >= limit };
}
