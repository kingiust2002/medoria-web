"use server";
// lib/beauty/operator/actions.js — BEAUTY operator panel mutations.
// Same discipline as lib/operator/actions.js: every action (1) verifies the
// BEAUTY session, (2) uses the service-role client (server-only), (3)
// validates/sanitises input, (4) returns a friendly result. Only beauty_*
// tables and the beauty-product-images bucket are ever touched — the Health
// catalog is out of reach by construction.
import { revalidatePath } from "next/cache";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";
import { getSession } from "@/lib/beauty/operator/auth";
import { LOCALES } from "@/lib/i18n";
import {
  slugify, str, num, bool, strArray, parseSpecs,
  MAX_IMAGE_BYTES, ALLOWED_IMAGE_TYPES, safeFileName, safeUrlRef, sniffImageType,
} from "@/lib/operator/validation";

const QUOTE_STATUSES = ["new", "contacted", "in_progress", "quoted", "closed", "spam"];
const WORLD_SLUGS = ["skincare", "makeup", "tools"];

// ── helpers ───────────────────────────────────────────────────────────────────
async function authed() {
  const session = await getSession();
  if (!session) return { ok: false, error: "نشست معتبر نیست. دوباره وارد شوید." };
  const admin = getAdminClient();
  if (!admin) return { ok: false, error: "کلید سرویس Supabase تنظیم نشده است (SUPABASE_SERVICE_ROLE_KEY)." };
  return { ok: true, admin };
}

function friendly(error) {
  if (!error) return "خطای ناشناخته.";
  const msg = String(error.message || error);
  if (error.code === "42P01" || /relation .* does not exist/i.test(msg))
    return "جدول‌های Beauty هنوز ساخته نشده‌اند. مایگریشن ۱۰ را در Supabase اجرا کنید.";
  if (error.code === "42703" || error.code === "PGRST204" || /column .* does not exist/i.test(msg))
    return "ستون موردنیاز در پایگاه داده موجود نیست. مایگریشن ۱۰ را در Supabase اجرا کنید.";
  if (error.code === "23505" || /duplicate key/i.test(msg)) return "مقدار تکراری است (slug یا SKU قبلاً ثبت شده).";
  return "ذخیره ناموفق بود. دوباره تلاش کنید.";
}

function revalidatePublic(slug) {
  try {
    for (const l of LOCALES) {
      revalidatePath(`/beauty/${l}`);
      revalidatePath(`/beauty/${l}/catalog`);
      revalidatePath(`/beauty/${l}/worlds`);
      revalidatePath(`/beauty/${l}/brands`);
      if (slug) revalidatePath(`/beauty/${l}/catalog/${slug}`);
    }
    if (!slug) revalidatePath("/beauty/[lang]/catalog/[slug]", "page");
  } catch { /* dynamic routes — no-op */ }
}

async function ensureUniqueSlug(admin, base, excludeId) {
  const baseSlug = base || `product-${Date.now()}`;
  let candidate = baseSlug;
  for (let i = 2; i < 60; i++) {
    const { data } = await admin.from("beauty_products").select("id").eq("slug", candidate).limit(1);
    const taken = (data || []).some((r) => r.id !== excludeId);
    if (!taken) return candidate;
    candidate = `${baseSlug}-${i}`;
  }
  return `${baseSlug}-${Date.now()}`;
}

// Field length caps for manual entry — same spirit as the CSV import CAPS, so
// no path into the DB accepts unbounded payloads.
function buildProductRow(input) {
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

// ── Products ────────────────────────────────────────────────────────────────
export async function createProduct(input) {
  const a = await authed();
  if (!a.ok) return a;
  const row = buildProductRow(input);
  if (!row.name_en && !row.name_fa) return { ok: false, error: "حداقل نام انگلیسی یا فارسی محصول لازم است." };
  row.slug = await ensureUniqueSlug(a.admin, row.slug, null);
  const { data, error } = await a.admin.from("beauty_products").insert(row).select().single();
  if (error) return { ok: false, error: friendly(error) };
  revalidatePublic(data?.slug);
  return { ok: true, id: data?.id, slug: data?.slug };
}

export async function updateProduct(id, input) {
  const a = await authed();
  if (!a.ok) return a;
  if (!id) return { ok: false, error: "شناسه محصول نامعتبر است." };
  const row = buildProductRow(input);
  if (!row.name_en && !row.name_fa) return { ok: false, error: "حداقل نام انگلیسی یا فارسی محصول لازم است." };
  row.slug = await ensureUniqueSlug(a.admin, row.slug, id);
  const { data, error } = await a.admin.from("beauty_products").update(row).eq("id", id).select().single();
  if (error) return { ok: false, error: friendly(error) };
  revalidatePublic(data?.slug);
  return { ok: true, id: data?.id, slug: data?.slug };
}

export async function setProductActive(id, active) {
  const a = await authed();
  if (!a.ok) return a;
  const { error } = await a.admin.from("beauty_products").update({ is_active: bool(active) }).eq("id", id);
  if (error) return { ok: false, error: friendly(error) };
  revalidatePublic();
  return { ok: true };
}

export async function duplicateProduct(id) {
  const a = await authed();
  if (!a.ok) return a;
  const { data: src, error: e1 } = await a.admin.from("beauty_products").select("*").eq("id", id).single();
  if (e1 || !src) return { ok: false, error: "محصول یافت نشد." };
  const copy = { ...src };
  delete copy.id; delete copy.created_at; delete copy.updated_at; delete copy.views;
  copy.is_active = false; // duplicates start hidden until reviewed
  if (copy.sku) copy.sku = `${copy.sku}-COPY`;
  for (const k of ["name_en", "name_fa", "name_ru", "name_tg"]) if (copy[k]) copy[k] = `${copy[k]} (کپی)`;
  copy.slug = await ensureUniqueSlug(a.admin, slugify(`${src.slug || src.sku || "product"}-copy`), null);
  const { data, error } = await a.admin.from("beauty_products").insert(copy).select().single();
  if (error) return { ok: false, error: friendly(error) };
  return { ok: true, id: data?.id };
}

// Inline quick-edit from the product list (single field patches).
export async function quickUpdateProduct(id, patch = {}) {
  const a = await authed();
  if (!a.ok) return a;
  if (!id) return { ok: false, error: "شناسه نامعتبر است." };
  const allowed = {};
  if ("in_stock" in patch)    allowed.in_stock = bool(patch.in_stock);
  if ("is_featured" in patch) allowed.is_featured = bool(patch.is_featured);
  if ("is_active" in patch)   allowed.is_active = bool(patch.is_active);
  if ("price" in patch)       allowed.price = patch.price === null ? null : num(patch.price, { min: 0 });
  if ("brand" in patch)       allowed.brand = patch.brand === null ? null : str(patch.brand, 120);
  if (!Object.keys(allowed).length) return { ok: false, error: "تغییری اعمال نشد." };
  const { error } = await a.admin.from("beauty_products").update(allowed).eq("id", id);
  if (error) return { ok: false, error: friendly(error) };
  revalidatePublic();
  return { ok: true };
}

// Bulk actions on multiple products at once.
export async function bulkUpdateProducts(ids, patch = {}) {
  const a = await authed();
  if (!a.ok) return a;
  const list = (Array.isArray(ids) ? ids : []).filter((x) => x != null);
  if (!list.length) return { ok: false, error: "هیچ محصولی انتخاب نشده است." };
  const allowed = {};
  if ("is_active" in patch) allowed.is_active = bool(patch.is_active);
  if (patch.requestPrice)   allowed.price = null;
  if (patch.category_id !== undefined) {
    allowed.category_id = num(patch.category_id);
    allowed.category = str(patch.category);
  }
  if (patch.brand !== undefined) allowed.brand = patch.brand === null ? null : str(patch.brand, 120);
  if (!Object.keys(allowed).length) return { ok: false, error: "عملیاتی انتخاب نشده است." };
  const { error } = await a.admin.from("beauty_products").update(allowed).in("id", list);
  if (error) return { ok: false, error: friendly(error) };
  revalidatePublic();
  return { ok: true, count: list.length };
}

// ── Categories ────────────────────────────────────────────────────────────────
function buildCategoryRow(input) {
  const row = {
    slug: slugify(input.slug),
    world: WORLD_SLUGS.includes(input.world) ? input.world : null,
    name_fa: str(input.name_fa, 200),
    name_en: str(input.name_en, 200),
    name_ru: str(input.name_ru, 200),
    name_tg: str(input.name_tg, 200),
    description_fa: str(input.description_fa, 2000),
    description_en: str(input.description_en, 2000),
    icon: str(input.icon, 60),
    image_url: safeUrlRef(input.image_url),
    sort_order: num(input.sort_order, { min: 0 }) ?? 0,
    is_active: input.is_active === undefined ? true : bool(input.is_active),
    is_featured: bool(input.is_featured),
  };
  // Tree columns (migration 12) — only touched when the caller supplies them,
  // so pre-tree callers (and pre-migration DBs) are unaffected.
  if (input.parent_id !== undefined) row.parent_id = input.parent_id == null ? null : Number(input.parent_id);
  if (input.level !== undefined) row.level = num(input.level, { min: 1 }) ?? 1;
  return row;
}

// Toggle a category AND its whole subtree active/inactive in one write — lets
// the owner hide an entire department or group from the panel with one click.
export async function setCategorySubtreeActive(id, is_active) {
  const a = await authed();
  if (!a.ok) return a;
  if (!id) return { ok: false, error: "شناسه دسته نامعتبر است." };
  const { data: all, error: readErr } = await a.admin.from("beauty_categories").select("id,parent_id");
  if (readErr) return { ok: false, error: friendly(readErr) };
  const kids = new Map();
  for (const c of all || []) {
    if (!kids.has(c.parent_id)) kids.set(c.parent_id, []);
    kids.get(c.parent_id).push(c.id);
  }
  const ids = [];
  const stack = [Number(id)];
  while (stack.length) {
    const cur = stack.pop();
    ids.push(cur);
    for (const k of kids.get(cur) || []) stack.push(k);
  }
  const { error } = await a.admin.from("beauty_categories").update({ is_active: bool(is_active) }).in("id", ids);
  if (error) return { ok: false, error: friendly(error) };
  revalidatePublic();
  return { ok: true, count: ids.length };
}

export async function createCategory(input) {
  const a = await authed();
  if (!a.ok) return a;
  const row = buildCategoryRow(input);
  if (!row.slug) return { ok: false, error: "slug دسته لازم است (حروف لاتین)." };
  if (!row.name_fa && !row.name_en) return { ok: false, error: "حداقل نام فارسی یا انگلیسی دسته لازم است." };
  const { data, error } = await a.admin.from("beauty_categories").insert(row).select().single();
  if (error) return { ok: false, error: friendly(error) };
  revalidatePublic();
  return { ok: true, id: data?.id, slug: data?.slug };
}

export async function updateCategory(id, input) {
  const a = await authed();
  if (!a.ok) return a;
  if (!id) return { ok: false, error: "شناسه دسته نامعتبر است." };
  const row = buildCategoryRow(input);
  delete row.slug; // slug is the natural/public key — don't rewrite it on edit
  const { error } = await a.admin.from("beauty_categories").update(row).eq("id", id);
  if (error) return { ok: false, error: friendly(error) };
  revalidatePublic();
  return { ok: true };
}

export async function setCategoryFlags(id, { is_active, is_featured }) {
  const a = await authed();
  if (!a.ok) return a;
  const patch = {};
  if (is_active !== undefined) patch.is_active = bool(is_active);
  if (is_featured !== undefined) patch.is_featured = bool(is_featured);
  const { error } = await a.admin.from("beauty_categories").update(patch).eq("id", id);
  if (error) return { ok: false, error: friendly(error) };
  revalidatePublic();
  return { ok: true };
}

// Safe category delete: refuses while products are attached unless a target
// category is given; then moves products and deletes. Never deletes products.
export async function deleteCategorySafe(id, moveToId) {
  const a = await authed();
  if (!a.ok) return a;
  if (!id) return { ok: false, error: "شناسه دسته نامعتبر است." };

  const { data: cat } = await a.admin.from("beauty_categories").select("id,slug").eq("id", id).single();
  if (!cat) return { ok: false, error: "دسته پیدا نشد." };

  const { data: attached } = await a.admin
    .from("beauty_products")
    .select("id")
    .eq("category_id", cat.id);
  const count = (attached || []).length;

  if (count > 0) {
    if (!moveToId) return { ok: false, needsMove: true, count, error: `این دسته ${count} محصول دارد. اول مقصد انتقال را انتخاب کنید.` };
    if (String(moveToId) === String(id)) return { ok: false, error: "مقصد انتقال نمی‌تواند خود دسته باشد." };
    const { data: target } = await a.admin.from("beauty_categories").select("id,slug").eq("id", moveToId).single();
    if (!target) return { ok: false, error: "دسته مقصد پیدا نشد." };
    const ids = (attached || []).map((p) => p.id);
    const { error: moveErr } = await a.admin
      .from("beauty_products")
      .update({ category_id: target.id, category: target.slug })
      .in("id", ids);
    if (moveErr) return { ok: false, error: "انتقال محصولات ناموفق بود — دسته حذف نشد." };
  }

  const { error: delErr } = await a.admin.from("beauty_categories").delete().eq("id", id);
  if (delErr) return { ok: false, error: "حذف دسته ناموفق بود." };
  revalidatePublic();
  return { ok: true, moved: count };
}

// ── Brands ("Maisons" directory) ──────────────────────────────────────────────
// A brand row carries the OFFICIAL logo the operator uploads — the app never
// scrapes or fabricates brand marks. Brand ↔ products is the text join
// (beauty_products.brand == beauty_brands.name); brand names are not translated.
function buildBrandRow(input) {
  return {
    slug: slugify(input.slug),
    name: str(input.name, 120),
    tagline_fa: str(input.tagline_fa, 300),
    tagline_en: str(input.tagline_en, 300),
    tagline_ru: str(input.tagline_ru, 300),
    tagline_tg: str(input.tagline_tg, 300),
    logo_url: safeUrlRef(input.logo_url),
    website: safeUrlRef(input.website),
    sort_order: num(input.sort_order, { min: 0 }) ?? 0,
    is_active: input.is_active === undefined ? true : bool(input.is_active),
    is_featured: bool(input.is_featured),
  };
}

export async function createBrand(input) {
  const a = await authed();
  if (!a.ok) return a;
  const row = buildBrandRow(input);
  if (!row.name) return { ok: false, error: "نام برند لازم است." };
  if (!row.slug) row.slug = slugify(row.name) || `brand-${Date.now()}`;
  const { data, error } = await a.admin.from("beauty_brands").insert(row).select().single();
  if (error) return { ok: false, error: friendlyBrand(error) };
  revalidatePublic();
  return { ok: true, id: data?.id, slug: data?.slug };
}

export async function updateBrand(id, input) {
  const a = await authed();
  if (!a.ok) return a;
  if (!id) return { ok: false, error: "شناسه برند نامعتبر است." };
  const row = buildBrandRow(input);
  delete row.slug; // slug is the public key — fixed after creation
  if (!row.name) return { ok: false, error: "نام برند لازم است." };
  const { error } = await a.admin.from("beauty_brands").update(row).eq("id", id);
  if (error) return { ok: false, error: friendlyBrand(error) };
  revalidatePublic();
  return { ok: true };
}

export async function setBrandFlags(id, { is_active, is_featured }) {
  const a = await authed();
  if (!a.ok) return a;
  const patch = {};
  if (is_active !== undefined) patch.is_active = bool(is_active);
  if (is_featured !== undefined) patch.is_featured = bool(is_featured);
  const { error } = await a.admin.from("beauty_brands").update(patch).eq("id", id);
  if (error) return { ok: false, error: friendlyBrand(error) };
  revalidatePublic();
  return { ok: true };
}

export async function deleteBrand(id) {
  const a = await authed();
  if (!a.ok) return a;
  if (!id) return { ok: false, error: "شناسه برند نامعتبر است." };
  // Deleting a brand row never touches products (their text `brand` stays).
  const { error } = await a.admin.from("beauty_brands").delete().eq("id", id);
  if (error) return { ok: false, error: friendlyBrand(error) };
  revalidatePublic();
  return { ok: true };
}

function friendlyBrand(error) {
  const msg = String(error?.message || error);
  if (error?.code === "42P01" || /relation .* does not exist/i.test(msg))
    return "جدول برندها هنوز ساخته نشده است. مایگریشن ۱۱ را در Supabase اجرا کنید.";
  if (error?.code === "23505" || /duplicate key/i.test(msg)) return "این slug قبلاً ثبت شده است.";
  return friendly(error);
}

// Official brand logo upload — Beauty's own logo bucket, service role, magic-byte
// sniffed (same discipline as product images). The operator supplies the real,
// licensed logo file; nothing here generates or fetches a mark.
export async function uploadBrandLogo(formData) {
  const a = await authed();
  if (!a.ok) return a;
  const file = formData?.get?.("file");
  if (!file || typeof file === "string") return { ok: false, error: "فایلی انتخاب نشده است." };
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: "حجم لوگو بیش از ۵ مگابایت است." };
  if (!ALLOWED_IMAGE_TYPES.includes(file.type))
    return { ok: false, error: "فقط تصویر JPG/PNG/WEBP/AVIF مجاز است." };
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const sniffed = sniffImageType(head);
  if (!sniffed) return { ok: false, error: "محتوای فایل یک تصویر معتبر نیست." };
  const path = `logos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeFileName(file.name)}`;
  const { error } = await a.admin.storage
    .from("beauty-brand-logos")
    .upload(path, file, { contentType: sniffed, upsert: false });
  if (error) {
    const msg = /bucket/i.test(String(error.message)) ? "باکت beauty-brand-logos وجود ندارد. مایگریشن ۱۱ را اجرا کنید." : "آپلود ناموفق بود.";
    return { ok: false, error: msg };
  }
  const { data } = a.admin.storage.from("beauty-brand-logos").getPublicUrl(path);
  return { ok: true, path, url: data.publicUrl };
}

// ── Quote requests ──────────────────────────────────────────────────────────
export async function updateQuoteStatus(id, status) {
  const a = await authed();
  if (!a.ok) return a;
  if (!QUOTE_STATUSES.includes(status)) return { ok: false, error: "وضعیت نامعتبر است." };
  const { error } = await a.admin.from("beauty_quote_requests").update({ status }).eq("id", id);
  if (error) return { ok: false, error: friendly(error) };
  return { ok: true };
}

export async function updateQuoteNotes(id, notes) {
  const a = await authed();
  if (!a.ok) return a;
  const { error } = await a.admin
    .from("beauty_quote_requests")
    .update({ internal_notes: str(notes, 4000) })
    .eq("id", id);
  if (error) return { ok: false, error: friendly(error) };
  return { ok: true };
}

// ── Image upload (server-side; service role; Beauty's own bucket) ────────────
export async function uploadProductImage(formData) {
  const a = await authed();
  if (!a.ok) return a;
  const file = formData?.get?.("file");
  if (!file || typeof file === "string") return { ok: false, error: "فایلی انتخاب نشده است." };
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: "حجم تصویر بیش از ۵ مگابایت است." };
  if (!ALLOWED_IMAGE_TYPES.includes(file.type))
    return { ok: false, error: "فقط تصویر JPG/PNG/WEBP/AVIF مجاز است." };
  // Authoritative check: sniff the real magic bytes and derive the stored
  // Content-Type from them — never trust the client-declared file.type.
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const sniffed = sniffImageType(head);
  if (!sniffed) return { ok: false, error: "محتوای فایل یک تصویر معتبر نیست." };
  const path = `products/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeFileName(file.name)}`;
  const { error } = await a.admin.storage
    .from("beauty-product-images")
    .upload(path, file, { contentType: sniffed, upsert: false });
  if (error) {
    const msg = /bucket/i.test(String(error.message)) ? "باکت beauty-product-images وجود ندارد. مایگریشن ۱۰ را اجرا کنید." : "آپلود ناموفق بود.";
    return { ok: false, error: msg };
  }
  const { data } = a.admin.storage.from("beauty-product-images").getPublicUrl(path);
  return { ok: true, path, url: data.publicUrl };
}

// ── Auto-translation (Google Cloud Translation v2; API key stays server-side) ──
export async function translateProductFields({ source = "fa", name = "", description = "" } = {}) {
  const session = await getSession();
  if (!session) return { ok: false, error: "نشست نامعتبر است. دوباره وارد شوید." };
  const key = process.env.GOOGLE_TRANSLATE_API_KEY;
  if (!key) return { ok: false, error: "کلید Google Translate تنظیم نشده است (GOOGLE_TRANSLATE_API_KEY)." };

  const LANGS = ["fa", "en", "ru", "tg"];
  if (!LANGS.includes(source)) return { ok: false, error: "زبان مبدأ نامعتبر است." };
  const targets = LANGS.filter((l) => l !== source);

  // Length caps double as a cost guard on the paid translation API.
  const items = [];
  const nameText = String(name).trim().slice(0, 300);
  const descText = String(description).trim().slice(0, 5000);
  if (nameText) items.push({ field: "name", text: nameText });
  if (descText) items.push({ field: "description", text: descText });
  if (!items.length) return { ok: false, error: "متنی برای ترجمه وجود ندارد." };

  const translations = {};
  try {
    for (const target of targets) {
      const resp = await fetch(`https://translation.googleapis.com/language/translate/v2?key=${key}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: items.map((i) => i.text), source, target, format: "text" }),
      });
      const json = await resp.json().catch(() => ({}));
      if (!resp.ok || !json?.data?.translations) {
        return { ok: false, error: "سرویس ترجمه در دسترس نیست. دوباره تلاش کنید." };
      }
      translations[target] = {};
      items.forEach((it, idx) => {
        translations[target][it.field] = json.data.translations[idx]?.translatedText || "";
      });
    }
    return { ok: true, source, translations };
  } catch {
    return { ok: false, error: "ارتباط با سرویس ترجمه برقرار نشد." };
  }
}
