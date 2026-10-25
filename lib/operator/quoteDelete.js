// lib/operator/quoteDelete.js — the one place that deletes or bulk-changes customer requests.
// Shared by the Health and Beauty operator actions; each panel passes ITS OWN
// session check, admin client and table, so a Health session can never reach
// the Beauty table or vice versa. Plain module (no Next imports) so it is
// unit-tested directly; the "use server" actions are thin wrappers around it.

import { QUOTE_STATUSES } from "./constants.js";

export const MAX_BULK_QUOTES = 200;

export const QUOTE_DELETE_MESSAGES = {
  noSession: "نشست معتبر نیست. دوباره وارد شوید.",
  noKey: "کلید سرویس Supabase تنظیم نشده است (SUPABASE_SERVICE_ROLE_KEY).",
  badId: "شناسه درخواست نامعتبر است.",
  notFound: "این درخواست دیگر وجود ندارد (شاید قبلاً حذف شده). فهرست به‌روز شد.",
  failed: "حذف ناموفق بود. دوباره تلاش کنید.",
  badIds: "فهرست درخواست‌ها نامعتبر است.",
  noneSelected: "هیچ درخواستی انتخاب نشده است.",
  tooMany: `در هر بار حداکثر ${MAX_BULK_QUOTES} درخواست قابل انتخاب است.`,
  badStatus: "وضعیت نامعتبر است.",
  statusNotAllowed: "این وضعیت در پایگاه داده هنوز مجاز نیست. برای «آرشیو» مایگریشن ۲۹ را در Supabase اجرا کنید.",
  statusFailed: "تغییر وضعیت ناموفق بود. دوباره تلاش کنید.",
};

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
export async function deleteQuoteGuarded({ getSession, getAdminClient, table, id }) {
  const session = await getSession();
  if (!session) return { ok: false, error: QUOTE_DELETE_MESSAGES.noSession };

  const admin = getAdminClient();
  if (!admin) return { ok: false, error: QUOTE_DELETE_MESSAGES.noKey };

  const qid = parseQuoteId(id);
  if (qid === null) return { ok: false, error: QUOTE_DELETE_MESSAGES.badId };

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
export async function deleteQuotesGuarded({ getSession, getAdminClient, table, ids }) {
  const session = await getSession();
  if (!session) return { ok: false, error: QUOTE_DELETE_MESSAGES.noSession };

  const admin = getAdminClient();
  if (!admin) return { ok: false, error: QUOTE_DELETE_MESSAGES.noKey };

  const parsed = parseQuoteIds(ids);
  if (parsed.error) return { ok: false, error: parsed.error };

  const { data, error } = await admin.from(table).delete().in("id", parsed.ids).select("id");
  if (error) return { ok: false, error: QUOTE_DELETE_MESSAGES.failed };
  const count = Array.isArray(data) ? data.length : 0;
  if (count === 0) return { ok: false, notFound: true, error: QUOTE_DELETE_MESSAGES.notFound };
  console.info(`[operator] ${table}: ${count} request(s) deleted`);
  return { ok: true, count, missing: parsed.ids.length - count, deletedIds: data.map((r) => r.id) };
}

// Move several requests to one status (archive, spam, restore to "new", …).
export async function setQuotesStatusGuarded({ getSession, getAdminClient, table, ids, status }) {
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
  return { ok: true, count, missing: parsed.ids.length - count, updatedIds: data.map((r) => r.id) };
}
