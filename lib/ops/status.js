// lib/ops/status.js — the pure part of the "System status" screen (N13): which reports the server's scripts may send, how a stored report becomes a state,
// and the one rule that matters: THE PANEL NEVER SHOWS GREEN FOR SOMETHING IT HAS NOT HEARD.
//   no report = unknown · a failure = fail · a success older than the time it is expected again = overdue · only a FRESH success is ok.
// "ok" means "the script reported success recently" — not that the backup can be restored (that is what the restore drill reports) and not that an alert
// reached anybody (nothing in the app can see that; see alertProof()).
import { tr } from "../panel/i18n.js";

const H = 3_600_000;
// kind → how long a success stays fresh, and what the person reads
export const OPS_KINDS = {
  backup:        { fresh: 36 * H,        label: tr("پشتیبان‌گیری شبانه"),                  how: tr("اسکریپت پشتیبان‌گیری روی سرور، پس از هر اجرا گزارش می‌دهد.") },
  backup_check:  { fresh: 36 * H,        label: tr("تازگی پشتیبان‌ها (محلی و R2)"),          how: tr("بررسی روزانهٔ سن تازه‌ترین نسخهٔ محلی و رمزنگاری‌شدهٔ R2.") },
  restore_drill: { fresh: 35 * 24 * H,   label: tr("آزمون بازیابی (روی پایگاه داده‌ی موقت)"), how: tr("اسکریپت آزمون بازیابی، ماهی یک‌بار؛ نسخه را در پایگاه داده‌ی موقت برمی‌گرداند و شمارش جدول‌ها را می‌سنجد.") },
  heartbeat:     { fresh: 15 * 60_000,   label: tr("ضربان سرور و سایت"),                     how: tr("هر چند دقیقه: سایت پاسخ می‌دهد، کانتینر ناسالم نیست، دیسک پر نیست.") },
};
export const MONITORED = Object.keys(OPS_KINDS);
// what a script may send (an alert confirmation comes from a person, never from a script)
export const REPORTABLE = [...MONITORED, "alert_test"];

export const OPS_MESSAGES = {
  badKind: tr("نوع گزارش معتبر نیست."),
  badStatus: tr("وضعیت گزارش معتبر نیست."),
  unavailable: tr("وضعیت سیستم در دسترس نیست (مهاجرت ۵۲ اجرا نشده یا پایگاه داده پاسخ نمی‌دهد)."),
  denied: tr("فقط مدیر اصلی می‌تواند دریافت هشدار را تأیید کند."),
  noTest: tr("هنوز هشداری آزمایشی فرستاده نشده؛ ابتدا آزمون هشدار را روی سرور اجرا کنید."),
  note: tr("یادداشت را کوتاه بنویسید (تا ۱۲۰ نویسه)."),
  generic: tr("ذخیره نشد. دوباره تلاش کنید."),
};

// A free text coming from a script or a person: one line, bounded, and with anything URL-shaped removed (a ping URL is a key, it must never be stored).
export function cleanDetail(v, max = 200) {
  if (v == null) return null;
  const s = String(v).replace(/[\u0000-\u001F\u007F\u2028\u2029]/g, " ").replace(/https?:\/\/\S+/gi, "[url]").replace(/\s+/g, " ").trim().slice(0, max);
  return s || null;
}

// body of a script's report → { ok, kind, status, detail } | { ok: false, error }
export function cleanReport(body) {
  const b = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  if (!REPORTABLE.includes(b.kind)) return { ok: false, error: OPS_MESSAGES.badKind };
  const allowed = b.kind === "alert_test" ? ["sent"] : ["pass", "fail"];
  if (!allowed.includes(b.status)) return { ok: false, error: OPS_MESSAGES.badStatus };
  return { ok: true, kind: b.kind, status: b.status, detail: cleanDetail(b.detail) };
}

// A stored row → what the screen shows. state: "ok" | "fail" | "overdue" | "unknown".
export function opsState(kind, row, now = Date.now()) {
  const spec = OPS_KINDS[kind];
  if (!spec || !row || !row.reported_at) return { state: "unknown", reportedAt: null, lastPassAt: null, detail: null };
  const at = Date.parse(row.reported_at);
  if (!Number.isFinite(at)) return { state: "unknown", reportedAt: null, lastPassAt: null, detail: null };
  const base = { reportedAt: row.reported_at, lastPassAt: row.last_pass_at || null, detail: row.detail || null };
  if (row.status === "fail") return { ...base, state: "fail" };
  if (row.status !== "pass") return { ...base, state: "unknown" };
  return { ...base, state: now - at <= spec.fresh ? "ok" : "overdue" };
}

// Was the alert path ever proven to a PERSON? Only their own statement after the last deliberate test counts — and it stays a statement.
//   never_tested → no test signal was ever sent · awaiting → a test was sent, nobody said they received it · confirmed → somebody said so after the last test
export function alertProof(testRow, confirmRow) {
  if (!testRow?.reported_at) return { state: "never_tested", testedAt: null, confirmedAt: null, by: null, note: null };
  const t = Date.parse(testRow.reported_at);
  const c = confirmRow?.reported_at ? Date.parse(confirmRow.reported_at) : NaN;
  if (Number.isFinite(c) && c >= t) return { state: "confirmed", testedAt: testRow.reported_at, confirmedAt: confirmRow.reported_at, by: confirmRow.reported_by || null, note: confirmRow.detail || null };
  return { state: "awaiting", testedAt: testRow.reported_at, confirmedAt: null, by: null, note: null };
}

// The whole picture: one state per monitored thing, the alert proof, and a headline that can only be as good as its worst part.
//   headline: "problem" (something failed) · "attention" (something unknown or overdue) · "reported_ok" (every script reported success recently)
export function opsOverview(rows, now = Date.now()) {
  const by = Object.fromEntries((rows || []).map((r) => [r.kind, r]));
  const items = MONITORED.map((kind) => ({ kind, ...opsState(kind, by[kind], now) }));
  const headline = items.some((i) => i.state === "fail") ? "problem" : items.some((i) => i.state !== "ok") ? "attention" : "reported_ok";
  return { items, headline, alert: alertProof(by.alert_test, by.alert_confirmed) };
}
