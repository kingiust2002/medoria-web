// lib/operator/previewLoad.js — what the private preview page shows, and whether the person may see it at all. Plain module: the session,
// the service-role client and the store are passed in, so the rules run in unit tests. SERVER side only (the caller is a page).
//
// The answer is { state: "notFound" } for EVERYTHING that is not allowed — no session, no right, another house, a bad address, a product that
// is not there — so the page answers a plain 404 and a stranger learns nothing (not even that a preview route exists).
import { mayView } from "./access.js";
import { overlay, applyProposal, previewStore } from "./previewDraft.js";

export const TABLES = { health: "products", beauty: "beauty_products" };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_FOUND = { state: "notFound" };

// id: "new" | a product number. → { state: "ok", product, variants, source, ... } | { state: "notFound" } | { state: "error" }
export async function loadPreview({ house, session, admin, id, token = null, requestId = null, store = previewStore }) {
  if (!TABLES[house] || !session || !admin) return NOT_FOUND;
  if (!mayView(session, house, "products.view")) return NOT_FOUND;
  const table = TABLES[house];
  const isNew = id === "new";
  const pid = isNew ? null : (/^[1-9]\d{0,15}$/.test(String(id)) ? Number(id) : NaN);
  if (!isNew && !Number.isSafeInteger(pid)) return NOT_FOUND;

  let stored = null;
  if (pid) {
    const r = await admin.from(table).select("*").eq("id", pid).maybeSingle();
    if (r.error) return { state: "error" };
    if (!r.data) return NOT_FOUND;
    stored = r.data;
    if (stored.variant_of != null) return NOT_FOUND;                      // a variant is shown on its product's page
  }

  let product = stored, source = isNew ? "new" : "saved", draftGone = false, request = null;
  if (token) {
    const d = store.get(token, { sid: session.sid, house }, pid);
    if (d) { product = overlay(stored, d.draft); source = "draft"; }
    else draftGone = true;                                                // expired / not yours: the saved version is shown, and it is said
  } else if (requestId) {
    // a reviewer previews what a pending request would change
    if (!UUID.test(String(requestId)) || !mayView(session, house, "approvals.view")) return NOT_FOUND;
    const q = await admin.from("operator_change_requests").select("id,house,operation,entity,entity_id,status,proposed,subject").eq("id", requestId).maybeSingle();
    if (q.error) return { state: "error" };
    const row = q.data;
    const sameThing = row && row.house === house && row.entity === table && String(row.entity_id ?? "") === String(pid ?? "") && String(row.operation).startsWith("products.");
    if (!sameThing) return NOT_FOUND;
    product = applyProposal(stored, row.proposed);
    source = "request";
    request = { id: row.id, operation: row.operation, status: row.status };
  }
  if (!product) return NOT_FOUND;                                         // "new" without a draft: nothing to show

  // the variants a visitor would see: the active ones of this product (the number of hidden ones is told)
  let variants = [], hiddenVariants = 0;
  if (pid) {
    const v = await admin.from(table).select("*").eq("variant_of", pid).order("variant_sort", { ascending: true }).order("id", { ascending: true }).limit(101);
    if (!v.error) {
      const rows = v.data || [];
      variants = rows.filter((x) => x.is_active !== false).map((x) => ({ id: x.id, sku: x.sku, options: x.variant_options, price: x.price, currency: x.currency, unit: x.unit, in_stock: x.in_stock, image_url: x.image_url, sort: x.variant_sort }));
      hiddenVariants = rows.length - variants.length;
    }                                                                     // before migration 44 there is no such column: no variants
  }
  return { state: "ok", product, variants, hiddenVariants, source, draftGone, request, stored: stored ? { id: stored.id, is_active: stored.is_active !== false, publish_at: stored.publish_at ?? null } : null };
}
