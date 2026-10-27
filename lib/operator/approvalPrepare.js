// lib/operator/approvalPrepare.js — "ask again": re-read the record and give the same proposal a fresh basis (what the record looks like
// NOW, and the exact version it will be applied to). Plain module; used when a requester resubmits a rejected / stale request.
const tableOf = (panel) => (panel === "beauty" ? "beauty_products" : "products");

export function makeProductPrepare({ panel, admin }) {
  const table = tableOf(panel);
  return async function prepare(request) {
    if (request.operation === "products.create") return { before: null, baseUpdatedAt: null };       // nothing to be stale against
    const { data: cur, error } = await admin.from(table).select("*").eq("id", request.entity_id).maybeSingle();
    if (error) return { error: "failed" };
    if (!cur) return { error: "notFound" };
    if (request.operation === "products.delete") {
      if (cur.is_active !== false) return { error: "stale" };                                         // it is live again: nothing to delete
      return { before: { sku: cur.sku, is_active: false }, baseUpdatedAt: cur.updated_at };
    }
    const { __ops, ...proposed } = request.proposed || {};
    const before = Object.fromEntries(Object.keys(proposed).map((k) => [k, cur[k] ?? null]));         // the CURRENT values of the fields to change
    return { before, baseUpdatedAt: cur.updated_at };
  };
}
