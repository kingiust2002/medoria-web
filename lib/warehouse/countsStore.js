// lib/warehouse/countsStore.js — reads and writes of stock counts and minimum levels (migration 41) against the service-role client.
// SERVER ONLY (see tests/warehouse-no-leak.test.mjs). A count never changes a balance: closing it posts differences through store.post.
import { names, stockError, STOCK_MESSAGES } from "./core.js";
import { COUNT_MESSAGES } from "./countsCore.js";
import { tr } from "../panel/i18n.js";
import { readAll } from "../operator/listQuery.js";

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
  const unique = [...new Set(ids)], map = {};
  for (let i = 0; i < unique.length; i += 200) {                 // a long id list does not fit in one address
    const { data, error } = await admin.from(countNames(house).products).select(PRODUCT_COLS).in("id", unique.slice(i, i + 200));
    if (error) return fail(error);
    for (const p of data || []) map[p.id] = p;
  }
  return { ok: true, map };
}

// ── minimum levels ────────────────────────────────────────────────────────────────────────────────────────────────────────
export async function listLevels(admin, house) {
  const res = await readAll((from, to) => admin.from(countNames(house).levels).select("product_id,min_level,updated_at,updated_label").order("product_id", { ascending: true }).range(from, to));
  return res.ok ? { ok: true, levels: res.rows } : fail(res.error);
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
export async function listCounts(admin, house, { limit = 50, offset = 0 } = {}) {
  const t = countNames(house);
  const n = Math.min(Math.max(Number(limit) || 50, 1), 200), from = Math.max(Number(offset) || 0, 0);
  const { data, error } = await admin.from(t.counts).select("id,location_id,status,note,created_at,created_label,closed_at,closed_label,differences").order("id", { ascending: false }).range(from, from + n);
  return error ? fail(error) : { ok: true, counts: (data || []).slice(0, n), hasMore: (data || []).length > n };
}

export async function getCount(admin, house, id) {
  const t = countNames(house);
  const c = await admin.from(t.counts).select("id,location_id,status,note,created_at,created_by,created_label,closed_at,closed_label,differences").eq("id", id).maybeSingle();
  if (c.error) return fail(c.error);
  if (!c.data) return { ok: false, code: "bad_count", error: COUNT_MESSAGES.bad_count };
  const l = await readAll((from, to) => admin.from(t.lines).select("product_id,sku,expected,counted,counted_at,counted_label").eq("count_id", id).order("product_id", { ascending: true }).range(from, to));
  if (!l.ok) return fail(l.error);
  const p = await productsById(admin, house, l.rows.map((x) => x.product_id));
  if (!p.ok) return p;
  return { ok: true, count: c.data, lines: l.rows.map((x) => ({ ...x, expected: Number(x.expected), counted: x.counted == null ? null : Number(x.counted), name: productName(p.map[x.product_id]) })) };
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
  const bal = await readAll((from, to) => admin.from(t.balances).select("product_id,quantity").eq("location_id", locationId).order("product_id", { ascending: true }).range(from, to));
  const abort = async (err) => { await admin.from(t.counts).update({ status: "cancelled", closed_at: new Date().toISOString(), closed_label: who.label ?? null }).eq("id", id); return fail(err); };
  if (!bal.ok) return abort(bal.error);             // never a snapshot of only the first rows
  const rows = bal.rows;
  const p = await productsById(admin, house, rows.map((r) => r.product_id));
  if (!p.ok) return abort({ message: "x" });
  if (rows.length) {
    const lines = rows.map((r) => ({ count_id: id, product_id: r.product_id, sku: p.map[r.product_id]?.sku ?? null, expected: Number(r.quantity) }));
    for (let i = 0; i < lines.length; i += 1000) {
      const w = await admin.from(t.lines).insert(lines.slice(i, i + 1000));
      if (w.error) return abort(w.error);
    }
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
export async function stockRows(admin, house, { locationId = null } = {}) {
  const t = countNames(house);
  const b = await readAll((from, to) => {
    let q = admin.from(t.balances).select("location_id,product_id,quantity,reserved");
    if (locationId) q = q.eq("location_id", locationId);
    return q.order("product_id", { ascending: true }).order("location_id", { ascending: true }).range(from, to);
  });
  if (!b.ok) return fail(b.error);
  const rows = b.rows;
  const [p, lv, lc] = await Promise.all([productsById(admin, house, rows.map((r) => r.product_id)), listLevels(admin, house), listLocationsLite(admin, t)]);
  for (const r of [p, lv, lc]) if (!r.ok) return r;
  const min = Object.fromEntries(lv.levels.map((l) => [l.product_id, Number(l.min_level)]));
  return { ok: true, rows: rows.map((r) => ({ productId: r.product_id, sku: p.map[r.product_id]?.sku || "", name: productName(p.map[r.product_id]), locationId: r.location_id, warehouse: lc.map[r.location_id] || "", quantity: Number(r.quantity), reserved: Number(r.reserved), minLevel: min[r.product_id] ?? null })), levels: min };
}

async function listLocationsLite(admin, t) {
  const res = await readAll((from, to) => admin.from(t.locations).select("id,name").order("id", { ascending: true }).range(from, to));
  return res.ok ? { ok: true, map: Object.fromEntries(res.rows.map((l) => [l.id, l.name])) } : fail(res.error);
}

export async function movementRows(admin, house, { from = null, to = null } = {}) {
  const t = countNames(house);
  const m = await readAll((a, b) => {
    let q = admin.from(t.movements).select("id,created_at,kind,sku,product_id,location_id,delta,balance_after,reason,reference,actor_label");
    if (from) q = q.gte("created_at", from);
    if (to) q = q.lte("created_at", to);
    return q.order("id", { ascending: false }).range(a, b);
  });
  if (!m.ok) return fail(m.error);
  const lc = await listLocationsLite(admin, t);
  if (!lc.ok) return lc;
  return { ok: true, rows: m.rows.map((r) => ({ ...r, warehouse: lc.map[r.location_id] || "" })) };
}

// ── closing ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
// ONE database call (migration 41): lock the count, verify the reviewed snapshot (`expected` = [[productId, delta], …], optional), post every
// difference and close — all or nothing. → { ok, differences, replayed } | { ok: false, code, error, failed? }
export async function closeCount(admin, house, { countId, expected = null, who, requestId = null }) {
  const { data, error } = await admin.rpc(`${house}_stock_count_close`, { p_count: countId, p_expected: expected, p_actor: who.userId ?? null, p_actor_label: who.label ?? null, p_request: requestId });
  if (error) {
    const msg = String(error.message || "");
    const code = /stock:([a-z_]+)/.exec(msg)?.[1];
    if (code === "count_stale") return { ok: false, code: "stale", error: COUNT_MESSAGES.stale };
    if (code === "count_closed") return { ok: false, code: "count_closed", error: COUNT_MESSAGES.count_closed };
    if (code === "nothing_counted") return { ok: false, code: "nothing_counted", error: COUNT_MESSAGES.nothing_counted };
    if (code === "unknown_count") return { ok: false, code: "bad_count", error: COUNT_MESSAGES.bad_count };
    if (code === "count_line_failed") {
      // DETAIL = 'product=4;sku=H-4;reason=stock:insufficient_stock;detail=available=1.000'
      const d = String(error.details || "");
      const sku = /sku=([^;]*)/.exec(d)?.[1] || "";
      const reason = /reason=([^;]*)/.exec(d)?.[1] || "";
      const why = stockError({ message: reason, details: /detail=(.*)$/.exec(d)?.[1] || "" });
      return { ok: false, code: "some_failed", error: COUNT_MESSAGES.some_failed, failed: [{ sku, error: why.error || STOCK_MESSAGES.unknown_product, ...(why.params ? { params: why.params } : {}) }] };
    }
    return fail(error);
  }
  if (!data || data.ok !== true) return { ok: false, code: "failed", error: COUNT_MESSAGES.generic };
  return { ok: true, replayed: Boolean(data.replayed), differences: Number(data.differences) || 0 };
}
