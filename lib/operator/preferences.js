// lib/operator/preferences.js — the pure part of personal panel preferences (N10): the start page and up to six pinned shortcuts of ONE person in ONE
// house. An address is only ever one the person may open in that house right now (navAccess.js); anything else is refused when saving and dropped when
// reading, so a right that was taken away never leaves a dead shortcut or a start page that sends the person to a "no access" screen.
import { tr } from "../panel/i18n.js";
import { openableTargets, SHORTCUT_LIMIT } from "./navAccess.js";
import { PAGE_SIZES, DEFAULT_PAGE_SIZE } from "./listQuery.js";
import { cleanDash, DEFAULT_DASH } from "./dashboardBlocks.js";

export const PREF_MESSAGES = {
  needsAccount: tr("تنظیمات شخصی به حساب شخصی وابسته است؛ با ورود قدیمی (مشترک) ذخیره نمی‌شود."),
  badStart: tr("صفحهٔ شروع انتخاب‌شده را نمی‌توانید باز کنید."),
  badShortcut: tr("یکی از میانبرها را نمی‌توانید باز کنید یا وجود ندارد."),
  tooMany: tr("حداکثر ۶ میانبر مجاز است."),
  badSize: tr("تعداد ردیف در هر صفحه نامعتبر است."),
  badDash: tr("بخش انتخاب‌شدهٔ داشبورد نامعتبر است؛ دست‌کم یک بخش را نگه دارید."),
  needsMigration: tr("تنظیمات شخصی هنوز فعال نشده است (مهاجرت پایگاه داده اجرا نشده)."),
  generic: tr("ذخیرهٔ تنظیمات انجام نشد. دوباره تلاش کنید."),
};

const asList = (v) => (Array.isArray(v) ? v : []);

// the rows-per-page of a list: one of the three sizes the lists offer; the default size is stored as "nothing chosen" (NULL)
const cleanSize = (v) => {
  if (v === null || v === undefined || v === "") return { ok: true, value: null };
  const n = typeof v === "string" && /^\d{1,3}$/.test(v.trim()) ? Number(v) : typeof v === "number" ? v : NaN;
  return PAGE_SIZES.includes(n) ? { ok: true, value: n === DEFAULT_PAGE_SIZE ? null : n } : { ok: false };
};

// raw = { startPage, shortcuts, pageSizes?: { products, quotes }, dashboard?: [blocks] } from the browser → { ok, prefs: { start_page, shortcuts, page_size_products?, page_size_quotes?, dashboard? } } | { ok: false, error }
// (the optional parts are returned only when the browser sent them, so saving the shortcuts alone never changes the rest)
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
  const prefs = { start_page: start, shortcuts: seen };
  if (input.pageSizes !== undefined) {
    const ps = input.pageSizes && typeof input.pageSizes === "object" ? input.pageSizes : {};
    const a = cleanSize(ps.products), b = cleanSize(ps.quotes);
    if (!a.ok || !b.ok) return { ok: false, error: PREF_MESSAGES.badSize };
    prefs.page_size_products = a.value; prefs.page_size_quotes = b.value;
  }
  if (input.dashboard !== undefined) {
    if (input.dashboard === null) prefs.dashboard = null;
    else {
      const given = Array.isArray(input.dashboard) ? input.dashboard : null;
      const clean = cleanDash(given);
      if (!given || !clean || clean.length !== new Set(given).size) return { ok: false, error: PREF_MESSAGES.badDash };
      prefs.dashboard = clean.join("|") === DEFAULT_DASH.join("|") ? null : clean;          // the default order is stored as "nothing chosen"
    }
  }
  return { ok: true, prefs };
}

// a stored row → what to use now: only addresses the person can still open
export function effectivePreferences(session, panel, row) {
  const open = new Set(openableTargets(session, panel).map((x) => x.href));
  const start = row?.start_page && open.has(row.start_page) ? row.start_page : null;
  const shortcuts = asList(row?.shortcuts).filter((a) => open.has(a)).slice(0, SHORTCUT_LIMIT);
  const size = (v) => (PAGE_SIZES.includes(Number(v)) && Number(v) !== DEFAULT_PAGE_SIZE ? Number(v) : null);
  return { startPage: start, shortcuts, pageSizes: { products: size(row?.page_size_products), quotes: size(row?.page_size_quotes) }, dashboard: cleanDash(row?.dashboard) };
}
