// lib/operator/savedViews.js — the pure part of saved list views (N9): what a view may hold, its name, and the messages. A view is a named set of the filters
// the product or request list keeps in its address; it never holds a page number. Whatever is stored goes through the SAME parser as the page
// (parseProductParams / parseQuoteParams), so a hand-made value can only ever become a filter the page itself would accept.
import { tr } from "../panel/i18n.js";
import { parseProductParams, parseQuoteParams, productHref, quoteHref } from "./listQuery.js";

export const VIEW_LISTS = ["products", "quotes"];
export const VIEW_LIMITS = { name: 40, perList: 20 };

export const VIEW_MESSAGES = {
  needsAccount: tr("نمای ذخیره‌شده به حساب شخصی وابسته است؛ با ورود قدیمی (مشترک) ذخیره نمی‌شود."),
  badName: tr("برای نما یک نام کوتاه (تا ۴۰ نویسه) بنویسید."),
  emptyFilters: tr("فیلتر یا جست‌وجویی انتخاب نشده است؛ نمایی که چیزی را فیلتر نکند ذخیره نمی‌شود."),
  nameTaken: tr("شما نمایی با این نام دارید؛ نام دیگری بنویسید."),
  tooMany: tr("حداکثر ۲۰ نما برای هر فهرست مجاز است؛ یکی را پاک کنید."),
  needsMigration: tr("ذخیرهٔ نما هنوز فعال نشده است (مهاجرت پایگاه داده اجرا نشده)."),
  notFound: tr("این نما پیدا نشد (شاید پیش‌تر پاک شده است)."),
  generic: tr("ذخیرهٔ نما انجام نشد. دوباره تلاش کنید."),
};

export const isViewList = (v) => VIEW_LISTS.includes(v);

export function cleanViewName(raw) {
  const s = typeof raw === "string" ? raw.replace(/[\u0000-\u001F\u007F\u2028\u2029]/g, " ").replace(/\s+/g, " ").trim() : "";
  return s && [...s].length <= VIEW_LIMITS.name ? s : null;
}

// raw = a params object (an address or a stored view) → the filters only, as { key: "value" } with defaults and the page left out
export function cleanViewParams(list, raw) {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const parsed = list === "quotes" ? parseQuoteParams(src) : parseProductParams(src);
  parsed.page = 1;
  const href = (list === "quotes" ? quoteHref : productHref)("/x", parsed, {}, false);
  return Object.fromEntries(new URL(href, "http://x").searchParams.entries());
}

// where a stored view leads (the base is the list's own address)
export function viewHref(list, base, params) {
  return (list === "quotes" ? quoteHref : productHref)(base, { ...(list === "quotes" ? parseQuoteParams(params) : parseProductParams(params)), page: 1 }, {}, false);
}
