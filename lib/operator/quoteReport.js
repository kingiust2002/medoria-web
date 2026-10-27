// lib/operator/quoteReport.js — the numbers and the CSV of the customer requests of one house. Plain module (no Next imports):
// unit-tested. The summary reads no customer text (status, dates, assignee label, notice result); the CSV holds customer data and
// is therefore behind its own permission (quotes.export).
import { toCsv } from "./csv.js";
import { isOverdue, followUpState, summarizeQuotes } from "./quoteOps.js";
import { tr } from "../panel/i18n.js";

export const REPORT_PERIODS = [7, 30, 90];
export const REPORT_COLUMNS = "status,created_at,first_response_at,assigned_to,follow_up_at,notify_status";
export const REPORT_MAX_ROWS = 5000;

export const cleanDays = (v) => (REPORT_PERIODS.includes(Number(v)) ? Number(v) : 30);

// rows: { status, created_at, first_response_at, assigned_to, follow_up_at, notify_status } created inside the period
export function summarizeReport(rows, { now = Date.now(), days = 30 } = {}) {
  const since = now - days * 86_400_000;
  const inPeriod = (rows || []).filter((r) => Date.parse(r.created_at) >= since);
  const byStatus = {}, byAssignee = {};
  let answered = 0, answerHours = 0;
  for (const r of inPeriod) {
    byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    const who = r.assigned_to || "";
    byAssignee[who] = (byAssignee[who] || 0) + 1;
    const created = Date.parse(r.created_at), first = Date.parse(r.first_response_at);
    if (Number.isFinite(created) && Number.isFinite(first) && first >= created) { answered++; answerHours += (first - created) / 3_600_000; }
  }
  const live = summarizeQuotes(inPeriod, { now });
  return {
    days, total: inPeriod.length, byStatus,
    byAssignee: Object.entries(byAssignee).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    answered, avgFirstResponseHours: answered ? Math.round((answerHours / answered) * 10) / 10 : null,
    unanswered: live.waiting, overdue: inPeriod.filter((r) => isOverdue(r, { now })).length, notifyFailures: live.notifyFailures,
    followUpsOverdue: inPeriod.filter((r) => followUpState(r, now) === "overdue").length,
    followUpsToday: inPeriod.filter((r) => followUpState(r, now) === "today").length,
  };
}

// The export: one line per request, every cell safe against spreadsheet formulas (toCsv). Columns are the technical record plus the
// customer's contact data, because that is what an export is for.
export const CSV_HEAD = ["tracking_code", "created_at", "status", "name", "organization", "phone", "preferred_contact", "language", "product_sku", "product_name", "quantity", "assigned_to", "first_response_at", "follow_up_at", "notify_status"];
export function quotesCsv(rows) {
  return toCsv(CSV_HEAD, (rows || []).map((r) => CSV_HEAD.map((h) => r[h] ?? "")));
}

export const REPORT_MESSAGES = {
  unavailable: tr("گزارش در دسترس نیست."),
};
