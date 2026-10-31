// lib/operator/publishRules.js — the publish quality rule (N6): which gaps of a product BLOCK publishing it. PURE (no database, no Next.js).
// The gaps are the ones lib/operator/completeness.js already shows (image, SKU, category, names, descriptions, specs); the main manager
// chooses, per house, which of them stop a product from going live. One function decides for every way a product can become public
// (direct save, approved request, scheduled publication, bulk publish, import, restore of a version); lib/operator/publishGate.js reads the rules
// and applies this to rows.
//
//   * "becoming public" = the row ends up active, or carries a publish date (a schedule is a promise to publish);
//   * a product that is ALREADY live is not punished for gaps it already had: only a gap that an edit newly introduces blocks that edit;
//   * variants are not pages of their own (N3), so a variant row is never judged;
//   * the empty list means no rule — what happened before this feature.
import { tr } from "../panel/i18n.js";
import { productGaps, gapLabel } from "./completeness.js";

// every gap code the completeness check can report, in its display order (the rule can name any of them)
export const ALL_GAP_CODES = productGaps({}).map((g) => g.code);
const CODE_SET = new Set(ALL_GAP_CODES);
export const MAX_RULES = ALL_GAP_CODES.length;

export const PUBLISH_MESSAGES = {
  blocked: tr("انتشار ممکن نیست؛ بخش‌های لازم کامل نیست."),
  blockedMany: tr("{count} محصول به‌خاطر ناقص‌بودن منتشر نشد."),
  unavailable: tr("قوانین کیفیت انتشار خوانده نشد؛ برای اطمینان، انتشار انجام نشد."),
  badRules: tr("فهرست قوانین نامعتبر است."),
  noRight: tr("اجازهٔ تعیین قوانین انتشار را ندارید."),
  conflict: tr("قوانین را شخص دیگری تغییر داده است؛ صفحه را تازه کنید."),
  notReady: tr("برای ذخیرهٔ قوانین، مایگریشن ۴۶ باید روی پایگاه داده اجرا شود."),
  generic: tr("ذخیرهٔ قوانین ناموفق بود."),
};

// → { ok: true, rules: [codes in display order] } | { ok: false, error }
export function cleanRules(input) {
  if (!Array.isArray(input)) return { ok: false, error: PUBLISH_MESSAGES.badRules };
  const seen = new Set();
  for (const c of input) {
    if (typeof c !== "string" || !CODE_SET.has(c)) return { ok: false, error: PUBLISH_MESSAGES.badRules };
    seen.add(c);
  }
  return { ok: true, rules: ALL_GAP_CODES.filter((c) => seen.has(c)) };
}

// a rule list read from the database: unknown codes are dropped (a newer/older code set must never make the gate throw)
export const rulesFromRow = (blocking) => (Array.isArray(blocking) ? ALL_GAP_CODES.filter((c) => blocking.includes(c)) : []);

// Does this row go (or stay) public?
export const goesPublic = (row) => Boolean(row && (row.is_active === true || row.publish_at));

// The gaps that stop THIS change. `after` is the row as it will be stored (the stored row with the change laid over it); `before` is the
// stored row (null for a new product). → array of gap objects { code, label, key, vars } — empty = nothing blocks.
export function publishBlockers(after, rules, before = null) {
  if (!after || !Array.isArray(rules) || rules.length === 0) return [];
  if (after.variant_of != null) return [];
  if (!goesPublic(after)) return [];
  const wanted = new Set(rules);
  let gaps = productGaps(after).filter((g) => wanted.has(g.code));
  if (before && before.is_active === true && after.is_active === true && !after.publish_at) {
    // already live: only what this edit newly breaks
    const had = new Set(productGaps(before).map((g) => g.code));
    gaps = gaps.filter((g) => !had.has(g.code));
  }
  return gaps;
}

export const blockerCodes = (gaps) => gaps.map((g) => g.code);

// ── words for the screens (the same text is built in the language of the person's panel) ──────────────────────────────────
export const GAP_BY_CODE = Object.fromEntries(productGaps({}).map((g) => [g.code, g]));
export const codesText = (codes, t) => (codes || []).map((c) => (GAP_BY_CODE[c] ? gapLabel(GAP_BY_CODE[c], t) : c)).join(t("،") + " ");

// An answer of an action that was stopped (or partly stopped) by the rule → one sentence. `res.publishBlocked` is a list of codes (one product)
// or a list of { id, sku, codes } (many); without it the plain error text is returned.
export function blockedText(res, t) {
  if (!res) return "";
  const head = t(res.error || "");
  const list = res.publishBlocked;
  if (!Array.isArray(list) || !list.length) return head;
  if (typeof list[0] === "string") return `${head} ${t("بخش‌های ناقص: {items}", { items: codesText(list, t) })}`;
  const lines = list.slice(0, 5).map((b) => `${b.sku || `#${b.id}`}: ${codesText(b.codes, t)}`);
  return `${head} ${lines.join(" · ")}${list.length > 5 || (res.blockedCount || 0) > 5 ? " …" : ""}`;
}
