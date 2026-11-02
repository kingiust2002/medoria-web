// lib/operator/listColumns.js — the pure part of "my columns" (the fields a person chose for the product list and the request list, and their order).
// The catalogue below is the ONLY source of valid keys: whatever is stored (or sent by a hand-made request) is cleaned against it, so a stored value
// can never name a field the screen does not define. A field is a piece of information shown on every row; the picture, the name and the row's
// action buttons are always there. Plain module: unit-tested.
import { tr } from "../panel/i18n.js";

export const COLUMN_LISTS = ["products", "quotes"];
export const COLUMN_LIMIT = 12;

// [key, Persian label]: the Persian text is the translation key (docs/PANEL_LANGUAGES.md)
export const COLUMN_CATALOG = {
  products: [
    ["sku", tr("کد کالا")], ["category", tr("دسته")], ["price", tr("قیمت")], ["stock", tr("موجودی")], ["featured", tr("ویژه")],
    ["status", tr("وضعیت")], ["gaps", tr("نواقص")], ["schedule", tr("زمان‌بندی")], ["updated", tr("آخرین تغییر")],
  ],
  quotes: [
    ["organization", tr("سازمان")], ["product", tr("محصول")], ["date", tr("تاریخ")], ["flags", tr("نشانه‌ها")],
    ["status", tr("وضعیت")], ["phone", tr("تلفن")], ["tracking", tr("کد پیگیری")], ["quantity", tr("تعداد")],
  ],
};
// what a person who never chose anything sees = exactly what the screens showed before this feature existed
export const DEFAULT_COLUMNS = {
  products: ["sku", "category", "price", "stock", "featured", "gaps", "status", "schedule"],
  quotes: ["organization", "product", "date", "flags", "status"],
};

export const COLUMN_MESSAGES = {
  needsAccount: tr("ستون‌های دلخواه به حساب شخصی وابسته است؛ با ورود قدیمی (مشترک) ذخیره نمی‌شود."),
  needsMigration: tr("ذخیرهٔ ستون‌ها هنوز فعال نشده است (مهاجرت پایگاه داده اجرا نشده)."),
  none: tr("دست‌کم یک ستون را نگه دارید."),
  generic: tr("ذخیرهٔ ستون‌ها انجام نشد. دوباره تلاش کنید."),
  denied: tr("اجازهٔ دیدن این فهرست را ندارید."),
};

export const isColumnList = (v) => COLUMN_LISTS.includes(v);
export const columnKeys = (list) => (COLUMN_CATALOG[list] || []).map(([k]) => k);

// anything → the chosen keys in the chosen order: only keys of the catalogue, no repeats, at most COLUMN_LIMIT; null when nothing valid is left
export function cleanColumns(list, raw) {
  if (!isColumnList(list) || !Array.isArray(raw)) return null;
  const valid = new Set(columnKeys(list));
  const out = [];
  for (const k of raw) if (typeof k === "string" && valid.has(k) && !out.includes(k)) out.push(k);
  return out.length ? out.slice(0, COLUMN_LIMIT) : null;
}

// the columns a screen uses: the person's saved choice if there is a valid one, else the defaults
export const effectiveColumns = (list, saved) => cleanColumns(list, saved) || DEFAULT_COLUMNS[list] || [];
