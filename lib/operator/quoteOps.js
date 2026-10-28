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
  badDate: tr("تاریخ پیگیری معتبر نیست."),
  dateRange: tr("تاریخ پیگیری باید در بازهٔ منطقی باشد."),
  needsMigration37: tr("ستون‌های پیگیری هنوز در پایگاه داده نیست. مایگریشن ۳۷ را اجرا کنید."),
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
export async function assignQuoteGuarded({ getSession, getAdminClient, table, id, assignee, audit, resolveUser }) {
  const session = await getSession();
  if (!session) return { ok: false, error: QUOTE_OPS_MESSAGES.noSession };

  const admin = getAdminClient();
  if (!admin) return { ok: false, error: QUOTE_OPS_MESSAGES.noKey };

  const qid = parseQuoteId(id);
  if (qid === null) return { ok: false, error: QUOTE_OPS_MESSAGES.badId };
  const a = parseAssignee(assignee);
  if (a.error) return { ok: false, error: a.error };

  // when the label is the display name of a real person of this house, remember the person too (migration 37)
  let userId = null;
  if (a.value && resolveUser) { try { userId = (await resolveUser(admin, a.value)) || null; } catch { userId = null; } }
  let { data, error } = await admin.from(table).update({ assigned_to: a.value, assigned_user_id: userId }).eq("id", qid).select("id");
  if (error && missingColumn(error)) ({ data, error } = await admin.from(table).update({ assigned_to: a.value }).eq("id", qid).select("id"));   // migration 37 not applied yet
  if (error) return { ok: false, error: missingColumn(error) ? QUOTE_OPS_MESSAGES.needsMigration : QUOTE_OPS_MESSAGES.failed };
  if (!Array.isArray(data) || data.length === 0) return { ok: false, notFound: true, error: QUOTE_OPS_MESSAGES.notFound };

  // The log records THAT a request was (un)assigned, not the customer or the typed name.
  if (audit) { try { await audit({ action: "quote.assign", entity: table, ids: [qid], detail: { assigned: a.value !== null, person: userId !== null } }); } catch { /* best effort */ } }
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
  let waiting = 0, overdue = 0, notifyFailures = 0, oldestHours = 0, followUpsDue = 0;
  for (const q of rows || []) {
    if (isWaiting(q)) {
      waiting++;
      const h = waitingHours(q, now);
      if (h >= hours) { overdue++; if (h > oldestHours) oldestHours = h; }
    }
    if (notifyFailed(q) && q.status !== "spam" && q.status !== "archived") notifyFailures++;
    const f = followUpState(q, now);
    if (f === "overdue" || f === "today") followUpsDue++;
  }
  return { waiting, overdue, notifyFailures, oldestHours: Math.floor(oldestHours), followUpsDue };
}

// ── follow-up date ────────────────────────────────────────────────────────────────────────────────────────────────────────
// A follow-up is a DAY, not a time: stored at 12:00 UTC so every time zone from UTC-11 to UTC+11 reads the same calendar day.
// "Today" is the team's day (Tajikistan, UTC+5).
export const TEAM_UTC_OFFSET_HOURS = 5;
export const FOLLOW_UP_DONE_STATUSES = ["closed", "archived", "spam"];

export const teamDay = (now = Date.now()) => new Date(now + TEAM_UTC_OFFSET_HOURS * 3_600_000).toISOString().slice(0, 10);

// "" / null → { value: null } (no follow-up); "YYYY-MM-DD" (a real calendar day, from last year to three years ahead) → { value: ISO }
export function parseFollowUp(input, now = Date.now()) {
  if (input == null || input === "") return { value: null };
  if (typeof input !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input)) return { error: QUOTE_OPS_MESSAGES.badDate };
  const d = new Date(`${input}T12:00:00.000Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== input) return { error: QUOTE_OPS_MESSAGES.badDate };
  const lo = now - 366 * 86_400_000, hi = now + 3 * 366 * 86_400_000;
  if (d.getTime() < lo || d.getTime() > hi) return { error: QUOTE_OPS_MESSAGES.dateRange };
  return { value: d.toISOString() };
}

// "overdue" | "today" | "later" | null (no date, or the request is finished)
export function followUpState(q, now = Date.now()) {
  if (!q?.follow_up_at || FOLLOW_UP_DONE_STATUSES.includes(q.status)) return null;
  const day = String(q.follow_up_at).slice(0, 10), today = teamDay(now);
  return day < today ? "overdue" : day === today ? "today" : "later";
}

// ── the customer file: what else this person asked ───────────────────────────────────────────────────────────────────────
// Same phone number (digits only, at least 7) → the earlier and later requests, newest first, at most 10. Nothing is stored for this:
// the requests ARE the file.
export const phoneKey = (phone) => { const d = String(phone ?? "").replace(/\D/g, ""); return d.length >= 7 ? d.slice(-9) : null; };
export function customerHistory(quotes, q, limit = 10) {
  const key = phoneKey(q?.phone);
  if (!key) return [];
  return (quotes || [])
    .filter((x) => x.id !== q.id && phoneKey(x.phone) === key)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, limit)
    .map((x) => ({ id: x.id, created_at: x.created_at, status: x.status, product_name: x.product_name || "", tracking_code: x.tracking_code || "" }));
}

// ── "send the Telegram notice again" ────────────────────────────────────────────────────────────────────────────────────────
export const RETRY_WAIT_SECONDS = 30;
export function retryState(q, now = Date.now()) {
  if (!q || q.notify_status !== "failed") return { allowed: false, reason: "not_failed" };
  const last = Date.parse(q.notify_last_attempt_at);
  if (Number.isFinite(last) && now - last < RETRY_WAIT_SECONDS * 1000) return { allowed: false, reason: "wait", seconds: Math.ceil((RETRY_WAIT_SECONDS * 1000 - (now - last)) / 1000) };
  return { allowed: true };
}
