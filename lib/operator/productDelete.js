// lib/operator/productDelete.js — the one place that permanently deletes a catalog product.
// Shared by the Health and Beauty panels; each passes ITS OWN session check, admin client and table.
// Plain module (no Next imports) so it is unit-tested directly and the confirmation text can be computed in the browser.
//
// Rules (the panel's buttons are only a convenience; every rule is enforced here, on the server):
//   * a valid session, then the service-role client, then the id, and only then the database;
//   * only an ARCHIVED product (is_active = false) can be deleted: a visible product must be archived first, so a
//     misclick on a live product costs one click to undo, not the product;
//   * the caller must type the product's SKU (or its name when it has none): the server compares it to the stored row;
//   * the deletion is written to the activity log BEFORE it happens and refused if the log cannot be written;
//   * the delete itself repeats the "archived" condition, so a product re-activated in the meantime is not removed.
// Customer requests keep working: their product_id is set to NULL by the foreign key (migrations 02/10) and the
// product name, SKU and quantity are stored as text in each request. Uploaded images are NOT removed from storage
// (a duplicated product shares its image file).
import { logFirst, parseQuoteId } from "./quoteDelete.js";

export const PRODUCT_DELETE_MESSAGES = {
  noSession: "نشست معتبر نیست. دوباره وارد شوید.",
  noKey: "کلید سرویس Supabase تنظیم نشده است (SUPABASE_SERVICE_ROLE_KEY).",
  badId: "شناسه محصول نامعتبر است.",
  notFound: "این محصول دیگر وجود ندارد (شاید قبلاً حذف شده). فهرست به‌روز شد.",
  notArchived: "فقط محصول آرشیوشده قابل حذف است. اول آن را آرشیو کنید.",
  wrongConfirmation: "متن تأیید درست نیست؛ هیچ چیز حذف نشد.",
  auditFailed: "ثبت در تاریخچه ممکن نشد؛ برای امنیت، حذف انجام نشد. دوباره تلاش کنید.",
  changed: "وضعیت محصول در این فاصله عوض شد؛ هیچ چیز حذف نشد. صفحه را تازه کنید.",
  failed: "حذف ناموفق بود. دوباره تلاش کنید.",
};

export const parseProductId = parseQuoteId;

// Ids for bulk product actions: 1..max valid ids (duplicates collapsed); ANY invalid entry rejects the call.
export function parseProductIds(ids, max = 500) {
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > max) return null;
  const out = new Set();
  for (const raw of ids) {
    const id = parseQuoteId(raw);
    if (id === null) return null;
    out.add(id);
  }
  return [...out];
}

const norm = (s) => String(s ?? "").normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();

// What the person must type: the SKU, else the English name, else the Persian name, else the id.
export function expectedConfirmation(p) {
  return String(p?.sku || p?.name_en || p?.name_fa || p?.id || "").replace(/\s+/g, " ").trim();
}
export const confirmationMatches = (typed, p) => {
  const want = norm(expectedConfirmation(p));
  return want.length > 0 && norm(typed) === want;
};

export async function deleteProductGuarded({ getSession, getAdminClient, table, id, confirmation, audit }) {
  const session = await getSession();
  if (!session) return { ok: false, error: PRODUCT_DELETE_MESSAGES.noSession };

  const admin = getAdminClient();
  if (!admin) return { ok: false, error: PRODUCT_DELETE_MESSAGES.noKey };

  const pid = parseProductId(id);
  if (pid === null) return { ok: false, error: PRODUCT_DELETE_MESSAGES.badId };

  const { data: row, error: readError } = await admin.from(table).select("id, slug, sku, name_en, name_fa, is_active").eq("id", pid).maybeSingle();
  if (readError) return { ok: false, error: PRODUCT_DELETE_MESSAGES.failed };
  if (!row) return { ok: false, notFound: true, error: PRODUCT_DELETE_MESSAGES.notFound };
  if (row.is_active !== false) return { ok: false, error: PRODUCT_DELETE_MESSAGES.notArchived };   // missing column counts as "not archived": fail closed
  if (!confirmationMatches(confirmation, row)) return { ok: false, error: PRODUCT_DELETE_MESSAGES.wrongConfirmation };

  if (!(await logFirst(audit, { action: "product.delete", entity: table, ids: [pid], detail: row.sku ? { sku: row.sku } : undefined }))) {
    return { ok: false, error: PRODUCT_DELETE_MESSAGES.auditFailed };
  }
  const { data, error } = await admin.from(table).delete().eq("id", pid).eq("is_active", false).select("id");
  if (error) return { ok: false, error: PRODUCT_DELETE_MESSAGES.failed };
  if (!Array.isArray(data) || data.length === 0) return { ok: false, error: PRODUCT_DELETE_MESSAGES.changed };
  console.info(`[operator] ${table} #${pid} deleted`);
  return { ok: true, slug: row.slug || null };
}
