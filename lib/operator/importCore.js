// lib/operator/importCore.js
// Pure normalization + validation + planning for product batches.
// Shared by the bulk-add grid and the Excel/CSV import — and by BOTH the
// client (instant preview) and the server (authoritative re-validation).
// No DB access, no secrets, no node APIs.
import { slugify, str, parseSpecs } from "@/lib/operator/validation";

export const MAX_ROWS_PER_FILE = 500;   // v1 import cap (Vercel Hobby-safe)
export const MAX_ROWS_PER_CALL = 200;   // hard server cap per action call
export const COMMIT_CHUNK_SIZE = 25;    // rows written per commit call

export const IMPORT_MODES = ["add", "update", "upsert"];
const BADGES = ["NEW", "TOP", "SALE"];

// Single source of truth for the template/import columns (order = template order).
export const IMPORT_COLUMNS = [
  { key: "name_fa",          label: "نام فارسی (یکی از دو نام الزامی)", example: "دستکش نیتریل آبی" },
  { key: "name_en",          label: "نام انگلیسی", example: "Nitrile gloves blue" },
  { key: "sku",              label: "کد محصول — کلید بروزرسانی", example: "GLV-001" },
  { key: "category_slug",    label: "اسلاگ دسته (از صفحه دسته‌ها)", example: "gloves" },
  { key: "brand",            label: "برند", example: "MediCare" },
  { key: "price",            label: "قیمت دلار — خالی = استعلام", example: "8.50" },
  { key: "price_on_request", label: "استعلام قیمت (yes/no)", example: "no" },
  { key: "unit",             label: "واحد", example: "بسته ۱۰۰ عددی" },
  { key: "min_order_qty",    label: "حداقل سفارش", example: "10" },
  { key: "in_stock",         label: "موجود (yes/no)", example: "yes" },
  { key: "is_active",        label: "فعال در سایت (yes/no)", example: "yes" },
  { key: "is_featured",      label: "ویژه (yes/no)", example: "no" },
  { key: "badge",            label: "نشان: NEW / TOP / SALE", example: "" },
  { key: "image_url",        label: "آدرس تصویر اصلی", example: "https://example.com/glove.jpg" },
  { key: "slug",             label: "اسلاگ صفحه (خالی = خودکار)", example: "" },
  { key: "name_ru",          label: "نام روسی (اختیاری)", example: "" },
  { key: "name_tg",          label: "نام تاجیکی (اختیاری)", example: "" },
  { key: "description_fa",   label: "توضیحات فارسی", example: "" },
  { key: "description_en",   label: "توضیحات انگلیسی", example: "" },
  { key: "description_ru",   label: "توضیحات روسی", example: "" },
  { key: "description_tg",   label: "توضیحات تاجیکی", example: "" },
  { key: "tags",             label: "برچسب‌ها جدا با |", example: "دستکش|نیتریل" },
  { key: "gallery_urls",     label: "گالری، آدرس‌ها جدا با |", example: "" },
  { key: "specs",            label: "مشخصات key:value جدا با |", example: "سایز:M|رنگ:آبی" },
  { key: "seo_title",        label: "عنوان سئو", example: "" },
  { key: "seo_description",  label: "توضیح سئو", example: "" },
  { key: "brochure_url",     label: "آدرس بروشور PDF", example: "" },
];
export const IMPORT_COLUMN_KEYS = IMPORT_COLUMNS.map((c) => c.key);

// Per-field length caps — oversized cells are truncated with a warning.
const CAPS = {
  name_fa: 200, name_en: 200, name_ru: 200, name_tg: 200,
  description_fa: 4000, description_en: 4000, description_ru: 4000, description_tg: 4000,
  sku: 100, brand: 120, unit: 120, slug: 80,
  seo_title: 200, seo_description: 500,
  image_url: 600, brochure_url: 600,
};

// ── cell parsers ──────────────────────────────────────────────────────────────
export function normalizeDigits(s) {
  return String(s ?? "").replace(/[۰-۹٠-٩]/g, (d) => {
    const fa = "۰۱۲۳۴۵۶۷۸۹".indexOf(d);
    return String(fa >= 0 ? fa : "٠١٢٣٤٥٦٧٨٩".indexOf(d));
  });
}

const TRUE_WORDS = new Set(["yes", "y", "true", "1", "✓", "on", "بله", "فعال", "دارد", "موجود"]);
const FALSE_WORDS = new Set(["no", "n", "false", "0", "✗", "x", "off", "خیر", "غیرفعال", "ندارد", "ناموجود"]);

// Tri-state boolean: true / false / undefined (empty or unrecognised).
export function parseBoolCell(v) {
  if (typeof v === "boolean") return v;
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return undefined;
  if (TRUE_WORDS.has(s)) return true;
  if (FALSE_WORDS.has(s)) return false;
  return undefined;
}

export function parseNumberCell(v) {
  const s = normalizeDigits(v).trim().replace(/,/g, "");
  if (!s) return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

export function splitList(v) {
  const seen = new Set();
  const out = [];
  for (const part of String(v ?? "").split(/[|،]/)) {
    const s = part.trim();
    if (s && !seen.has(s)) { seen.add(s); out.push(s); }
  }
  return out;
}

export function parseSpecsCell(v) {
  const out = [];
  for (const pair of String(v ?? "").split("|")) {
    const idx = pair.indexOf(":");
    if (idx <= 0) continue;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (key) out.push({ key, value });
  }
  return out;
}

// Accepts an http(s) URL or a storage path like "products/abc.webp".
export function isImageRef(s) {
  const v = String(s || "").trim();
  if (!v) return false;
  if (/^https?:\/\//i.test(v)) {
    try { new URL(v); return true; } catch { return false; }
  }
  return /^[\w\-./]+$/.test(v) && !v.includes("..");
}

function titleize(slug) {
  return String(slug || "").split("-").filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// ── row normalization ─────────────────────────────────────────────────────────
// raw: object keyed by IMPORT_COLUMN_KEYS (extra keys ignored by caller).
// Returns { rowNum, fields, provided:Set, errors:[], warnings:[] }.
export function normalizeRow(raw, rowNum) {
  const errors = [];
  const warnings = [];
  const fields = {};
  const provided = new Set();

  const take = (key) => {
    let v = str(raw?.[key]);
    if (v == null) return null;
    const cap = CAPS[key];
    if (cap && v.length > cap) {
      v = v.slice(0, cap);
      warnings.push(`«${key}» طولانی بود و کوتاه شد (حداکثر ${cap} نویسه).`);
    }
    provided.add(key);
    return v;
  };

  for (const k of ["name_fa", "name_en", "name_ru", "name_tg",
                   "description_fa", "description_en", "description_ru", "description_tg",
                   "brand", "unit", "seo_title", "seo_description"]) {
    fields[k] = take(k);
  }

  if (!fields.name_fa && !fields.name_en) {
    errors.push("نام فارسی یا انگلیسی الزامی است.");
  }

  const sku = take("sku");
  fields.sku = sku;

  const rawSlug = take("slug");
  if (rawSlug) {
    const s = slugify(rawSlug);
    if (!s) { warnings.push("اسلاگ واردشده نامعتبر بود (فقط حروف لاتین) و نادیده گرفته شد."); provided.delete("slug"); }
    fields.slug = s || null;
  } else fields.slug = null;

  fields.category_slug = take("category_slug");
  if (fields.category_slug) fields.category_slug = fields.category_slug.toLowerCase();

  // price / price_on_request
  const porRaw = raw?.price_on_request;
  const por = parseBoolCell(porRaw);
  if (str(porRaw) != null) {
    provided.add("price_on_request");
    if (por === undefined) warnings.push("مقدار «price_on_request» نامفهوم بود و نادیده گرفته شد.");
  }
  const priceRaw = str(raw?.price);
  let price;
  if (priceRaw != null) {
    provided.add("price");
    price = parseNumberCell(priceRaw);
    if (Number.isNaN(price)) { errors.push("قیمت عدد معتبری نیست."); price = undefined; }
    else if (price < 0) { errors.push("قیمت نمی‌تواند منفی باشد."); price = undefined; }
  }
  fields.price_on_request = por === true;
  // empty price (or explicit on-request) ⇒ null ⇒ "استعلام قیمت" on the site
  fields.price = fields.price_on_request ? null : (price ?? null);

  const qtyRaw = str(raw?.min_order_qty);
  if (qtyRaw != null) {
    provided.add("min_order_qty");
    const q = parseNumberCell(qtyRaw);
    if (Number.isNaN(q) || q == null) { warnings.push("حداقل سفارش عدد نبود و نادیده گرفته شد."); provided.delete("min_order_qty"); }
    else fields.min_order_qty = Math.max(1, Math.round(q));
  }

  for (const k of ["in_stock", "is_active", "is_featured"]) {
    const cell = raw?.[k];
    if (str(cell) == null && typeof cell !== "boolean") continue;
    const b = parseBoolCell(cell);
    if (b === undefined) warnings.push(`مقدار «${k}» نامفهوم بود و نادیده گرفته شد.`);
    else { fields[k] = b; provided.add(k); }
  }

  const badge = take("badge");
  if (badge) {
    const up = badge.toUpperCase();
    if (BADGES.includes(up)) fields.badge = up;
    else { warnings.push(`نشان «${badge}» شناخته نشد (فقط NEW/TOP/SALE) و حذف شد.`); provided.delete("badge"); }
  }

  const image = take("image_url");
  if (image) {
    if (isImageRef(image)) fields.image_url = image;
    else { warnings.push("آدرس تصویر نامعتبر بود و حذف شد."); provided.delete("image_url"); }
  }

  const brochure = take("brochure_url");
  if (brochure) {
    if (isImageRef(brochure)) fields.brochure_url = brochure;
    else { warnings.push("آدرس بروشور نامعتبر بود و حذف شد."); provided.delete("brochure_url"); }
  }

  if (str(raw?.tags) != null) {
    provided.add("tags");
    fields.tags = splitList(raw.tags).slice(0, 30).map((t) => t.slice(0, 60));
  }

  if (str(raw?.gallery_urls) != null) {
    const urls = splitList(raw.gallery_urls);
    const ok = urls.filter(isImageRef);
    if (ok.length < urls.length) warnings.push(`${urls.length - ok.length} آدرس گالری نامعتبر حذف شد.`);
    if (urls.length) provided.add("gallery_urls");
    fields.gallery_urls = ok.slice(0, 12);
  }

  if (str(raw?.specs) != null) {
    const rows = parseSpecsCell(raw.specs).slice(0, 40);
    if (rows.length) { provided.add("specs"); fields.specs = rows; }
    else if (String(raw.specs).trim()) warnings.push("قالب مشخصات شناخته نشد (key:value|key:value) و نادیده گرفته شد.");
  }

  return { rowNum, fields, provided, errors, warnings };
}

// ── batch planning ────────────────────────────────────────────────────────────
// Pure: all DB state arrives via ctx maps.
//   ctx = {
//     mode: "add"|"update"|"upsert",
//     autoCreateCategories: bool,
//     categoriesBySlug: Map lower(slug) → { id, slug },
//     existingBySku:    Map lower(sku)  → { id, slug },
//     existingBySlug:   Map slug        → { id },
//     takenSlugs:       Set of every product slug,
//   }
// Returns { plans, categoriesToCreate } — plans[i]:
//   { rowNum, action: create|update|skip|error, id?, write?, slug?, messages, warnings }
export function planBatch(normRows, ctx) {
  const mode = IMPORT_MODES.includes(ctx.mode) ? ctx.mode : "add";
  const claimedSlugs = new Set();
  const seenSkus = new Set();
  const categoriesToCreate = new Map(); // slug → {slug, name_en}
  const plans = [];

  const uniqueSlug = (base) => {
    let candidate = base || `product-${Date.now()}`;
    let i = 2;
    while (ctx.takenSlugs.has(candidate) || claimedSlugs.has(candidate)) {
      candidate = `${base}-${i++}`;
      if (i > 80) { candidate = `${base}-${Date.now()}`; break; }
    }
    claimedSlugs.add(candidate);
    return candidate;
  };

  for (const row of normRows) {
    const { rowNum, fields, provided } = row;
    const messages = [];
    const warnings = [...row.warnings];

    if (row.errors.length) {
      plans.push({ rowNum, action: "error", messages: [...row.errors], warnings });
      continue;
    }

    // in-file duplicate SKU
    const skuKey = fields.sku ? fields.sku.toLowerCase() : null;
    if (skuKey) {
      if (seenSkus.has(skuKey)) {
        plans.push({ rowNum, action: "error", messages: [`کد «${fields.sku}» در همین فایل تکراری است.`], warnings });
        continue;
      }
      seenSkus.add(skuKey);
    }

    // category resolution
    let category_id = null;
    let category = null;
    if (fields.category_slug) {
      const cat = ctx.categoriesBySlug.get(fields.category_slug) || categoriesToCreate.get(fields.category_slug);
      if (cat) {
        category_id = cat.id ?? null; // null for not-yet-created categories (filled at commit)
        category = cat.slug;
      } else if (ctx.autoCreateCategories) {
        const slug = slugify(fields.category_slug);
        if (!slug) {
          plans.push({ rowNum, action: "error", messages: [`اسلاگ دسته «${fields.category_slug}» نامعتبر است.`], warnings });
          continue;
        }
        categoriesToCreate.set(slug, { slug, name_en: titleize(slug) });
        category = slug;
        warnings.push(`دسته «${slug}» وجود ندارد و ساخته می‌شود.`);
      } else {
        plans.push({ rowNum, action: "error", messages: [`دسته «${fields.category_slug}» وجود ندارد. اول دسته را بسازید یا گزینه ساخت خودکار را فعال کنید.`], warnings });
        continue;
      }
    }

    // match against existing products: SKU first, then slug
    const bySku = skuKey ? ctx.existingBySku.get(skuKey) : null;
    const bySlug = !bySku && fields.slug ? ctx.existingBySlug.get(fields.slug) : null;

    // Conflict: row carries a NEW SKU but its explicit slug belongs to another
    // product. Updating by slug would hit the wrong product — refuse clearly.
    if (bySlug && skuKey && mode !== "add") {
      plans.push({
        rowNum, action: "error",
        messages: [`اسلاگ «${fields.slug}» متعلق به محصول دیگری است (با کد متفاوت). اسلاگ را خالی بگذارید یا اصلاح کنید.`],
        warnings,
      });
      continue;
    }

    const match = bySku || bySlug;

    if (match) {
      if (mode === "add") {
        plans.push({
          rowNum, action: "skip", id: match.id,
          messages: [bySku ? `کد «${fields.sku}» قبلاً وجود دارد — رد شد (حالت فقط‌افزودن).` : `اسلاگ «${fields.slug}» قبلاً وجود دارد — رد شد.`],
          warnings,
        });
        continue;
      }
      // update
      const patch = buildPatch(fields, provided, { category, category_id });
      if (provided.has("slug") && bySku && bySku.slug && fields.slug && fields.slug !== bySku.slug) {
        warnings.push("تغییر اسلاگ هنگام بروزرسانی اعمال نمی‌شود (آدرس صفحه ثابت می‌ماند).");
      }
      if (!Object.keys(patch).length) {
        plans.push({ rowNum, action: "skip", id: match.id, messages: ["فیلدی برای بروزرسانی ارسال نشده."], warnings });
        continue;
      }
      plans.push({ rowNum, action: "update", id: match.id, write: patch, messages: [bySku ? `بروزرسانی با کد ${fields.sku}` : `بروزرسانی با اسلاگ ${fields.slug}`], warnings });
      continue;
    }

    // no match
    if (mode === "update") {
      plans.push({ rowNum, action: "skip", messages: ["محصولی با این کد/اسلاگ پیدا نشد — رد شد (حالت فقط‌بروزرسانی)."], warnings });
      continue;
    }

    // create — explicit slug collision was already a "match"; remaining
    // collisions come from derived slugs, which we suffix silently.
    const explicit = provided.has("slug") && fields.slug;
    let base = fields.slug || slugify(fields.name_en || "") || slugify(fields.sku || "");
    if (!base) base = `product-${Date.now()}`;
    const finalSlug = uniqueSlug(base);
    if (explicit && finalSlug !== fields.slug) {
      warnings.push(`اسلاگ «${fields.slug}» گرفته شده بود؛ «${finalSlug}» استفاده می‌شود.`);
    }

    const write = buildCreateRow(fields, { category, category_id, slug: finalSlug });
    plans.push({ rowNum, action: "create", write, slug: finalSlug, messages, warnings });
  }

  return { plans, categoriesToCreate: [...categoriesToCreate.values()] };
}

function buildCreateRow(fields, { category, category_id, slug }) {
  return {
    name_fa: fields.name_fa, name_en: fields.name_en,
    name_ru: fields.name_ru, name_tg: fields.name_tg,
    description_fa: fields.description_fa, description_en: fields.description_en,
    description_ru: fields.description_ru, description_tg: fields.description_tg,
    slug,
    sku: fields.sku,
    brand: fields.brand,
    category, category_id,
    price: fields.price,
    unit: fields.unit,
    min_order_qty: fields.min_order_qty ?? 1,
    in_stock: fields.in_stock ?? true,
    badge: fields.badge ?? null,
    is_featured: fields.is_featured ?? false,
    is_active: fields.is_active ?? true,
    image_url: fields.image_url ?? null,
    gallery_urls: fields.gallery_urls ?? [],
    specs: parseSpecs(fields.specs ?? null),
    tags: fields.tags ?? [],
    seo_title: fields.seo_title, seo_description: fields.seo_description,
    brochure_url: fields.brochure_url ?? null,
  };
}

// Update patch: ONLY fields present in the source row. Empty cells never
// overwrite existing data.
function buildPatch(fields, provided, { category, category_id }) {
  const patch = {};
  const direct = ["name_fa", "name_en", "name_ru", "name_tg",
                  "description_fa", "description_en", "description_ru", "description_tg",
                  "brand", "unit", "badge", "image_url", "brochure_url",
                  "seo_title", "seo_description", "min_order_qty",
                  "in_stock", "is_active", "is_featured", "tags", "gallery_urls"];
  for (const k of direct) if (provided.has(k)) patch[k] = fields[k];
  if (provided.has("specs")) patch.specs = parseSpecs(fields.specs);
  if (provided.has("category_slug")) { patch.category = category; patch.category_id = category_id; }
  if (fields.price_on_request) patch.price = null;
  else if (provided.has("price") && fields.price != null) patch.price = fields.price;
  return patch;
}

// In-file duplicate detection for instant client-side preview (same logic the
// server applies row-by-row during planning).
export function findInFileDuplicates(normRows) {
  const bySku = new Map();
  const dups = new Set();
  for (const r of normRows) {
    const key = r.fields.sku ? r.fields.sku.toLowerCase() : null;
    if (!key) continue;
    if (bySku.has(key)) dups.add(r.rowNum);
    else bySku.set(key, r.rowNum);
  }
  return dups;
}

// Summary counts from a list of plans (used by preview + final report).
export function summarizePlans(plans) {
  const s = { total: plans.length, create: 0, update: 0, skip: 0, error: 0, warnings: 0 };
  for (const p of plans) {
    s[p.action] = (s[p.action] || 0) + 1;
    if (p.warnings?.length) s.warnings += 1;
  }
  return s;
}
