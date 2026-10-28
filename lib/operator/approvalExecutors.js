// lib/operator/approvalExecutors.js — how an APPROVED change request is applied to the live data. One executor per operation; each one
// applies the change ONLY to the version the request was prepared against (a conditional update on `updated_at`), so a newer change is
// never overwritten: the executor answers "stale" and the request fails safely. Plain module (the client and the delete helper are
// passed in) so the rules run in unit tests.
import { deleteProductGuarded, PRODUCT_DELETE_MESSAGES } from "./productDelete.js";
import { recordVersion } from "./productVersions.js";
import { gateOne } from "./publishGate.js";
import { sameInstant, SCHEDULE_FIELDS } from "./schedule.js";
import { sameTranslationMeta } from "./translationMeta.js";
import { applyBulkChange, cleanAllowedColumns, cleanIds } from "./bulkCore.js";

const NEVER = new Set(["id", "created_at", "updated_at", "views", "__ops"]);
const tableOf = (panel) => (panel === "beauty" ? "beauty_products" : "products");

const clean = (proposed) => Object.fromEntries(Object.entries(proposed || {}).filter(([k]) => !NEVER.has(k)));

// Does the record still look the way the request saw it? Prefer the exact `updated_at`; fall back to the old values of the changed fields.
async function applyUpdate({ admin, table, request }) {
  const fields = clean(request.proposed);
  if (!Object.keys(fields).length) return { ok: false, error: "failed" };
  let q = admin.from(table).update(fields).eq("id", request.entity_id);
  if (request.base_updated_at) q = q.eq("updated_at", request.base_updated_at);
  const { data, error } = await q.select("id");
  if (error) return { ok: false, error: "failed" };
  if (data?.length) return { ok: true };
  const exists = await admin.from(table).select("id").eq("id", request.entity_id).limit(1);
  if (exists.error) return { ok: false, error: "failed" };
  return { ok: false, error: exists.data?.length ? "stale" : "notFound" };
}

// importRunner(proposed) applies an approved import ({ rows, options } → { ok, counts }); it needs the server-only import engine, so the action file
// of each house passes it in. Without one an import request fails safely (nothing is written).
export function makeProductExecutors({ panel, session, audit, importRunner = null }) {
  const table = tableOf(panel);
  // the history names the requester (whose change it is) and links the request; the reviewer is in the approval's own log entry
  const update = async ({ admin, request }) => {
    const { data: cur } = await admin.from(table).select("*").eq("id", request.entity_id).maybeSingle();
    // the publish rule is checked AGAIN now: the product or the rule may have changed since the request was filed
    if (cur && (await gateOne({ admin, house: panel, before: cur, after: { ...cur, ...clean(request.proposed) } })) !== null) return { ok: false, error: "quality" };
    const res = await applyUpdate({ admin, table, request });
    if (res.ok && cur) {
      const { changed, old } = diffRow(cur, clean(request.proposed));
      await recordVersion(admin, panel, { productId: request.entity_id, kind: "approval", before: old, after: changed, who: { userId: request.requested_by, label: "approved-request" }, requestId: request.id });
    }
    return res;
  };
  return {
    "products.content": update,
    "products.price": update,
    "products.stock_flag": update,
    "products.publish": update,
    "products.archive": update,
    // ONE request for a whole bulk edit (N12): applied to the ids it carries as those rows are NOW, through the same function as a direct bulk edit —
    // the publish quality rule is judged per product at this moment (the ones that pass go live, the others stay as they are)
    "products.bulk": async ({ admin, request }) => {
      const ids = cleanIds(request.proposed?.ids);
      const allowed = cleanAllowedColumns(panel, request.proposed?.patch);
      if (!ids || !Object.keys(allowed).length) return { ok: false, error: "failed" };
      const res = await applyBulkChange({ admin, house: panel, ids, allowed });
      if (res.dbError) return { ok: false, error: "failed" };
      if (!res.ok) return { ok: false, error: res.quality ? "quality" : "failed" };
      return res.count > 0 ? { ok: true, count: res.count } : { ok: false, error: "notFound" };
    },
    // ONE request for a whole import (N12): the rows are planned and written again now, against today's catalogue, by the same engine and the same rules
    // as a direct import (existing SKUs, the category limit, the publish quality rule: an incomplete row is saved as an inactive draft)
    "products.import": async ({ request }) => {
      if (!importRunner) return { ok: false, error: "failed" };
      const rows = Array.isArray(request.proposed?.rows) ? request.proposed.rows : null;
      if (!rows || !rows.length) return { ok: false, error: "failed" };
      const res = await importRunner({ rows, options: request.proposed?.options || {}, fileName: request.proposed?.fileName || null });
      return res?.ok ? { ok: true, counts: res.counts } : { ok: false, error: "failed" };
    },
    "products.create": async ({ admin, request }) => {
      const fields = clean(request.proposed);
      if ((await gateOne({ admin, house: panel, before: null, after: fields })) !== null) return { ok: false, error: "quality" };
      const { data, error } = await admin.from(table).insert(fields).select("id,slug");
      if (error) return { ok: false, error: error.code === "23505" ? "stale" : "failed" };
      return { ok: true, id: (Array.isArray(data) ? data[0] : data)?.id };
    },
    // a permanent delete: the typed confirmation travelled with the request; every rule of productDelete.js is checked AGAIN now
    // (archived at this moment, text matches, history written first), and the history names the reviewer who executed it
    "products.delete": async ({ admin, request }) => {
      if (!request.base_updated_at) return { ok: false, error: "stale" };      // a deletion is always prepared against a version; without one nothing is deleted
      const res = await deleteProductGuarded({
        getSession: async () => session, getAdminClient: () => admin, table, id: request.entity_id,
        confirmation: String(request.proposed?.confirmation ?? ""), audit, expectedUpdatedAt: request.base_updated_at,
      });
      return res.ok ? { ok: true } : { ok: false, error: res.notFound ? "notFound" : res.stale || res.error === PRODUCT_DELETE_MESSAGES.changed ? "stale" : "failed" };
    },
  };
}

// Which operations does a product change need? (price → products.price, visibility → publish/archive, anything else → content)
export function productOps(before, row) {
  const ops = new Set();
  if (before) {
    if ((before.price ?? null) !== (row.price ?? null)) ops.add("products.price");
    if ("is_active" in row && Boolean(before.is_active) !== Boolean(row.is_active)) ops.add(row.is_active ? "products.publish" : "products.archive");
    if ("in_stock" in row && Boolean(before.in_stock) !== Boolean(row.in_stock)) ops.add("products.stock_flag");
    // a schedule is a promise to publish / archive later: it needs the same right as doing it now
    if ("publish_at" in row && !sameInstant(before.publish_at, row.publish_at)) ops.add("products.publish");
    if ("unpublish_at" in row && !sameInstant(before.unpublish_at, row.unpublish_at)) ops.add("products.archive");
  }
  return ops;
}

// Only the fields that really changed (so a reviewer reads "price 10 → 12", not 40 unchanged fields), and the old values of them.
export function diffRow(before, row) {
  const changed = {}, old = {};
  for (const [k, v] of Object.entries(row)) {
    if (NEVER.has(k)) continue;
    const a = before?.[k], b = v;
    if (SCHEDULE_FIELDS.includes(k) ? !sameInstant(a, b) : k === "translation_meta" ? !sameTranslationMeta(a, b) : JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) { changed[k] = b; old[k] = a ?? null; }
  }
  return { changed, old };
}
