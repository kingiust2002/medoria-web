// lib/operator/bulkCore.js — the work of a BULK product change (ticked rows, or every row a filter matches), shared by the direct path of the panel
// actions and by the executor that applies an approved request (N12), for both houses. Plain module (the client is passed in).
//   cleanBulkPatch(house, patch)   → the columns a bulk change may touch (anything else is dropped)
//   bulkOpsOf(allowed)             → the operations the change needs (publishing, archiving, price, category) besides products.bulk
//   applyBulkChange({...})         → the publish quality rule per product, then the update in chunks; the same for a direct save and an approval
import { bool, num, str } from "./validation.js";
import { gateBulkPublish } from "./publishGate.js";
import { PUBLISH_MESSAGES } from "./publishRules.js";
import { tr } from "../panel/i18n.js";

export const BULK_TABLES = { health: "products", beauty: "beauty_products" };
export const BULK_MAX_IDS = 2000;
export const BULK_MESSAGES = {
  nothing: tr("عملیاتی انتخاب نشده است."),
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

// Publishing many at once: the rule decides per product — the ones that pass are published, the others are listed with what they lack.
// → { ok: true, count, ids, stopped } | { ok: false, error, publishBlocked?, blockedCount? } | { ok: false, dbError }
export async function applyBulkChange({ admin, house, ids, allowed }) {
  const table = BULK_TABLES[house];
  if (!table) return { ok: false, error: BULK_MESSAGES.nothing };
  if (!Object.keys(allowed || {}).length) return { ok: false, error: BULK_MESSAGES.nothing };
  let ids2 = ids, stopped = null;
  if (allowed.is_active === true) {
    const g = await gateBulkPublish({ admin, house, table, ids });
    if (!g.ok) return { ok: false, error: g.error };
    ids2 = g.passIds; stopped = g;
    if (!ids2.length) return { ok: false, error: PUBLISH_MESSAGES.blockedMany.replace("{count}", String(g.blockedCount)), publishBlocked: g.blocked, blockedCount: g.blockedCount, quality: true };
  }
  let count = 0;
  for (let i = 0; i < ids2.length; i += 200) {                              // chunks keep the address short when a whole filtered list is changed
    const { data, error } = await admin.from(table).update(allowed).in("id", ids2.slice(i, i + 200)).select("id");
    if (error) return { ok: false, dbError: error };
    count += data?.length ?? 0;
  }
  return { ok: true, count, ids: ids2, stopped };
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
  let blockedNow = 0;
  if (allowed.is_active === true) {
    const g = await gateBulkPublish({ admin: a.admin, house, table, ids });
    if (!g.ok) return { ok: false, error: g.error };
    if (!g.passIds.length) return { ok: false, error: PUBLISH_MESSAGES.blockedMany.replace("{count}", String(g.blockedCount)), publishBlocked: g.blocked, blockedCount: g.blockedCount };
    blockedNow = g.blockedCount || 0;
  }
  const sample = await a.admin.from(table).select("id,sku,name_en,name_fa").in("id", ids.slice(0, 5));
  return a.file({
    operation: "products.bulk", ops: bulkOpsOf(allowed), entity: "products", subject: `bulk · ${ids.length}`,
    before: { count: ids.length, scope: scope || "page", blockedNow, sample: (sample.data || []).map((p) => p.sku || p.name_en || p.name_fa || String(p.id)) },
    proposed: { ids, patch: allowed },
  });
}
