// lib/operator/quoteFollowUpCore.js — follow-up date, "send the Telegram notice again" and the CSV export of customer requests, for
// BOTH houses. Plain module: the action files own the session and permission check and pass ctx = { admin, table, kind, audit }.
import { parseQuoteId } from "./quoteDelete.js";
import { parseFollowUp, QUOTE_OPS_MESSAGES, retryState, RETRY_WAIT_SECONDS } from "./quoteOps.js";
import { quotesCsv, cleanDays } from "./quoteReport.js";
import { readAll } from "./listQuery.js";
import { notifyOutcome } from "../notify/record.js";
import { notifyNewQuote } from "../notify/telegram.js";
import { tr } from "../panel/i18n.js";

const MSG = {
  notFailed: tr("اعلان تلگرام این درخواست خطا نداشته است."),
  wait: tr("چند ثانیه صبر کنید و دوباره تلاش کنید."),
  sent: tr("اعلان تلگرام دوباره ارسال شد."),
  stillFailed: tr("ارسال دوباره هم موفق نبود؛ تنظیمات تلگرام را بررسی کنید."),
  notConfigured: tr("تلگرام برای این خانه تنظیم نشده است."),
  exportFailed: tr("خروجی ساخته نشد. دوباره تلاش کنید."),
  nothing: tr("درخواستی در این بازه نیست."),
};
export const FOLLOW_UP_MESSAGES = MSG;

const missingColumn = (e) => e && (e.code === "42703" || e.code === "PGRST204" || /column .* does not exist/i.test(String(e.message || "")));
const log = async (ctx, entry) => { try { await ctx.audit(entry); } catch { /* best effort */ } };

export async function setFollowUp(ctx, id, dateInput, now = Date.now()) {
  const qid = parseQuoteId(id);
  if (qid === null) return { ok: false, error: QUOTE_OPS_MESSAGES.badId };
  const p = parseFollowUp(dateInput, now);
  if (p.error) return { ok: false, error: p.error };
  const { data, error } = await ctx.admin.from(ctx.table).update({ follow_up_at: p.value }).eq("id", qid).select("id");
  if (error) return { ok: false, error: missingColumn(error) ? QUOTE_OPS_MESSAGES.needsMigration37 : QUOTE_OPS_MESSAGES.failed };
  if (!data?.length) return { ok: false, notFound: true, error: QUOTE_OPS_MESSAGES.notFound };
  await log(ctx, { action: "quote.follow_up", entity: ctx.table, ids: [qid], detail: { assigned: p.value !== null } });
  return { ok: true, followUpAt: p.value };
}

// Sends the new-request notice again for a request whose first notice failed. At most once per RETRY_WAIT_SECONDS per request.
export async function retryNotice(ctx, id, { now = Date.now(), send = notifyNewQuote } = {}) {
  const qid = parseQuoteId(id);
  if (qid === null) return { ok: false, error: QUOTE_OPS_MESSAGES.badId };
  const { data: row, error } = await ctx.admin.from(ctx.table).select("*").eq("id", qid).maybeSingle();
  if (error) return { ok: false, error: QUOTE_OPS_MESSAGES.failed };
  if (!row) return { ok: false, notFound: true, error: QUOTE_OPS_MESSAGES.notFound };
  const st = retryState(row, now);
  if (!st.allowed) return { ok: false, error: st.reason === "wait" ? MSG.wait : MSG.notFailed, wait: st.seconds };
  const notice = await send({ kind: ctx.kind, id: qid, row });
  if (notice?.reason === "not_configured") return { ok: false, error: MSG.notConfigured };
  const { status, detail } = notifyOutcome(notice);
  const upd = await ctx.admin.from(ctx.table)
    .update({ notify_status: status, notify_detail: detail, notify_attempts: (Number(row.notify_attempts) || 0) + 1, notify_last_attempt_at: new Date(now).toISOString() })
    .eq("id", qid).select("id");
  if (upd.error && missingColumn(upd.error)) await ctx.admin.from(ctx.table).update({ notify_status: status, notify_detail: detail }).eq("id", qid);
  await log(ctx, { action: "quote.notice_retry", entity: ctx.table, ids: [qid], result: status === "sent" ? "success" : "failure", detail: { reason: detail || "sent" } });
  return status === "sent" ? { ok: true, message: MSG.sent } : { ok: false, error: MSG.stillFailed };
}

// CSV of EVERY request created in the last `days` days (newest first; read in chunks, never cut off)
export async function exportQuotes(ctx, { days = 30, now = Date.now() } = {}) {
  const d = cleanDays(days);
  const since = new Date(now - d * 86_400_000).toISOString();
  const got = await readAll((from, to) => ctx.admin.from(ctx.table).select("*").gte("created_at", since).order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, to));
  if (!got.ok) return { ok: false, error: MSG.exportFailed };
  const data = got.rows;
  if (!data?.length) return { ok: false, error: MSG.nothing };
  await log(ctx, { action: "quotes.exported", entity: ctx.table, count: data.length, detail: { rows: data.length } });
  return { ok: true, csv: quotesCsv(data), count: data.length, filename: `requests-${ctx.kind}-${d}d-${new Date(now).toISOString().slice(0, 10)}.csv` };
}

export { RETRY_WAIT_SECONDS };

// The active person of THIS house whose display name is exactly the typed label (any case) → their id, else null.
export function userResolver(panel) {
  return async (admin, label) => {
    const { data, error } = await admin.from("operator_users").select("id,display_name,houses,status");
    if (error) return null;
    const want = String(label).trim().toLowerCase();
    const hit = (data || []).filter((u) => u.status === "active" && (u.houses || []).includes(panel) && String(u.display_name).trim().toLowerCase() === want);
    return hit.length === 1 ? hit[0].id : null;
  };
}

// The names a request can be handed to: the active people of this house (the typed labels already in use are added by the screen).
export async function houseAssignees(admin, panel) {
  if (!admin) return [];
  const { data, error } = await admin.from("operator_users").select("display_name,houses,status").order("display_name", { ascending: true });
  if (error) return [];
  return (data || []).filter((u) => u.status === "active" && (u.houses || []).includes(panel)).map((u) => u.display_name);
}
