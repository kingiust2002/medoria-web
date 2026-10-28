// lib/warehouse/lotsCore.js — the pure part of warehouse lots (migration 45): the state of a lot on a given day, the usable stock of a product,
// the alerts (expired / expiring / quarantined / low usable stock), input cleaning for a lot change and the messages. No I/O, no Next
// imports: unit-tested. The database decides what is allowed; this file only reads and presents what it stored, with the SAME rule for
// "expired" (an expiry date is the last valid day; expired from the next team calendar day on) and "unusable".
import { teamDay } from "../operator/quoteOps.js";
import { tr } from "../panel/i18n.js";

export const LOT_STATUSES = ["active", "quarantine", "rejected"];
export const EXPIRING_DAYS = [30, 60, 90];
export const DEFAULT_EXPIRING_DAYS = 30;

export const LOT_MESSAGES = {
  bad_lot_code: tr("کد بچ ۱ تا ۴۰ نویسه باشد و نویسهٔ کنترلی نداشته باشد."),
  bad_expiry: tr("تاریخ انقضا را به شکل سال-ماه-روز (مثلاً 2027-03-31) وارد کنید."),
  bad_lot_id: tr("این بچ معتبر نیست."),
  bad_status: tr("وضعیت بچ معتبر نیست."),
  bad_version: tr("نسخهٔ بچ معتبر نیست؛ صفحه را تازه کنید."),
  reason_required: tr("دلیل (۳ تا ۳۰۰ نویسه) لازم است."),
  nothing_to_change: tr("تغییری برای ثبت نیست."),
  unavailable: tr("ثبت بچ و تاریخ انقضا به مایگریشن ۴۵ نیاز دارد؛ آن را اجرا کنید."),
  generic: tr("تغییر بچ انجام نشد. دوباره تلاش کنید."),
};

// the team's calendar day, "YYYY-MM-DD" (the same day the database uses: Asia/Dushanbe)
export const teamToday = (now = Date.now()) => teamDay(now);

const DAY = 86_400_000;
const isoToDays = (iso) => Math.floor(Date.parse(`${String(iso).slice(0, 10)}T12:00:00.000Z`) / DAY);
// whole days from `today` to `date` (negative = in the past)
export const daysBetween = (today, date) => (date ? isoToDays(date) - isoToDays(today) : null);

// "active" | "quarantine" | "rejected" | "expired". Rejected and quarantine win over expired (they are decisions a person took).
export function lotState(lot, today) {
  if (lot.status === "rejected") return "rejected";
  if (lot.status === "quarantine") return "quarantine";
  if (lot.expiry_date && String(lot.expiry_date).slice(0, 10) < today) return "expired";
  return "active";
}
export const isUsableLot = (lot, today) => lotState(lot, today) === "active";

const round3 = (n) => Math.round(n * 1000) / 1000;

// lots: rows of *_stock_lots; lotBalances: rows of *_stock_lot_balances ({ lot_id, location_id, quantity }).
// → Map lotId → { ...lot, state, quantity, byLocation: { [locationId]: qty }, usableQuantity, daysLeft }
export function describeLots(lots, lotBalances, today) {
  const qtyByLot = new Map();
  for (const b of lotBalances || []) {
    const e = qtyByLot.get(b.lot_id) || { total: 0, byLocation: {} };
    e.total += Number(b.quantity);
    e.byLocation[b.location_id] = round3((e.byLocation[b.location_id] || 0) + Number(b.quantity));
    qtyByLot.set(b.lot_id, e);
  }
  const out = new Map();
  for (const l of lots || []) {
    const q = qtyByLot.get(l.id) || { total: 0, byLocation: {} };
    const state = lotState(l, today);
    out.set(l.id, {
      id: l.id, productId: l.product_id, code: l.lot_code, expiry: l.expiry_date ? String(l.expiry_date).slice(0, 10) : null, status: l.status, state,
      version: l.version, quantity: round3(q.total), byLocation: q.byLocation, usableQuantity: state === "active" ? round3(q.total) : 0,
      daysLeft: daysBetween(today, l.expiry_date ? String(l.expiry_date).slice(0, 10) : null), createdAt: l.created_at, who: l.created_label || "",
    });
  }
  return out;
}

// per product: { lotQuantity, unusable } over the lots described above (a warehouse filter passes its location id)
export function unusableByProduct(described, { locationId = null } = {}) {
  const out = new Map();
  for (const l of described.values()) {
    const qty = locationId ? Number(l.byLocation[locationId] || 0) : l.quantity;
    if (!qty) continue;
    const e = out.get(l.productId) || { lotQuantity: 0, unusable: 0 };
    e.lotQuantity = round3(e.lotQuantity + qty);
    if (l.state !== "active") e.unusable = round3(e.unusable + qty);
    out.set(l.productId, e);
  }
  return out;
}

// usable = on hand - reserved - unusable, never below 0 (reserved stock above the usable quantity is shown as an alert, not as a negative)
export const usableOf = (total, reserved, unusable) => Math.max(0, round3(Number(total) - Number(reserved) - Number(unusable || 0)));

// Low means: the USABLE quantity (on hand without quarantined / rejected / expired stock, reserved stock still counted as on hand, as in the
// stock list of migration 41) is below the product's minimum level.
// (same rule as countsCore.isLow: a minimum of 0 or none never flags anything)
export const isLowUsable = (total, unusable, min) => min != null && Number(min) > 0 && round3(Number(total) - Number(unusable || 0)) < Number(min);

// The alerts of a warehouse. Only lots that still hold stock count.
//   expired: stock past its date · expiring: usable stock that expires within `window` days · quarantine / rejected: stock waiting for a decision
//   lowUsable: products whose usable quantity is below the minimum level
export function summarizeAlerts({ described, products = [], today, window = DEFAULT_EXPIRING_DAYS, locationId = null }) {
  const alerts = { expired: 0, expiring: 0, quarantine: 0, rejected: 0, lowUsable: 0, reservedUncovered: 0 };
  const lists = { expired: [], expiring: [], quarantine: [], rejected: [] };
  for (const l of described.values()) {
    const qty = locationId ? Number(l.byLocation[locationId] || 0) : l.quantity;
    if (!qty) continue;
    if (l.state === "expired") { alerts.expired++; lists.expired.push(l.id); }
    else if (l.state === "quarantine") { alerts.quarantine++; lists.quarantine.push(l.id); }
    else if (l.state === "rejected") { alerts.rejected++; lists.rejected.push(l.id); }
    else if (l.daysLeft != null && l.daysLeft <= window) { alerts.expiring++; lists.expiring.push(l.id); }
  }
  for (const p of products) {
    if (p.low) alerts.lowUsable++;
    if (p.reserved > p.usable + 0.0005 && p.unusable > 0) alerts.reservedUncovered++;
  }
  return { alerts, lists };
}

// ── input of a lot change (status and / or expiry date) ───────────────────────────────────────────────────────────────────
export function validDate(v) {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T12:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v && d.getUTCFullYear() >= 2000 && d.getUTCFullYear() <= 2100;
}

const CONTROL = /[\u0000-\u001F\u007F\u0085\u2028\u2029]/;
// a lot code as typed on a receipt: 1..40 characters, trimmed, no control characters
export function cleanLotCode(v) {
  const s = typeof v === "string" ? v.trim() : "";
  return s.length >= 1 && s.length <= 40 && !CONTROL.test(s) ? { ok: true, value: s } : { ok: false, error: LOT_MESSAGES.bad_lot_code };
}

// { lotId, version, status?, setExpiry?, expiry?, reason } as typed → the arguments of <house>_stock_lot_update
export function cleanLotUpdate(input = {}) {
  const lotId = Number(input.lotId), version = Number(input.version);
  if (!Number.isInteger(lotId) || lotId <= 0) return { ok: false, error: LOT_MESSAGES.bad_lot_id };
  if (!Number.isInteger(version) || version <= 0) return { ok: false, error: LOT_MESSAGES.bad_version };
  const status = input.status == null || input.status === "" ? null : input.status;
  if (status != null && !LOT_STATUSES.includes(status)) return { ok: false, error: LOT_MESSAGES.bad_status };
  const setExpiry = Boolean(input.setExpiry);
  let expiry = null;
  if (setExpiry && input.expiry != null && input.expiry !== "") {
    if (!validDate(input.expiry)) return { ok: false, error: LOT_MESSAGES.bad_expiry };
    expiry = input.expiry;
  }
  if (status == null && !setExpiry) return { ok: false, error: LOT_MESSAGES.nothing_to_change };
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  if (reason.length < 3 || reason.length > 300) return { ok: false, error: LOT_MESSAGES.reason_required };
  return { ok: true, value: { lotId, version, status, setExpiry, expiry, reason } };
}
