// lib/operator/productVersions.js — the change history of a product (migration 38) and "revert this change". Plain module (the client
// is passed in): unit-tested. A version row holds ONLY the fields that changed, old and new; reverting writes the old values back as
// a NEW change (which is recorded too), so history is never rewritten. A version never holds customer data.
import { tr } from "../panel/i18n.js";

// the fields that identify the product or are maintained by the database are never written back
export const NEVER_REVERTED = new Set(["id", "slug", "sku", "created_at", "updated_at", "views", "__ops"]);
// fields the database maintains: not a "change" worth recording
const SYSTEM_FIELDS = new Set(["id", "created_at", "updated_at", "views", "__ops"]);
export const VERSION_KINDS = ["update", "restore", "quick", "approval", "create"];

export const VERSION_MESSAGES = {
  unavailable: tr("تاریخچهٔ نسخه‌ها در دسترس نیست (مایگریشن ۳۸ اجرا نشده یا پایگاه داده پاسخ نمی‌دهد)."),
  notFound: tr("این نسخه یا محصول وجود ندارد."),
  nothing: tr("محصول همین حالا هم مثل آن نسخه است؛ چیزی برای برگرداندن نیست."),
  conflict: tr("این محصول در این فاصله توسط شخص دیگری تغییر کرده است؛ تغییر شما ذخیره نشد."),
};

export const versionTable = (panel) => (panel === "beauty" ? "beauty_product_versions" : "product_versions");
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// → best effort: never throws, never blocks the change that was already saved. { ok }
export async function recordVersion(admin, panel, { productId, kind, before, after, who = {}, requestId = null, revertsId = null }) {
  try {
    const keys = Object.keys(after || {}).filter((k) => !SYSTEM_FIELDS.has(k));
    if (!admin || !keys.length) return { ok: false, skipped: true };
    const pick = (o) => Object.fromEntries(keys.map((k) => [k, o?.[k] ?? null]));
    const { error } = await admin.from(versionTable(panel)).insert({
      product_id: productId, kind: VERSION_KINDS.includes(kind) ? kind : "update", changed: keys, before: pick(before), after: pick(after),
      actor_user_id: who.userId ?? null, actor_label: who.label ? String(who.label).slice(0, 80) : null, request_id: requestId, reverts_id: revertsId,
    });
    return { ok: !error };
  } catch { return { ok: false }; }
}

export async function listVersions(admin, panel, productId, limit = 50) {
  const { data, error } = await admin.from(versionTable(panel)).select("*").eq("product_id", productId).order("id", { ascending: false }).limit(Math.min(Math.max(Number(limit) || 50, 1), 200));
  if (error) return { ok: false, error: VERSION_MESSAGES.unavailable };
  return { ok: true, versions: data || [] };
}

export async function getVersion(admin, panel, productId, versionId) {
  const { data, error } = await admin.from(versionTable(panel)).select("*").eq("id", versionId).eq("product_id", productId).maybeSingle();
  if (error) return { ok: false, error: VERSION_MESSAGES.unavailable };
  return data ? { ok: true, version: data } : { ok: false, error: VERSION_MESSAGES.notFound };
}

// What reverting `version` would do to `current`: the old values of the fields that are different now.
//   fields: { field: oldValue }       what will be written
//   changedSince: [field]            fields somebody changed AGAIN after this version (the revert undoes that later change too)
export function revertPlan(current, version) {
  const fields = {}, changedSince = [];
  for (const [k, old] of Object.entries(version?.before || {})) {
    if (NEVER_REVERTED.has(k)) continue;
    if (same(current?.[k], old)) continue;
    fields[k] = old ?? null;
    if (!same(current?.[k], version.after?.[k])) changedSince.push(k);
  }
  return { fields, changedSince };
}
