// lib/operator/productDelete.js — the one place that permanently deletes a catalog product.
// Shared by the Health and Beauty panels; each passes ITS OWN session check, admin client and table.
// Plain module (no Next imports) so it is unit-tested directly and the confirmation text can be computed in the browser.
//
// Rules (the panel's buttons are only a convenience; every rule is enforced here, on the server):
//   * a valid session, then the service-role client, then the id, and only then the database;
//   * only an ARCHIVED product (is_active = false) can be deleted: a visible product must be archived first, so a
//     misclick on a live product costs one click to undo, not the product;
//   * the caller must type the product's SKU (or its name when it has none): the server compares it to the stored row;
//   * an ATTEMPT entry is written to the activity log BEFORE the delete; if it cannot be written the product is not deleted.
//     A log table that does not exist (migration 30 not applied) counts as "cannot be written": it is a refusal, never a
//     permission to delete without a history;
//   * the delete itself repeats the "archived" condition, so a product re-activated in the meantime is not removed; an APPROVED deletion
//     also repeats the reviewed product version (`updated_at`), so a product edited after the request is never removed;
//   * the OUTCOME is written after it: `product.delete` only when a row was really removed, `product.delete_failed` (with a
//     short reason) when it was not. The attempt and the outcome are different entries, so a failed delete can never read as a
//     successful one in the history.
// Customer requests keep working: their product_id is set to NULL by the foreign key (migrations 02/10) and the
// product name, SKU and quantity are stored as text in each request. Uploaded images are NOT removed from storage
// (a duplicated product shares its image file).
import { parseQuoteId } from "./quoteDelete.js";
import { AUDIT_DELETE_MESSAGES, writeEntry } from "./auditedDelete.js";
import { tr } from "../panel/i18n.js";

export const PRODUCT_DELETE_MESSAGES = {
  noSession: tr("نشست معتبر نیست. دوباره وارد شوید."),
  noKey: tr("کلید سرویس Supabase تنظیم نشده است (SUPABASE_SERVICE_ROLE_KEY)."),
  badId: tr("شناسه محصول نامعتبر است."),
  notFound: tr("این محصول دیگر وجود ندارد (شاید قبلاً حذف شده). فهرست به‌روز شد."),
  notArchived: tr("فقط محصول آرشیوشده قابل حذف است. اول آن را آرشیو کنید."),
  wrongConfirmation: tr("متن تأیید درست نیست؛ هیچ چیز حذف نشد."),
  auditFailed: AUDIT_DELETE_MESSAGES.failed,
  auditUnavailable: AUDIT_DELETE_MESSAGES.unavailable,
  changed: tr("وضعیت محصول در این فاصله عوض شد؛ هیچ چیز حذف نشد. صفحه را تازه کنید."),
  failed: tr("حذف ناموفق بود. دوباره تلاش کنید."),
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

// Date.parse normalizes ISO offsets but truncates PostgreSQL's microseconds. Keep the remaining three digits as part of
// the version, so equivalent ISO representations compare equal while different sub-millisecond versions stay distinct.
const versionInstant = (value) => {
  if (typeof value !== "string") return null;
  const milliseconds = Date.parse(value);
  const fraction = /\.(\d+)(?:Z|[+-]\d{2}:?\d{2})$/i.exec(value)?.[1] || "";
  if (!Number.isFinite(milliseconds) || fraction.length > 6) return null;
  return `${milliseconds}:${fraction.padEnd(6, "0").slice(3)}`;
};

// `expectedUpdatedAt` (only for an approved deletion): the version of the product the reviewer was shown. The delete runs only against exactly
// that version — read now AND repeated inside the delete statement — so a product edited after the request is never removed.
export async function deleteProductGuarded({ getSession, getAdminClient, table, id, confirmation, audit, expectedUpdatedAt }) {
  const session = await getSession();
  if (!session) return { ok: false, error: PRODUCT_DELETE_MESSAGES.noSession };

  const admin = getAdminClient();
  if (!admin) return { ok: false, error: PRODUCT_DELETE_MESSAGES.noKey };

  const pid = parseProductId(id);
  if (pid === null) return { ok: false, error: PRODUCT_DELETE_MESSAGES.badId };

  const { data: row, error: readError } = await admin.from(table).select("id, slug, sku, name_en, name_fa, is_active, updated_at").eq("id", pid).maybeSingle();
  if (readError) return { ok: false, error: PRODUCT_DELETE_MESSAGES.failed };
  if (!row) return { ok: false, notFound: true, error: PRODUCT_DELETE_MESSAGES.notFound };
  if (row.is_active !== false) return { ok: false, error: PRODUCT_DELETE_MESSAGES.notArchived };   // missing column counts as "not archived": fail closed
  if (!confirmationMatches(confirmation, row)) return { ok: false, error: PRODUCT_DELETE_MESSAGES.wrongConfirmation };
  const versioned = expectedUpdatedAt !== undefined;
  if (versioned && !(versionInstant(row.updated_at) && versionInstant(row.updated_at) === versionInstant(expectedUpdatedAt))) return { ok: false, stale: true, error: PRODUCT_DELETE_MESSAGES.changed };

  // 1. the attempt must be on record before anything is deleted (no audit function, a missing table and a failing write all refuse)
  const sku = row.sku ? { sku: row.sku } : undefined;
  const attempt = await writeEntry(audit, { action: "product.delete_attempt", entity: table, ids: [pid], detail: sku });
  if (!attempt.ok) return { ok: false, error: attempt.unavailable ? PRODUCT_DELETE_MESSAGES.auditUnavailable : PRODUCT_DELETE_MESSAGES.auditFailed };

  // 2. the delete, repeating "archived"
  let del = admin.from(table).delete().eq("id", pid).eq("is_active", false);
  if (versioned) del = del.eq("updated_at", row.updated_at);          // the exact version verified at microsecond precision above, atomically with the delete
  const { data, error } = await del.select("id");
  if (error) {
    await writeEntry(audit, { action: "product.delete_failed", entity: table, ids: [pid], detail: { ...sku, reason: "db_error" } });
    return { ok: false, error: PRODUCT_DELETE_MESSAGES.failed };
  }
  if (!Array.isArray(data) || data.length === 0) {
    await writeEntry(audit, { action: "product.delete_failed", entity: table, ids: [pid], detail: { ...sku, reason: "state_changed" } });
    return { ok: false, error: PRODUCT_DELETE_MESSAGES.changed };
  }

  // 3. the outcome. The row is gone either way; if only this entry fails the history shows an attempt without an outcome.
  const outcome = await writeEntry(audit, { action: "product.delete", entity: table, ids: [pid], detail: sku });
  console.info(`[operator] ${table} #${pid} deleted`);
  return { ok: true, slug: row.slug || null, historyComplete: outcome.ok };
}
