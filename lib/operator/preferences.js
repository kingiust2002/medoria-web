// lib/operator/preferences.js — the pure part of personal panel preferences (N10): the start page and up to six pinned shortcuts of ONE person in ONE
// house. An address is only ever one the person may open in that house right now (navAccess.js); anything else is refused when saving and dropped when
// reading, so a right that was taken away never leaves a dead shortcut or a start page that sends the person to a "no access" screen.
import { tr } from "../panel/i18n.js";
import { openableTargets, SHORTCUT_LIMIT } from "./navAccess.js";

export const PREF_MESSAGES = {
  needsAccount: tr("تنظیمات شخصی به حساب شخصی وابسته است؛ با ورود قدیمی (مشترک) ذخیره نمی‌شود."),
  badStart: tr("صفحهٔ شروع انتخاب‌شده را نمی‌توانید باز کنید."),
  badShortcut: tr("یکی از میانبرها را نمی‌توانید باز کنید یا وجود ندارد."),
  tooMany: tr("حداکثر ۶ میانبر مجاز است."),
  needsMigration: tr("تنظیمات شخصی هنوز فعال نشده است (مهاجرت پایگاه داده اجرا نشده)."),
  generic: tr("ذخیرهٔ تنظیمات انجام نشد. دوباره تلاش کنید."),
};

const asList = (v) => (Array.isArray(v) ? v : []);

// raw = { startPage, shortcuts } from the browser → { ok, prefs: { start_page, shortcuts } } | { ok: false, error }
export function cleanPreferences(session, panel, raw) {
  const open = new Set(openableTargets(session, panel).map((x) => x.href));
  const root = openableTargets(session, panel)[0].href;                      // the dashboard
  const input = raw && typeof raw === "object" ? raw : {};
  let start = null;
  if (input.startPage !== undefined && input.startPage !== null && input.startPage !== "" && input.startPage !== root) {
    if (typeof input.startPage !== "string" || !open.has(input.startPage)) return { ok: false, error: PREF_MESSAGES.badStart };
    start = input.startPage;
  }
  const list = asList(input.shortcuts);
  if (list.length > SHORTCUT_LIMIT) return { ok: false, error: PREF_MESSAGES.tooMany };
  const seen = [];
  for (const a of list) {
    if (typeof a !== "string" || !open.has(a)) return { ok: false, error: PREF_MESSAGES.badShortcut };
    if (!seen.includes(a)) seen.push(a);
  }
  return { ok: true, prefs: { start_page: start, shortcuts: seen } };
}

// a stored row → what to use now: only addresses the person can still open
export function effectivePreferences(session, panel, row) {
  const open = new Set(openableTargets(session, panel).map((x) => x.href));
  const start = row?.start_page && open.has(row.start_page) ? row.start_page : null;
  const shortcuts = asList(row?.shortcuts).filter((a) => open.has(a)).slice(0, SHORTCUT_LIMIT);
  return { startPage: start, shortcuts };
}
