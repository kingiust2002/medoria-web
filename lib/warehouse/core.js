// lib/warehouse/core.js — the pure part of the internal warehouse: table / function names, input cleaning, and the translation of the
// database's refusals ('stock:<code>', raised by migration 36) into messages. No I/O, no Next imports: unit-tested.
import { tr } from "../panel/i18n.js";

export const HOUSES = ["health", "beauty"];
export const PRODUCT_TABLE = { health: "products", beauty: "beauty_products" };

export function names(house) {
  if (!HOUSES.includes(house)) throw new Error("unknown house");
  return {
    locations: `${house}_stock_locations`, balances: `${house}_stock_balances`, movements: `${house}_stock_movements`, reservations: `${house}_stock_reservations`,
    post: `${house}_stock_post`, reverse: `${house}_stock_reverse`, reserve: `${house}_stock_reserve`, release: `${house}_stock_release`,
    products: PRODUCT_TABLE[house],
  };
}

// The refusals the database can raise, in the person's language (Persian keys; the panel translates them).
export const STOCK_MESSAGES = {
  bad_key: tr("شناسهٔ تکرارنشدنی عملیات معتبر نیست؛ صفحه را تازه کنید."),
  bad_kind: tr("نوع عملیات انبار معتبر نیست."),
  bad_product: tr("محصول معتبر نیست."),
  unknown_product: tr("این محصول وجود ندارد."),
  bad_quantity: tr("مقدار باید عددی مثبت با حداکثر ۳ رقم اعشار باشد."),
  reason_required: tr("دلیل (حداقل ۳ حرف) لازم است."),
  bad_destination: tr("انبار مقصد معتبر نیست؛ باید با انبار مبدأ فرق کند."),
  unknown_location: tr("این انبار وجود ندارد."),
  location_inactive: tr("این انبار غیرفعال است."),
  location_not_empty: tr("این انبار هنوز موجودی یا رزرو دارد؛ ابتدا خالی شود."),
  insufficient_stock: tr("موجودی قابل استفاده کافی نیست (قابل استفاده: {available})."),
  idempotency_key_reused: tr("این شناسه قبلاً برای عملیات دیگری استفاده شده است؛ صفحه را تازه کنید."),
  reservation_not_active: tr("این رزرو دیگر فعال نیست."),
  reservation_mismatch: tr("مقدار یا انبار با رزرو یکی نیست."),
  reservation_only_for_issue: tr("رزرو فقط هنگام خروج مصرف می‌شود."),
  unknown_reservation: tr("این رزرو وجود ندارد."),
  unknown_movement: tr("این حرکت وجود ندارد."),
  already_reversed: tr("این حرکت قبلاً برگشت خورده است."),
  cannot_reverse_a_reversal: tr("برگشتِ یک برگشت ممکن نیست؛ یک حرکت تازه ثبت کنید."),
  code_is_fixed: tr("کد انبار تغییر نمی‌کند."),
  ledger_is_append_only: tr("تاریخچهٔ انبار فقط افزوده می‌شود."),
  write_only_through_functions: tr("موجودی فقط از راه ثبت حرکت تغییر می‌کند."),
  never_deleted: tr("این رکورد هرگز حذف نمی‌شود."),
};
export const STOCK_GENERIC = tr("عملیات انبار انجام نشد. دوباره تلاش کنید.");
export const STOCK_UNAVAILABLE = tr("انبار در دسترس نیست (مهاجرت ۳۶ اجرا نشده یا پایگاه داده پاسخ نمی‌دهد).");

// error from supabase-js / PostgREST → { code, error, params? }
export function stockError(err) {
  const msg = String(err?.message || "");
  const m = /stock:([a-z_]+)/.exec(msg);
  if (m && STOCK_MESSAGES[m[1]]) {
    const available = /available=(-?[\d.]+)/.exec(String(err?.details || err?.hint || msg));
    return { code: m[1], error: STOCK_MESSAGES[m[1]], ...(m[1] === "insufficient_stock" ? { params: { available: available ? trimZeros(available[1]) : "0" } } : {}) };
  }
  // 23505 unique violation on the location code
  if (err?.code === "23505" && /stock_locations_code_key/.test(msg)) return { code: "code_taken", error: tr("کد این انبار قبلاً استفاده شده است.") };
  if (err?.code === "42P01" || err?.code === "PGRST205" || err?.code === "PGRST202") return { code: "unavailable", error: STOCK_UNAVAILABLE };
  return { code: "failed", error: STOCK_GENERIC };
}

export function trimZeros(v) {
  const s = String(v);
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
}

// "12", "12.5", "12,5", Persian/Arabic digits → a number with at most 3 decimals, within bounds; otherwise null.
// Persian (U+06F0..) and Arabic-Indic (U+0660..) digits, the Arabic decimal separator (U+066B) and comma (U+060C) → ASCII
const DIGIT_RE = /[\u06F0-\u06F9\u0660-\u0669\u066B\u060C]/g;
const toAscii = (c) => { const n = c.charCodeAt(0); return n === 0x066B || n === 0x060C ? "." : String(n >= 0x06F0 ? n - 0x06F0 : n - 0x0660); };
// the typed text with ASCII digits and a "." separator, or null when it is not text / a number
export function normNumber(input) {
  if (typeof input === "number") input = String(input);
  return typeof input === "string" ? input.trim().replace(DIGIT_RE, toAscii).replace(",", ".") : null;
}
export function parseQty(input, { signed = false } = {}) {
  const s = normNumber(input);
  if (s == null) return null;
  if (!(signed ? /^[+-]?\d{1,8}(\.\d{1,3})?$/ : /^\d{1,8}(\.\d{1,3})?$/).test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n === 0 || Math.abs(n) > 99999999) return null;
  return n;
}

export const idempotencyKey = (v) => (typeof v === "string" && /^[A-Za-z0-9_.:-]{8,80}$/.test(v) ? v : null);

const CODE = /^[A-Z0-9][A-Z0-9_-]{1,19}$/;
export function cleanLocation(input = {}, { creating = false } = {}) {
  const out = {};
  const problems = [];
  if (creating) {
    const code = String(input.code || "").trim().toUpperCase();
    if (!CODE.test(code)) problems.push(tr("کد انبار ۲ تا ۲۰ حرف لاتین بزرگ، عدد، «-» یا «_» باشد."));
    else out.code = code;
  }
  const name = String(input.name || "").trim();
  if (name.length < 1 || name.length > 80) problems.push(tr("نام انبار ۱ تا ۸۰ نویسه باشد."));
  else out.name = name;
  const note = input.note == null ? "" : String(input.note).trim();
  if (note.length > 300) problems.push(tr("توضیح انبار حداکثر ۳۰۰ نویسه باشد."));
  else out.note = note || null;
  if (input.sort_order != null && input.sort_order !== "") {
    const n = Number(input.sort_order);
    if (!Number.isInteger(n) || Math.abs(n) > 100000) problems.push(tr("ترتیب باید عدد صحیح باشد."));
    else out.sort_order = n;
  }
  if (input.is_active != null) out.is_active = Boolean(input.is_active);
  return problems.length ? { ok: false, error: problems[0], problems } : { ok: true, value: out };
}

const text = (v, max) => { const s = v == null ? "" : String(v).trim(); return s.length > max ? null : s; };
// one movement as typed on the screen → the arguments of <house>_stock_post
export function cleanMovement(input = {}) {
  const kind = input.kind;
  if (!["receive", "issue", "transfer", "adjust"].includes(kind)) return { ok: false, error: STOCK_MESSAGES.bad_kind };
  const key = idempotencyKey(input.key);
  if (!key) return { ok: false, error: STOCK_MESSAGES.bad_key };
  // the product is named by its id (a row's button) or typed as its SKU (resolved by the action after the permission check)
  const sku = typeof input.sku === "string" ? input.sku.trim() : "";
  const hasId = input.productId != null && input.productId !== "";
  const product = hasId ? Number(input.productId) : null, location = Number(input.locationId);
  if (hasId ? !Number.isInteger(product) || product <= 0 : !sku || sku.length > 80) return { ok: false, error: STOCK_MESSAGES.bad_product };
  if (!Number.isInteger(location) || location <= 0) return { ok: false, error: STOCK_MESSAGES.unknown_location };
  const qty = parseQty(input.qty, { signed: kind === "adjust" });
  if (qty == null) return { ok: false, error: STOCK_MESSAGES.bad_quantity };
  let to = null;
  if (kind === "transfer") {
    to = Number(input.toLocationId);
    if (!Number.isInteger(to) || to <= 0 || to === location) return { ok: false, error: STOCK_MESSAGES.bad_destination };
  }
  const reason = text(input.reason, 300), reference = text(input.reference, 80);
  if (reason == null) return { ok: false, error: tr("دلیل حداکثر ۳۰۰ نویسه باشد.") };
  if (reference == null) return { ok: false, error: tr("شمارهٔ سند حداکثر ۸۰ نویسه باشد.") };
  if (kind === "adjust" && reason.length < 3) return { ok: false, error: STOCK_MESSAGES.reason_required };
  let reservation = null;
  if (input.reservationId != null && input.reservationId !== "") {
    reservation = Number(input.reservationId);
    if (kind !== "issue" || !Number.isInteger(reservation) || reservation <= 0) return { ok: false, error: STOCK_MESSAGES.reservation_only_for_issue };
  }
  return { ok: true, value: { key, kind, productId: product, sku: hasId ? null : sku, locationId: location, toLocationId: to, qty, reason: reason || null, reference: reference || null, reservationId: reservation } };
}

// which permission-catalogue operation each movement kind needs
export const OPERATION_OF_KIND = { receive: "inventory.receive", issue: "inventory.issue", transfer: "inventory.transfer", adjust: "inventory.adjust" };
