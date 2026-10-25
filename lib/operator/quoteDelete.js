// lib/operator/quoteDelete.js — the one place that deletes a customer request.
// Shared by the Health and Beauty operator actions; each panel passes ITS OWN
// session check, admin client and table, so a Health session can never reach
// the Beauty table or vice versa. Plain module (no Next imports) so it is
// unit-tested directly; the "use server" actions are thin wrappers around it.

export const QUOTE_DELETE_MESSAGES = {
  noSession: "نشست معتبر نیست. دوباره وارد شوید.",
  noKey: "کلید سرویس Supabase تنظیم نشده است (SUPABASE_SERVICE_ROLE_KEY).",
  badId: "شناسه درخواست نامعتبر است.",
  notFound: "این درخواست دیگر وجود ندارد (شاید قبلاً حذف شده). فهرست به‌روز شد.",
  failed: "حذف ناموفق بود. دوباره تلاش کنید.",
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
