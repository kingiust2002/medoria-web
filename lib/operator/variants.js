// lib/operator/variants.js — product variants (migration 44): the options that make a variant different, the row a variant is stored as, and the
// grouping the product page offers. Pure module (no Next, no database): used by the panels' actions, the public product pages and the tests.
//
// A variant is a product row of its own (own SKU, price or "price on request", image, stock flag, active flag) that points at its parent; the
// names it is stored with are DERIVED ("<parent name> — <option values>") so every list, the warehouse and the customer requests show something
// meaningful; the product page shows the parent's text and the variant's options.
import { bool, num, safeUrlRef, slugify, str } from "./validation.js";
import { tr } from "../panel/i18n.js";

export const VARIANT_LIMITS = { options: 3, key: 30, value: 60, sku: 100, sort: 1000, perProduct: 100 };

export const VARIANT_MESSAGES = {
  badParent: tr("محصول اصلی پیدا نشد."),
  parentIsVariant: tr("این محصول خودش یک تنوع است؛ تنوع برای تنوع ساخته نمی‌شود."),
  noOptions: tr("حداقل یک مشخصهٔ متغیر لازم است (مثلاً اندازه: M)."),
  tooManyOptions: tr("حداکثر {max} مشخصهٔ متغیر مجاز است.", { max: VARIANT_LIMITS.options }),
  badOption: tr("نام و مقدار هر مشخصه لازم است و نباید بلند یا تکراری باشد."),
  noSku: tr("هر تنوع کد کالای (SKU) مستقل لازم دارد."),
  skuTaken: tr("این کد کالا (SKU) قبلاً برای محصول یا تنوع دیگری ثبت شده است."),
  sameOptions: tr("تنوعی با همین مشخصه‌ها برای این محصول وجود دارد."),
  notFound: tr("این تنوع پیدا نشد."),
  tooMany: tr("هر محصول حداکثر {max} تنوع دارد.", { max: VARIANT_LIMITS.perProduct }),
  needsMigration: tr("تنوع محصول به مایگریشن ۴۴ نیاز دارد؛ آن را اجرا کنید."),
  hasVariants: tr("این محصول تنوع دارد. ابتدا تنوع‌ها را حذف کنید."),
  duplicateVariant: tr("تنوع را از صفحهٔ محصول اصلی کپی یا اضافه کنید."),
  generic: tr("ذخیرهٔ تنوع ناموفق بود. دوباره تلاش کنید."),
};

const CONTROL = /[\u0000-\u001F\u007F\u00A0\u2028\u2029\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g;   // control, no-break space, line separators, zero-width and bidi marks
const oneLine = (v, max) => String(v ?? "").replace(CONTROL, " ").replace(/\s+/g, " ").trim().slice(0, max);

// input: [{ key, value }] (from the form) or { key: value }. → { ok, options: { key: value } (insertion order kept) } | { ok: false, error }
export function cleanOptions(input) {
  let pairs;
  if (Array.isArray(input)) pairs = input.map((p) => [p?.key, p?.value]);
  else if (input && typeof input === "object") pairs = Object.entries(input);
  else return { ok: false, error: VARIANT_MESSAGES.noOptions };
  const out = {};
  const seen = new Set();
  for (const [k, v] of pairs) {
    const key = oneLine(k, VARIANT_LIMITS.key + 1), value = oneLine(v, VARIANT_LIMITS.value + 1);
    if (!key && !value) continue;                                                // an empty row of the form
    if (!key || !value || key.length > VARIANT_LIMITS.key || value.length > VARIANT_LIMITS.value || /^__/.test(key) || seen.has(key.toLowerCase())) return { ok: false, error: VARIANT_MESSAGES.badOption };
    seen.add(key.toLowerCase());
    out[key] = value;
  }
  const n = Object.keys(out).length;
  if (n === 0) return { ok: false, error: VARIANT_MESSAGES.noOptions };
  if (n > VARIANT_LIMITS.options) return { ok: false, error: VARIANT_MESSAGES.tooManyOptions };
  return { ok: true, options: out };
}

export const optionLabel = (options) => Object.values(options || {}).join(" / ");
// the same options in any order are the same variant
export const optionsKey = (options) => JSON.stringify(Object.entries(options || {}).map(([k, v]) => [k.toLowerCase(), String(v).toLowerCase()]).sort());

// "<parent name> — <option values>" for every language the parent has a name in
export function deriveNames(parent, options) {
  const label = optionLabel(options);
  const out = {};
  for (const l of ["en", "ru", "tg", "fa"]) {
    const base = parent?.[`name_${l}`];
    if (base) out[`name_${l}`] = `${base} — ${label}`.slice(0, 200);
  }
  return out;
}

// The row to store for a variant. `parent` is the stored parent row; `existing` the stored variant when editing. → { ok, row } | { ok: false, error }
export function buildVariantRow(parent, input = {}, existing = null) {
  if (!parent?.id) return { ok: false, error: VARIANT_MESSAGES.badParent };
  if (parent.variant_of != null) return { ok: false, error: VARIANT_MESSAGES.parentIsVariant };
  const opts = cleanOptions(input.options);
  if (!opts.ok) return opts;
  const sku = str(oneLine(input.sku, VARIANT_LIMITS.sku + 1), VARIANT_LIMITS.sku);
  if (!sku) return { ok: false, error: VARIANT_MESSAGES.noSku };
  const sortN = num(input.sort, { min: 0 });
  const row = {
    variant_of: parent.id,
    variant_options: opts.options,
    variant_sort: Math.min(sortN ?? 0, VARIANT_LIMITS.sort),
    sku,
    ...deriveNames(parent, opts.options),
    brand: parent.brand ?? null,
    category: parent.category ?? null,
    category_id: parent.category_id ?? null,
    unit: str(input.unit, 120) ?? parent.unit ?? null,
    min_order_qty: num(input.min_order_qty, { min: 1 }) ?? parent.min_order_qty ?? 1,
    price: bool(input.priceOnRequest) ? null : num(input.price, { min: 0 }),
    in_stock: input.in_stock === undefined ? true : bool(input.in_stock),
    is_active: input.is_active === undefined ? true : bool(input.is_active),
    is_featured: false,
    image_url: safeUrlRef(input.image_url),
  };
  if ("currency" in parent) row.currency = parent.currency ?? "USD";
  // a new variant gets a readable address of its own (never shown to the public as a page; the column is unique and required)
  row.slug = existing?.slug || `${parent.slug || `product-${parent.id}`}-${slugify(sku) || Date.now()}`.slice(0, 120);
  return { ok: true, row };
}

// Is the stored shape of a row a variant? (works on rows from the database)
export const isVariantRow = (row) => row?.variant_of != null;

// ── the product page ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// variants: [{ id, sku, options, price, in_stock, image_url, sort }] → the axes the visitor chooses along: [{ key, values: [..] }] in first-seen order
export function groupAxes(variants) {
  const axes = new Map();
  for (const v of variants || []) for (const [k, val] of Object.entries(v.options || {})) {
    if (!axes.has(k)) axes.set(k, []);
    if (!axes.get(k).includes(val)) axes.get(k).push(val);
  }
  return [...axes].map(([key, values]) => ({ key, values }));
}

// The variant a selection { axisKey: value } points at (all axes given), or null.
export function findVariant(variants, selection) {
  return (variants || []).find((v) => Object.entries(v.options || {}).every(([k, val]) => selection?.[k] === val) && Object.keys(selection || {}).length === Object.keys(v.options || {}).length) || null;
}

// The values still available given what is already chosen: a value is offered only if some variant has it together with the chosen ones.
export function availableValues(variants, selection, axisKey) {
  const others = Object.entries(selection || {}).filter(([k]) => k !== axisKey);
  return new Set((variants || []).filter((v) => others.every(([k, val]) => v.options?.[k] === val)).map((v) => v.options?.[axisKey]).filter((x) => x != null));
}

// The variant to show after the visitor picks `value` on axis `key`: among the variants that have it, the one that agrees with the rest of the
// current selection on the most axes (so picking "L" keeps the colour when "L" exists in that colour, and moves to the nearest otherwise).
export function pickVariant(variants, selection, key, value) {
  const have = (variants || []).filter((v) => v.options?.[key] === value);
  if (!have.length) return null;
  const score = (v) => Object.entries(selection || {}).filter(([k, val]) => k !== key && v.options?.[k] === val).length;
  return have.reduce((best, v) => (score(v) > score(best) ? v : best), have[0]);
}

// The variant a page opens on: the first one that is in stock, else the first (they arrive in the owner's order).
export const defaultVariant = (variants) => (variants || []).find((v) => v.in_stock) || (variants || [])[0] || null;

// What a visitor sees about the chosen variant, on top of the parent: name (parent — options), price (or on request), SKU, stock, image.
// Missing parts fall back to the parent. The id is the variant's own: a request, an inquiry and the warehouse refer to exactly this row.
export function variantView(parent, variant) {
  if (!variant) return parent;
  return {
    ...parent, ...deriveNames(parent, variant.options),
    id: variant.id, sku: variant.sku, price: variant.price, in_stock: variant.in_stock, image_url: variant.image_url || parent.image_url,
    unit: variant.unit || parent.unit, __variant: variant,
  };
}

// schema.org: a product with variants is a ProductGroup whose variants are Products with their own SKU and offer (all pointing at this page)
export function variantsJsonLd({ base, variants, name, url, currency = "USD", onRequest = (v) => v.price == null }) {
  if (!variants?.length) return null;
  const { offers: _offers, "@type": _type, ...common } = base;
  return {
    ...common,
    "@type": "ProductGroup",
    productGroupID: base.sku || undefined,
    variesBy: groupAxes(variants).map((a) => a.key),
    hasVariant: variants.map((v) => ({
      "@type": "Product",
      name: `${name} — ${optionLabel(v.options)}`,
      sku: v.sku,
      url,
      offers: {
        "@type": "Offer", url,
        availability: v.in_stock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
        ...(onRequest(v) ? {} : { price: Number(v.price), priceCurrency: v.currency || currency }),
      },
    })),
  };
}
