// lib/warehouse/countsCore.js — the pure part of stock counts and minimum levels (migration 41): input cleaning, the arithmetic of a count,
// the idempotency key of each posted difference, the messages and the two CSV reports. No I/O, no Next imports: unit-tested.
import { normNumber, parseQty, trimZeros } from "./core.js";
import { toCsv } from "../operator/csv.js";
import { tr } from "../panel/i18n.js";

export const COUNT_MESSAGES = {
  bad_count: tr("این شمارش وجود ندارد."),
  count_closed: tr("این شمارش بسته یا لغو شده است و تغییر نمی‌کند."),
  count_open_exists: tr("برای این انبار یک شمارش باز وجود دارد؛ ابتدا آن را ببندید یا لغو کنید."),
  location_inactive: tr("این انبار غیرفعال است."),
  bad_counted: tr("مقدار شمارش‌شده باید عددی ۰ یا بیشتر با حداکثر ۳ رقم اعشار باشد."),
  too_many: tr("در هر ذخیره حداکثر ۵۰۰ ردیف مجاز است."),
  bad_level: tr("حداقل موجودی باید عددی ۰ یا بیشتر با حداکثر ۳ رقم اعشار باشد (خالی = حذف)."),
  nothing_counted: tr("هنوز هیچ ردیفی شمارش نشده است."),
  some_failed: tr("بستن شمارش انجام نشد: هیچ اختلافی ثبت نشد و شمارش باز ماند. مشکل را برطرف کنید و دوباره ببندید."),
  stale: tr("شمارش از زمان ارسال برای تأیید تغییر کرده است؛ دوباره ارسال کنید."),
  unavailable: tr("شمارش انبار در دسترس نیست (مهاجرت ۴۱ اجرا نشده یا پایگاه داده پاسخ نمی‌دهد)."),
  generic: tr("عملیات شمارش انجام نشد. دوباره تلاش کنید."),
};

export const MAX_ENTRIES = 500;
const round3 = (n) => Math.round(n * 1000) / 1000;

// One difference posted by closing a count has a key of its own, so closing twice (a double click, a retry after a half failure,
// an approval executed twice) posts each difference once. The product is part of the key; the count id keeps keys of different counts apart.
export const countKey = (countId, productId) => `count-${Number(countId)}-${Number(productId)}`;

// what the count says minus what the system expected when the count started; null = not counted (the line is left alone)
export function countDelta(expected, counted) {
  if (counted == null || counted === "") return null;
  return round3(Number(counted) - Number(expected));
}

// a number ≥ 0 (0 is allowed here: counting an empty shelf is a count) or null for empty
export function parseCounted(input) {
  const s = normNumber(input);
  if (s == null || s === "") return input == null || input === "" || (typeof input === "string" && !input.trim()) ? { ok: true, value: null } : { ok: false, error: COUNT_MESSAGES.bad_counted };
  if (/^0+(\.0{1,3})?$/.test(s)) return { ok: true, value: 0 };
  const n = parseQty(s);
  return n == null ? { ok: false, error: COUNT_MESSAGES.bad_counted } : { ok: true, value: n };
}

// [{ productId, counted }] as typed on the count screen → rows ready to store; the first bad row refuses the whole save
export function cleanCountedEntries(entries) {
  if (!Array.isArray(entries) || !entries.length) return { ok: false, error: COUNT_MESSAGES.nothing_counted };
  if (entries.length > MAX_ENTRIES) return { ok: false, error: COUNT_MESSAGES.too_many };
  const seen = new Set(), out = [];
  for (const e of entries) {
    const productId = Number(e?.productId);
    if (!Number.isInteger(productId) || productId <= 0) return { ok: false, error: COUNT_MESSAGES.bad_count };
    if (seen.has(productId)) continue;
    seen.add(productId);
    const c = parseCounted(e?.counted);
    if (!c.ok) return c;
    out.push({ productId, counted: c.value });
  }
  return { ok: true, entries: out };
}

// the minimum quantity of one product: "" / null → remove the level
export function cleanLevel(input = {}) {
  const hasId = input.productId != null && input.productId !== "";
  const sku = typeof input.sku === "string" ? input.sku.trim() : "";
  const productId = hasId ? Number(input.productId) : null;
  if (hasId ? !Number.isInteger(productId) || productId <= 0 : !sku || sku.length > 80) return { ok: false, error: tr("محصول معتبر نیست.") };
  const raw = input.minLevel;
  if (raw == null || (typeof raw === "string" && !raw.trim())) return { ok: true, value: { productId, sku: hasId ? null : sku, minLevel: null } };
  const c = parseCounted(raw);
  return c.ok && c.value != null ? { ok: true, value: { productId, sku: hasId ? null : sku, minLevel: c.value } } : { ok: false, error: COUNT_MESSAGES.bad_level };
}

// below the minimum? A level of 0 (or none) never flags anything.
export const isLow = (total, min) => min != null && Number(min) > 0 && Number(total) < Number(min);

// the numbers shown above a count
export function summarize(lines) {
  let counted = 0, short = 0, over = 0;
  for (const l of lines || []) {
    const d = countDelta(l.expected, l.counted);
    if (d == null) continue;
    counted += 1;
    if (d < 0) short += 1; else if (d > 0) over += 1;
  }
  const total = (lines || []).length;
  return { total, counted, uncounted: total - counted, differences: short + over, short, over };
}

// the differences a close would post, in a stable order: [{ productId, sku, delta, key }]
export function differencesOf(countId, lines) {
  const out = [];
  for (const l of lines || []) {
    const delta = countDelta(l.expected, l.counted);
    if (delta == null || delta === 0) continue;
    out.push({ productId: l.product_id ?? l.productId, sku: l.sku || "", delta, key: countKey(countId, l.product_id ?? l.productId) });
  }
  return out.sort((a, b) => a.productId - b.productId);
}

// the same differences as a reviewer reads them on an approval request (short, SKU and signed quantity)
export function proposalText(diffs, limit = 12) {
  const shown = diffs.slice(0, limit).map((d) => `${d.sku || `#${d.productId}`}: ${d.delta > 0 ? "+" : ""}${trimZeros(d.delta)}`);
  return shown.join("; ") + (diffs.length > limit ? ` … (+${diffs.length - limit})` : "");
}

// ── reports (CSV; every cell is formula-safe through toCsv) ─────────────────────────────────────────────────────────────
export const STOCK_CSV_HEAD = ["sku", "name", "warehouse", "quantity", "reserved", "available", "min_level", "low"];
export function stockCsv(rows) {
  return toCsv(STOCK_CSV_HEAD, (rows || []).map((r) => [r.sku, r.name, r.warehouse, r.quantity, r.reserved, round3(r.quantity - r.reserved), r.minLevel ?? "", r.low ? "yes" : ""]));
}
export const MOVEMENTS_CSV_HEAD = ["id", "created_at", "kind", "sku", "warehouse", "delta", "balance_after", "reason", "reference", "by"];
export function movementsCsv(rows) {
  return toCsv(MOVEMENTS_CSV_HEAD, (rows || []).map((m) => [m.id, m.created_at, m.kind, m.sku, m.warehouse, m.delta, m.balance_after, m.reason, m.reference, m.actor_label]));
}
export const COUNT_CSV_HEAD = ["sku", "expected", "counted", "difference"];
export function countCsv(lines) {
  return toCsv(COUNT_CSV_HEAD, (lines || []).map((l) => [l.sku, l.expected, l.counted ?? "", countDelta(l.expected, l.counted) ?? ""]));
}
