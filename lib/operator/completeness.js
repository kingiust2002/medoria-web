// lib/operator/completeness.js — what a product page is still missing, from the product row alone.
// Shown in both operator panels as a filter, a badge and a dashboard count. It only POINTS at gaps; it
// never fills anything in, and it never counts "price on request" as a gap (that is a normal, valid state).
// Plain module so it is unit-tested directly.

export const LANGS = ["fa", "ru", "tg", "en"];
export const LANG_FA = { fa: "فارسی", ru: "روسی", tg: "تاجیکی", en: "انگلیسی" };

const blank = (v) => v == null || String(v).trim() === "";

// → array of { code, label } in a stable order; empty = nothing missing.
export function productGaps(p) {
  if (!p) return [];
  const gaps = [];
  if (blank(p.image_url)) gaps.push({ code: "image", label: "تصویر" });
  if (blank(p.sku)) gaps.push({ code: "sku", label: "کد کالا (SKU)" });
  if (blank(p.category_id) && blank(p.category)) gaps.push({ code: "category", label: "دسته‌بندی" });
  for (const l of LANGS) if (blank(p[`name_${l}`])) gaps.push({ code: `name_${l}`, label: `نام (${LANG_FA[l]})` });
  for (const l of LANGS) if (blank(p[`description_${l}`])) gaps.push({ code: `description_${l}`, label: `توضیحات (${LANG_FA[l]})` });
  const specs = p.specs && typeof p.specs === "object" && !Array.isArray(p.specs) ? p.specs : null;
  if (!specs || Object.keys(specs).length === 0) gaps.push({ code: "specs", label: "مشخصات فنی" });
  return gaps;
}

export const isIncomplete = (p) => productGaps(p).length > 0;

// For the dashboard: how many ACTIVE products have at least one gap (archived ones are not on the site).
export function countIncomplete(products) {
  return (products || []).filter((p) => p.is_active !== false && isIncomplete(p)).length;
}

// Short text for a tooltip / badge: "۳ مورد: تصویر، توضیحات (تاجیکی)، …"
export function gapSummary(p, max = 6) {
  const g = productGaps(p);
  if (!g.length) return "";
  const names = g.slice(0, max).map((x) => x.label).join("، ");
  return `${g.length} مورد: ${names}${g.length > max ? "، …" : ""}`;
}
