// lib/notify/reminders.js — the reminder run: for each house, count the requests nobody has
// answered for OVERDUE_HOURS and the requests whose Telegram notice never arrived, and say so
// in that house's private Telegram group. Counts and the panel link only; no customer data.
//
// Called by app/api/internal/quote-reminders/route.js (a host cron hits it every few hours).
// Plain module with relative imports so node --test can load it. Never throws.

import { telegramConfig, sendTelegramText, formatReminderNotice } from "./telegram.js";
import { summarizeQuotes, followUpState, OVERDUE_HOURS } from "../operator/quoteOps.js";

export const HOUSES = [
  { kind: "health", table: "quote_requests" },
  { kind: "beauty", table: "beauty_quote_requests" },
];

const LOOKBACK_DAYS = 30;   // older requests are history, not reminders
const MAX_ROWS = 2000;
const missingColumn = (e) => e && (e.code === "42703" || e.code === "PGRST204" || /column .* does not exist/i.test(String(e.message || "")));

// Follow-ups due today or overdue. They are promises made about requests of ANY age, so this is its own query (not limited to the last
// 30 days): rows that have a follow-up date up to tomorrow, counted with the same rule as the panel (finished requests never count).
// Without migration 37 there are no follow-ups to count — that is not a failure. → { due } | { error: code }
async function countFollowUpsDue(db, table, now) {
  const { data, error } = await db.from(table).select("status, follow_up_at").not("follow_up_at", "is", null).lte("follow_up_at", new Date(now + 36 * 3_600_000).toISOString()).limit(MAX_ROWS);
  if (error) return missingColumn(error) ? { due: 0 } : { error: String(error.code || "").slice(0, 12) || "failed" };
  let due = 0;
  for (const q of data || []) { const f = followUpState(q, now); if (f === "overdue" || f === "today") due++; }
  return { due };
}

export async function runQuoteReminders({
  db,
  env = process.env,
  fetchImpl = globalThis.fetch,
  now = Date.now(),
  overdueHours = OVERDUE_HOURS,
} = {}) {
  const siteUrl = env.NEXT_PUBLIC_SITE_URL || "https://medoriaco.com";
  const houses = [];
  let ok = true;

  for (const { kind, table } of HOUSES) {
    if (!telegramConfig(kind, env)) { houses.push({ kind, skipped: "not_configured" }); continue; }

    const since = new Date(now - LOOKBACK_DAYS * 86_400_000).toISOString();
    const { data, error } = await db
      .from(table)
      .select("status, created_at, first_response_at, notify_status")
      .gte("created_at", since)
      .limit(MAX_ROWS);
    if (error) {
      // Most likely migration 32 is not applied yet (no first_response_at / notify_status).
      houses.push({ kind, error: "query_failed", code: String(error.code || "").slice(0, 12) });
      ok = false;
      continue;
    }

    const summary = { ...summarizeQuotes(data || [], { now, hours: overdueHours }), followUpsDue: 0 };
    const fu = await countFollowUpsDue(db, table, now);
    if (fu.error) ok = false; else summary.followUpsDue = fu.due;
    const extra = fu.error ? { followUpError: fu.error } : {};
    if (summary.overdue === 0 && summary.notifyFailures === 0 && summary.followUpsDue === 0) { houses.push({ kind, sent: false, ...summary, ...extra, nothingToReport: !fu.error }); continue; }

    const text = formatReminderNotice({ kind, summary, siteUrl, overdueHours });
    const res = await sendTelegramText(kind, text, { env, fetchImpl });
    if (!res.sent) ok = false;
    houses.push({ kind, sent: Boolean(res.sent), ...(res.sent ? {} : { reason: res.reason }), ...summary, ...extra });
  }
  return { ok, houses };
}
