// lib/operator/approvalExecutors.js — how an APPROVED change request is applied to the live data. One executor per operation; each one
// applies the change ONLY to the version the request was prepared against (a conditional update on `updated_at`), so a newer change is
// never overwritten: the executor answers "stale" and the request fails safely. Plain module (the client and the delete helper are
// passed in) so the rules run in unit tests.
import { deleteProductGuarded, PRODUCT_DELETE_MESSAGES } from "./productDelete.js";

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

export function makeProductExecutors({ panel, session, audit }) {
  const table = tableOf(panel);
  const update = ({ admin, request }) => applyUpdate({ admin, table, request });
  return {
    "products.content": update,
    "products.price": update,
    "products.stock_flag": update,
    "products.publish": update,
    "products.archive": update,
    "products.create": async ({ admin, request }) => {
      const fields = clean(request.proposed);
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
  }
  return ops;
}

// Only the fields that really changed (so a reviewer reads "price 10 → 12", not 40 unchanged fields), and the old values of them.
export function diffRow(before, row) {
  const changed = {}, old = {};
  for (const [k, v] of Object.entries(row)) {
    if (NEVER.has(k)) continue;
    const a = before?.[k], b = v;
    if (JSON.stringify(a ?? null) !== JSON.stringify(b ?? null)) { changed[k] = b; old[k] = a ?? null; }
  }
  return { changed, old };
}
