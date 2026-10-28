// lib/operator/quoteOps.js — request management beyond status: who looks after a request
// and which requests have waited too long. Shared by the Health and Beauty panels; each
// panel passes ITS OWN session check, admin client and table (same rule as quoteDelete.js).
// Plain module (no Next imports) so it is unit-tested directly.

import { parseQuoteId } from "./quoteDelete.js";
import { tr } from "../panel/i18n.js";

export const ASSIGNEE_MAX = 60;
export const OVERDUE_HOURS = 24;

export const QUOTE_OPS_MESSAGES = {
  noSession: tr("نشست معتبر نیست. دوباره وارد شوید."),
  noKey: tr("کلید سرویس Supabase تنظیم نشده است (SUPABASE_SERVICE_ROLE_KEY)."),
  badId: tr("شناسه درخواست نامعتبر است."),
  badAssignee: tr("نام مسئول نامعتبر است."),
  tooLong: tr("نام مسئول حداکثر {max} نویسه باشد.", { max: ASSIGNEE_MAX }),
  notFound: tr("این درخواست دیگر وجود ندارد. فهرست به‌روز شد."),
  needsMigration: tr("ستون «مسئول» هنوز در پایگاه داده نیست. مایگریشن ۳۲ را در Supabase اجرا کنید."),
  failed: tr("ذخیره ناموفق بود. دوباره تلاش کنید."),
};

const CONTROL = /[\u0000-\u001F\u007F‎‏‪-‮⁦-⁩]/g;

// A label typed by the team ("سارا", "Ali – sales"). Control and bidi-override characters are
// removed and whitespace collapsed; empty means "unassigned". Returns { value } or { error }.
export function parseAssignee(raw) {
  if (raw == null) return { value: null };
  if (typeof raw !== "string") return { error: QUOTE_OPS_MESSAGES.badAssignee };
  const v = raw.replace(CONTROL, " ").replace(/\s+/g, " ").trim();
  if (v.length > ASSIGNEE_MAX) return { error: QUOTE_OPS_MESSAGES.tooLong };
  return { value: v || null };
}

const missingColumn = (e) => e && (e.code === "42703" || e.code === "PGRST204" || /column .* does not exist/i.test(String(e.message || "")));

// Session first, then the service-role client, then the input, only then the database.
export async function assignQuoteGuarded({ getSession, getAdminClient, table, id, assignee, audit }) {
  const session = await getSession();
  if (!session) return { ok: false, error: QUOTE_OPS_MESSAGES.noSession };

  const admin = getAdminClient();
  if (!admin) return { ok: false, error: QUOTE_OPS_MESSAGES.noKey };

  const qid = parseQuoteId(id);
  if (qid === null) return { ok: false, error: QUOTE_OPS_MESSAGES.badId };
  const a = parseAssignee(assignee);
  if (a.error) return { ok: false, error: a.error };

  const { data, error } = await admin.from(table).update({ assigned_to: a.value }).eq("id", qid).select("id");
  if (error) return { ok: false, error: missingColumn(error) ? QUOTE_OPS_MESSAGES.needsMigration : QUOTE_OPS_MESSAGES.failed };
  if (!Array.isArray(data) || data.length === 0) return { ok: false, notFound: true, error: QUOTE_OPS_MESSAGES.notFound };

  // The log records THAT a request was (un)assigned, not the customer or the typed name.
  if (audit) { try { await audit({ action: "quote.assign", entity: table, ids: [qid], detail: { assigned: a.value !== null } }); } catch { /* best effort */ } }
  return { ok: true, assignee: a.value };
}

// A request is "waiting" while nobody has answered it: still `new`, no first response recorded.
export function isWaiting(q) {
  return Boolean(q) && q.status === "new" && !q.first_response_at;
}

export function waitingHours(q, now = Date.now()) {
  const created = Date.parse(q?.created_at);
  if (!Number.isFinite(created)) return 0;
  return Math.max(0, (now - created) / 3_600_000);
}

export function isOverdue(q, { now = Date.now(), hours = OVERDUE_HOURS } = {}) {
  return isWaiting(q) && waitingHours(q, now) >= hours;
}

export const notifyFailed = (q) => q?.notify_status === "failed";

// Numbers for the reminder and the dashboard, from rows with
// { status, created_at, first_response_at, notify_status }.
export function summarizeQuotes(rows, { now = Date.now(), hours = OVERDUE_HOURS } = {}) {
  let waiting = 0, overdue = 0, notifyFailures = 0, oldestHours = 0;
  for (const q of rows || []) {
    if (isWaiting(q)) {
      waiting++;
      const h = waitingHours(q, now);
      if (h >= hours) { overdue++; if (h > oldestHours) oldestHours = h; }
    }
    if (notifyFailed(q) && q.status !== "spam" && q.status !== "archived") notifyFailures++;
  }
  return { waiting, overdue, notifyFailures, oldestHours: Math.floor(oldestHours) };
}
