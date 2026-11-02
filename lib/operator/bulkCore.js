// lib/operator/bulkCore.js — the work of a BULK product change (ticked rows, or every row a filter matches), shared by the direct path of the panel
// actions and by the executor that applies an approved request (N12), for both houses. Plain module (the client is passed in).
//   cleanBulkPatch(house, patch)   → the columns a bulk change may touch (anything else is dropped)
//   bulkOpsOf(allowed)             → the operations the change needs (publishing, archiving, price, category) besides products.bulk
//   applyBulkChange({...})         → the publish quality rule per product, then the update in chunks; the same for a direct save and an approval
import { bool, num, str } from "./validation.js";
import { gateItems } from "./publishGate.js";
import { diffRow } from "./approvalExecutors.js";
import { recordVersions } from "./productVersions.js";
import { PUBLISH_MESSAGES } from "./publishRules.js";
import { tr } from "../panel/i18n.js";

export const BULK_TABLES = { health: "products", beauty: "beauty_products" };
export const BULK_MAX_IDS = 2000;
const BULK_WRITE_CHUNK = 40;                          // products per statement: every one carries its own version condition
export const BULK_MESSAGES = {
  nothing: tr("عملیاتی انتخاب نشده است."),
  partial: tr("{done} محصول تغییر کرد و {notDone} محصول به‌خاطر خطا انجام نشد؛ فهرست را تازه کنید و دوباره تلاش کنید (محصولاتی که تغییر کرده‌اند دوباره دست نمی‌خورند)."),
  stale: tr("{count} محصول در این فاصله توسط دیگری تغییر کرده بود و دست‌نخورده ماند."),
};

export function cleanBulkPatch(house, patch = {}) {
  const p = patch && typeof patch === "object" ? patch : {};
  const allowed = {};
  if ("is_active" in p) allowed.is_active = bool(p.is_active);
  if (p.requestPrice) allowed.price = null;
  if (p.category_id !== undefined) {
    allowed.category_id = num(p.category_id);
    allowed.category = str(p.category);
  }
  if (house === "beauty" && p.brand !== undefined) allowed.brand = p.brand === null ? null : str(p.brand, 120);
  return allowed;
}

// the operations of a cleaned change (what the person must be allowed to do, or to ask for)
export function bulkOpsOf(allowed) {
  const ops = ["products.bulk"];
  if ("is_active" in allowed) ops.push(allowed.is_active ? "products.publish" : "products.archive");
  if ("price" in allowed) ops.push("products.price");
  if ("category_id" in allowed || "brand" in allowed) ops.push("products.content");
  return ops;
}

// A list of ids that came out of a request: positive integers, no repeats, bounded.
export function cleanIds(list) {
  if (!Array.isArray(list) || !list.length || list.length > BULK_MAX_IDS) return null;
  const out = [];
  for (const v of list) {
    const n = Number(v);
    if (!Number.isSafeInteger(n) || n <= 0) return null;
    if (!out.includes(n)) out.push(n);
  }
  return out;
}

// ── planning: every row is judged on the row it WILL BE (review R11) ─────────────────────────────────────────────────────────
// The publish quality rule is applied to the resulting row — the stored row with the WHOLE cleaned patch laid over it — for every row whose result is public,
// whether the patch publishes it, clears a required field of a live product, or changes its category. A row that already lacked something before keeps the
// documented exception (publishRules.js: a pre-existing gap does not block an unrelated edit).
// → { ok: true, rows, pass: [rows that may be written], blocked: [{ id, sku, codes }], blockedCount, unchanged: [ids], missing } | { ok: false, error }
export async function planBulkChange({ admin, house, ids, allowed, bases = null }) {
  const table = BULK_TABLES[house];
  if (!table) return { ok: false, error: BULK_MESSAGES.nothing };
  const rows = [];
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await admin.from(table).select("*").in("id", ids.slice(i, i + 200));
    if (error) return { ok: false, error: PUBLISH_MESSAGES.unavailable };
    rows.push(...(data || []));
  }
  const stale = bases === null ? [] : rows.filter((r) => !Object.hasOwn(bases, r.id)
    || typeof bases[r.id] !== "string" || bases[r.id] !== r.updated_at).map((r) => r.id);
  const current = rows.filter((r) => !stale.includes(r.id));
  const res = await gateItems({ admin, house, items: current.map((r) => ({ before: r, after: { ...r, ...allowed } })) });
  if (res.state === "error") return { ok: false, error: PUBLISH_MESSAGES.unavailable };
  const stop = new Map(res.blocked.map((b) => [current[b.index].id, b.codes]));
  const same = (r) => Object.entries(allowed).every(([k, v]) => JSON.stringify(r[k] ?? null) === JSON.stringify(v ?? null));
  const pass = current.filter((r) => !stop.has(r.id) && !same(r));
  return {
    ok: true, rows, pass, stale,
    blocked: [...stop].map(([id, codes]) => ({ id, sku: rows.find((r) => r.id === id)?.sku ?? null, codes })).slice(0, 100), blockedCount: stop.size,
    unchanged: current.filter((r) => !stop.has(r.id) && same(r)).map((r) => r.id), missing: ids.length - rows.length,
  };
}

// Writes the change. Each product is written ONLY if it is still the version that was judged (updated_at, microsecond exact, in the same statement):
// a product somebody changed meanwhile is reported in `stale` and left alone. Every product that changed gets a history entry (before / after, who, request).
// A database error stops the run and says exactly what was done and what was not. No transaction spans the chunks — the exact lists make a retry safe.
// → { ok: true, count, ids, stale, unchanged, stopped } | { ok: false, error, publishBlocked?, blockedCount?, quality? } | { ok: false, dbError, partial: { doneIds, notDoneIds } }
export async function applyBulkChange({ admin, house, ids, allowed, record = null, bases = null }) {
  const table = BULK_TABLES[house];
  if (!table) return { ok: false, error: BULK_MESSAGES.nothing };
  if (!Object.keys(allowed || {}).length) return { ok: false, error: BULK_MESSAGES.nothing };
  const plan = await planBulkChange({ admin, house, ids, allowed, bases });
  if (!plan.ok) return plan;
  const stopped = { blocked: plan.blocked, blockedCount: plan.blockedCount };
  if (!plan.pass.length && plan.blockedCount && !plan.unchanged.length) return { ok: false, error: PUBLISH_MESSAGES.blockedMany.replace("{count}", String(plan.blockedCount)), publishBlocked: plan.blocked, blockedCount: plan.blockedCount, quality: true };
  const done = [], stale = [...plan.stale];
  for (let i = 0; i < plan.pass.length; i += BULK_WRITE_CHUNK) {
    const chunk = plan.pass.slice(i, i + BULK_WRITE_CHUNK);
    const cond = chunk.map((r) => `and(id.eq.${r.id},updated_at.eq.${r.updated_at})`).join(",");          // one statement, every product checked against ITS version
    const { data, error } = await admin.from(table).update(allowed).or(cond).select("id");
    if (error) {
      const notDone = plan.pass.slice(i).map((r) => r.id);
      await recordBulkVersions(admin, house, plan.pass.filter((r) => done.includes(r.id)), allowed, record);
      return { ok: false, dbError: error, partial: { doneIds: done, notDoneIds: notDone } };
    }
    const wrote = new Set((data || []).map((r) => r.id));
    for (const r of chunk) (wrote.has(r.id) ? done : stale).push(r.id);
  }
  await recordBulkVersions(admin, house, plan.pass.filter((r) => done.includes(r.id)), allowed, record);
  return { ok: true, count: done.length, ids: done, stale, unchanged: plan.unchanged, stopped };
}

// one history entry per product that really changed (a single insert per chunk of products)
async function recordBulkVersions(admin, house, rows, allowed, record) {
  if (!rows.length) return;
  const who = { userId: record?.userId ?? null, label: record?.label || null };
  for (let i = 0; i < rows.length; i += 100) {
    await recordVersions(admin, house, rows.slice(i, i + 100).map((r) => {
      const { changed, old } = diffRow(r, allowed);
      return { productId: r.id, kind: record?.kind === "approval" ? "approval" : "update", before: old, after: changed, who, requestId: record?.requestId ?? null };
    }));
  }
}

// What an approved bulk change reports (the executor of products.bulk): exact lists, never a generic failure that hides earlier writes.
export async function bulkResult(res, audit, request) {
  if (res.dbError) {
    if (audit) { try { await audit({ action: "product.bulk_partial", entity: "products", ids: (res.partial?.doneIds || []).slice(0, 50), detail: { done: res.partial?.doneIds?.length ?? 0, notDone: res.partial?.notDoneIds?.length ?? 0, request: request?.id } }); } catch { /* best effort */ } }
    return { ok: false, error: "failed", done: res.partial?.doneIds || [], notDone: res.partial?.notDoneIds || [] };
  }
  if (!res.ok) return { ok: false, error: res.quality ? "quality" : "failed" };
  if (res.stale?.length && audit) { try { await audit({ action: "product.bulk_partial", entity: "products", ids: res.stale.slice(0, 50), detail: { done: res.count, stale: res.stale.length, request: request?.id } }); } catch { /* best effort */ } }
  return res.count > 0 || res.unchanged?.length ? { ok: true, count: res.count, stale: res.stale || [], unchanged: res.unchanged || [] } : { ok: false, error: res.stale?.length ? "stale" : "notFound" };
}

// The same columns, but coming back out of a stored request (they are DB columns now: price is only ever null = "ask for price").
export function cleanAllowedColumns(house, stored = {}) {
  const p = stored && typeof stored === "object" ? stored : {};
  const out = {};
  if ("is_active" in p) out.is_active = bool(p.is_active);
  if (p.price === null) out.price = null;
  if (p.category_id !== undefined) { out.category_id = num(p.category_id); out.category = str(p.category); }
  if (house === "beauty" && p.brand !== undefined) out.brand = p.brand === null ? null : str(p.brand, 120);
  return out;
}

// A person whose policy says "needs approval" files ONE request for the whole change. The ids are fixed now (a filtered selection was already resolved
// by the server); the change is applied to what those rows are when someone approves, through applyBulkChange — the same rule as a direct save.
// A request that could never be applied is not filed. a = the action context ({ admin, file }).
export async function fileBulkChange(a, { house, ids, allowed, scope = null }) {
  const table = BULK_TABLES[house];
  // a request that could never be applied is not filed: the rule is judged on the rows as they will be (publication, a cleared required field, a category change)
  const plan = await planBulkChange({ admin: a.admin, house, ids, allowed });
  if (!plan.ok) return { ok: false, error: plan.error };
  if (!plan.pass.length && plan.blockedCount && !plan.unchanged.length) return { ok: false, error: PUBLISH_MESSAGES.blockedMany.replace("{count}", String(plan.blockedCount)), publishBlocked: plan.blocked, blockedCount: plan.blockedCount };
  const blockedNow = plan.blockedCount || 0;
  const sample = await a.admin.from(table).select("id,sku,name_en,name_fa").in("id", ids.slice(0, 5));
  return a.file({
    operation: "products.bulk", ops: bulkOpsOf(allowed), entity: "products", subject: `bulk · ${ids.length}`,
    before: { count: ids.length, scope: scope || "page", blockedNow, sample: (sample.data || []).map((p) => p.sku || p.name_en || p.name_fa || String(p.id)) },
    proposed: { ids, patch: allowed, bases: Object.fromEntries(plan.rows.map((r) => [r.id, r.updated_at])) },
  });
}
