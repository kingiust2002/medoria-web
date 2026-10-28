// lib/operator/productRow.js — the product row as the panels store it, from what a form sends: every field cleaned and capped (the same
// caps as the CSV import), shared by the Health and Beauty actions and by the private draft preview, so a preview shows exactly what a save
// would store. Plain module (no Next, no database).
import { slugify, str, num, bool, strArray, parseSpecs, safeUrlRef } from "./validation.js";

// Field length caps for manual entry — same spirit as the CSV import CAPS, so
// no path into the DB accepts unbounded payloads.
export function buildProductRow(input) {
  const nameEn = str(input.name_en, 200);
  let base = slugify(input.slug || nameEn || "");
  if (!base) base = slugify(str(input.sku, 100) || "");
  return {
    name_en: nameEn,
    name_ru: str(input.name_ru, 200),
    name_tg: str(input.name_tg, 200),
    name_fa: str(input.name_fa, 200),
    description_en: str(input.description_en, 4000),
    description_ru: str(input.description_ru, 4000),
    description_tg: str(input.description_tg, 4000),
    description_fa: str(input.description_fa, 4000),
    slug: base,
    sku: str(input.sku, 100),
    brand: str(input.brand, 120),
    category: str(input.category, 80),
    category_id: num(input.category_id),
    price: bool(input.priceOnRequest) ? null : num(input.price, { min: 0 }),
    unit: str(input.unit, 120),
    min_order_qty: num(input.min_order_qty, { min: 1 }) ?? 1,
    in_stock: bool(input.in_stock),
    badge: str(input.badge, 20),
    is_featured: bool(input.is_featured),
    is_active: input.is_active === undefined ? true : bool(input.is_active),
    image_url: safeUrlRef(input.image_url),
    gallery_urls: strArray(input.gallery_urls, { maxItems: 12, maxLen: 600 }).map((u) => safeUrlRef(u)).filter(Boolean),
    specs: parseSpecs(input.specs),
    brochure_url: safeUrlRef(input.brochure_url),
    tags: strArray(input.tags, { maxItems: 30, maxLen: 60 }),
    seo_title: str(input.seo_title, 200),
    seo_description: str(input.seo_description, 500),
  };
}
