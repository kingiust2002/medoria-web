// lib/operator/quoteDelete.js — the one place that deletes or bulk-changes customer requests.
// Shared by the Health and Beauty operator actions; each panel passes ITS OWN
// session check, admin client and table, so a Health session can never reach
// the Beauty table or vice versa. Plain module (no Next imports) so it is
// unit-tested directly; the "use server" actions are thin wrappers around it.

import { QUOTE_STATUSES } from "./constants.js";
import { tr } from "../panel/i18n.js";

export const MAX_BULK_QUOTES = 200;

export const QUOTE_DELETE_MESSAGES = {
  noSession: tr("نشست معتبر نیست. دوباره وارد شوید."),
  noKey: tr("کلید سرویس Supabase تنظیم نشده است (SUPABASE_SERVICE_ROLE_KEY)."),
  badId: tr("شناسه درخواست نامعتبر است."),
  notFound: tr("این درخواست دیگر وجود ندارد (شاید قبلاً حذف شده). فهرست به‌روز شد."),
  failed: tr("حذف ناموفق بود. دوباره تلاش کنید."),
  badIds: tr("فهرست درخواست‌ها نامعتبر است."),
  noneSelected: tr("هیچ درخواستی انتخاب نشده است."),
  tooMany: tr("در هر بار حداکثر {max} درخواست قابل انتخاب است.", { max: MAX_BULK_QUOTES }),
  badStatus: tr("وضعیت نامعتبر است."),
  statusNotAllowed: tr("این وضعیت در پایگاه داده هنوز مجاز نیست. برای «آرشیو» مایگریشن ۲۹ را در Supabase اجرا کنید."),
  statusFailed: tr("تغییر وضعیت ناموفق بود. دوباره تلاش کنید."),
  auditFailed: tr("ثبت در تاریخچه ممکن نشد؛ برای امنیت، حذف انجام نشد. دوباره تلاش کنید."),
};

// A deletion is written to the activity log BEFORE it happens, and refused if the log cannot be
// written (a database hiccup must not allow an untraceable delete). A log table that does not exist
// yet (migration 30 not applied) is not an error: the previous behaviour applies.
export async function logFirst(audit, entry) {
  if (!audit) return true;
  const r = await audit(entry);
  return Boolean(r?.ok || r?.unavailable);
}
// Status changes are reversible: their log entry is best effort and never blocks the action.
async function logAfter(audit, entry) {
  if (audit) { try { await audit(entry); } catch { /* the log must never break the action */ } }
}

// Ids are BIGINT identities: accept a positive safe integer given as number or
// digit string, nothing else (no "1 or 1=1", no floats, no arrays, no "").
export function parseQuoteId(id) {
  if (typeof id === "number") return Number.isSafeInteger(id) && id > 0 ? id : null;
  if (typeof id === "string" && /^[1-9]\d{0,15}$/.test(id)) {
    const n = Number(id);
    return Number.isSafeInteger(n) ? n : null;
  }
  return null;
}

// Order matters: session first, then the service-role client, then the id, and
// only then the database. An anonymous caller never reaches `getAdminClient`.
export async function deleteQuoteGuarded({ getSession, getAdminClient, table, id, audit }) {
  const session = await getSession();
  if (!session) return { ok: false, error: QUOTE_DELETE_MESSAGES.noSession };

  const admin = getAdminClient();
  if (!admin) return { ok: false, error: QUOTE_DELETE_MESSAGES.noKey };

  const qid = parseQuoteId(id);
  if (qid === null) return { ok: false, error: QUOTE_DELETE_MESSAGES.badId };

  if (!(await logFirst(audit, { action: "quote.delete", entity: table, ids: [qid] }))) return { ok: false, error: QUOTE_DELETE_MESSAGES.auditFailed };
  const { data, error } = await admin.from(table).delete().eq("id", qid).select("id");
  if (error) return { ok: false, error: QUOTE_DELETE_MESSAGES.failed };
  if (!Array.isArray(data) || data.length === 0) {
    return { ok: false, notFound: true, error: QUOTE_DELETE_MESSAGES.notFound };
  }
  // The id only, never the customer's data.
  console.info(`[operator] ${table} #${qid} deleted`);
  return { ok: true };
}

// A list of ids for a bulk action: an array of 1..MAX_BULK_QUOTES valid ids
// (duplicates collapsed). ANY invalid entry rejects the whole call — nothing is
// guessed or silently skipped. Returns { ids } or { error }.
export function parseQuoteIds(ids) {
  if (!Array.isArray(ids)) return { error: QUOTE_DELETE_MESSAGES.badIds };
  if (ids.length === 0) return { error: QUOTE_DELETE_MESSAGES.noneSelected };
  if (ids.length > MAX_BULK_QUOTES) return { error: QUOTE_DELETE_MESSAGES.tooMany };
  const out = new Set();
  for (const raw of ids) {
    const id = parseQuoteId(raw);
    if (id === null) return { error: QUOTE_DELETE_MESSAGES.badIds };
    out.add(id);
  }
  return { ids: [...out] };
}

// Same order as deleteQuoteGuarded: session, then client, then input, then the
// database. Deletes only rows of `table` whose id is in the list.
export async function deleteQuotesGuarded({ getSession, getAdminClient, table, ids, audit }) {
  const session = await getSession();
  if (!session) return { ok: false, error: QUOTE_DELETE_MESSAGES.noSession };

  const admin = getAdminClient();
  if (!admin) return { ok: false, error: QUOTE_DELETE_MESSAGES.noKey };

  const parsed = parseQuoteIds(ids);
  if (parsed.error) return { ok: false, error: parsed.error };

  if (!(await logFirst(audit, { action: "quote.delete", entity: table, ids: parsed.ids }))) return { ok: false, error: QUOTE_DELETE_MESSAGES.auditFailed };
  const { data, error } = await admin.from(table).delete().in("id", parsed.ids).select("id");
  if (error) return { ok: false, error: QUOTE_DELETE_MESSAGES.failed };
  const count = Array.isArray(data) ? data.length : 0;
  if (count === 0) return { ok: false, notFound: true, error: QUOTE_DELETE_MESSAGES.notFound };
  console.info(`[operator] ${table}: ${count} request(s) deleted`);
  return { ok: true, count, missing: parsed.ids.length - count, deletedIds: data.map((r) => r.id) };
}

// Move several requests to one status (archive, spam, restore to "new", …).
export async function setQuotesStatusGuarded({ getSession, getAdminClient, table, ids, status, audit }) {
  const session = await getSession();
  if (!session) return { ok: false, error: QUOTE_DELETE_MESSAGES.noSession };

  const admin = getAdminClient();
  if (!admin) return { ok: false, error: QUOTE_DELETE_MESSAGES.noKey };

  if (typeof status !== "string" || !QUOTE_STATUSES.includes(status)) return { ok: false, error: QUOTE_DELETE_MESSAGES.badStatus };
  const parsed = parseQuoteIds(ids);
  if (parsed.error) return { ok: false, error: parsed.error };

  const { data, error } = await admin.from(table).update({ status }).in("id", parsed.ids).select("id");
  if (error) return { ok: false, error: error.code === "23514" ? QUOTE_DELETE_MESSAGES.statusNotAllowed : QUOTE_DELETE_MESSAGES.statusFailed };
  const count = Array.isArray(data) ? data.length : 0;
  if (count === 0) return { ok: false, notFound: true, error: QUOTE_DELETE_MESSAGES.notFound };
  console.info(`[operator] ${table}: ${count} request(s) set to ${status}`);
  await logAfter(audit, { action: "quote.status", entity: table, ids: data.map((r) => r.id), detail: { status } });
  return { ok: true, count, missing: parsed.ids.length - count, updatedIds: data.map((r) => r.id) };
}
