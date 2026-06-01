"use server";
// lib/operator/actions.js — operator panel mutations.
// Every action: (1) verifies the session, (2) uses the service-role client
// (server-only), (3) validates/sanitises input, (4) returns a friendly result.
// Pre-migration safe: writes that hit a missing new column retry without it.
import { revalidatePath } from "next/cache";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";
import { getSession } from "@/lib/operator/auth";
import { LOCALES } from "@/lib/i18n";
import {
  slugify, str, num, bool, strArray, parseSpecs,
  MAX_IMAGE_BYTES, ALLOWED_IMAGE_TYPES, safeFileName,
} from "@/lib/operator/validation";

const QUOTE_STATUSES = ["new", "contacted", "in_progress", "quoted", "closed", "spam"];
const PRODUCT_NEW_COLS = ["is_active", "tags", "seo_title", "seo_description"];
const CATEGORY_NEW_COLS = ["is_active", "is_featured"];
const QUOTE_NEW_COLS = ["internal_notes", "source_url"];

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
  if (error.code === "42703" || error.code === "PGRST204" || /column .* does not exist/i.test(msg))
    return "ستون موردنیاز در پایگاه داده موجود نیست. مایگریشن‌های ۰۴ و ۰۵ را در Supabase اجرا کنید.";
  if (error.code === "23514") return "این مقدار وضعیت تا قبل از اجرای مایگریشن ۰۵ مجاز نیست.";
  if (error.code === "23505" || /duplicate key/i.test(msg)) return "مقدار تکراری است (slug یا SKU قبلاً ثبت شده).";
  return "ذخیره ناموفق بود. دوباره تلاش کنید.";
}

function revalidatePublic(slug) {
  try {
    for (const l of LOCALES) {
      revalidatePath(`/${l}`);
      revalidatePath(`/${l}/catalog`);
      revalidatePath(`/${l}/categories`);
      if (slug) revalidatePath(`/${l}/catalog/${slug}`);
    }
  } catch { /* dynamic routes — no-op */ }
}

// Insert/update with a one-shot retry that strips columns added by later
// migrations, so the panel still works before 04/05 are applied.
async function writeRow(admin, table, row, id, newCols) {
  const run = (r) =>
    id ? admin.from(table).update(r).eq("id", id).select().single()
       : admin.from(table).insert(r).select().single();
  let res = await run(row);
  if (res.error && (res.error.code === "42703" || res.error.code === "PGRST204")) {
    const stripped = { ...row };
    for (const c of newCols) delete stripped[c];
    res = await run(stripped);
  }
  return res;
}

async function ensureUniqueSlug(admin, base, excludeId) {
  const baseSlug = base || `product-${Date.now()}`;
  let candidate = baseSlug;
  for (let i = 2; i < 60; i++) {
    const { data } = await admin.from("products").select("id").eq("slug", candidate).limit(1);
    const taken = (data || []).some((r) => r.id !== excludeId);
    if (!taken) return candidate;
    candidate = `${baseSlug}-${i}`;
  }
  return `${baseSlug}-${Date.now()}`;
}

function buildProductRow(input) {
  const nameEn = str(input.name_en);
  let base = slugify(input.slug || nameEn || "");
  if (!base) base = slugify(str(input.sku) || "");
  return {
    name_en: nameEn,
    name_ru: str(input.name_ru),
    name_tg: str(input.name_tg),
    name_fa: str(input.name_fa),
    description_en: str(input.description_en),
    description_ru: str(input.description_ru),
    description_tg: str(input.description_tg),
    description_fa: str(input.description_fa),
    slug: base,
    sku: str(input.sku),
    brand: str(input.brand),
    category: str(input.category),
    category_id: num(input.category_id),
    price: bool(input.priceOnRequest) ? null : num(input.price, { min: 0 }),
    unit: str(input.unit),
    min_order_qty: num(input.min_order_qty, { min: 1 }) ?? 1,
    in_stock: bool(input.in_stock),
    badge: str(input.badge),
    is_featured: bool(input.is_featured),
    is_active: input.is_active === undefined ? true : bool(input.is_active),
    image_url: str(input.image_url),
    gallery_urls: strArray(input.gallery_urls),
    specs: parseSpecs(input.specs),
    brochure_url: str(input.brochure_url),
    tags: strArray(input.tags),
    seo_title: str(input.seo_title),
    seo_description: str(input.seo_description),
  };
}

// ── Products ────────────────────────────────────────────────────────────────
export async function createProduct(input) {
  const a = await authed();
  if (!a.ok) return a;
  const row = buildProductRow(input);
  if (!row.name_en && !row.name_fa) return { ok: false, error: "حداقل نام انگلیسی یا فارسی محصول لازم است." };
  row.slug = await ensureUniqueSlug(a.admin, row.slug, null);
  const { data, error } = await writeRow(a.admin, "products", row, null, PRODUCT_NEW_COLS);
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
  const { data, error } = await writeRow(a.admin, "products", row, id, PRODUCT_NEW_COLS);
  if (error) return { ok: false, error: friendly(error) };
  revalidatePublic(data?.slug);
  return { ok: true, id: data?.id, slug: data?.slug };
}

export async function setProductActive(id, active) {
  const a = await authed();
  if (!a.ok) return a;
  const { error } = await a.admin.from("products").update({ is_active: bool(active) }).eq("id", id);
  if (error) return { ok: false, error: friendly(error) };
  revalidatePublic();
  return { ok: true };
}

export async function duplicateProduct(id) {
  const a = await authed();
  if (!a.ok) return a;
  const { data: src, error: e1 } = await a.admin.from("products").select("*").eq("id", id).single();
  if (e1 || !src) return { ok: false, error: "محصول یافت نشد." };
  const copy = { ...src };
  delete copy.id; delete copy.created_at; delete copy.updated_at; delete copy.views;
  copy.is_active = false; // duplicates start hidden until reviewed
  if (copy.sku) copy.sku = `${copy.sku}-COPY`;
  for (const k of ["name_en", "name_fa", "name_ru", "name_tg"]) if (copy[k]) copy[k] = `${copy[k]} (کپی)`;
  copy.slug = await ensureUniqueSlug(a.admin, slugify(`${src.slug || src.sku || "product"}-copy`), null);
  const { data, error } = await writeRow(a.admin, "products", copy, null, PRODUCT_NEW_COLS);
  if (error) return { ok: false, error: friendly(error) };
  return { ok: true, id: data?.id };
}

// ── Categories ────────────────────────────────────────────────────────────────
function buildCategoryRow(input) {
  return {
    slug: slugify(input.slug),
    name_fa: str(input.name_fa),
    name_en: str(input.name_en),
    name_ru: str(input.name_ru),
    name_tg: str(input.name_tg),
    description_fa: str(input.description_fa),
    description_en: str(input.description_en),
    icon: str(input.icon),
    image_url: str(input.image_url),
    sort_order: num(input.sort_order, { min: 0 }) ?? 0,
    is_active: input.is_active === undefined ? true : bool(input.is_active),
    is_featured: bool(input.is_featured),
  };
}

export async function createCategory(input) {
  const a = await authed();
  if (!a.ok) return a;
  const row = buildCategoryRow(input);
  if (!row.slug) return { ok: false, error: "slug دسته لازم است (حروف لاتین)." };
  if (!row.name_fa && !row.name_en) return { ok: false, error: "حداقل نام فارسی یا انگلیسی دسته لازم است." };
  const { data, error } = await writeRow(a.admin, "categories", row, null, CATEGORY_NEW_COLS);
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
  const { error } = await writeRow(a.admin, "categories", row, id, CATEGORY_NEW_COLS);
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
  const { error } = await a.admin.from("categories").update(patch).eq("id", id);
  if (error) return { ok: false, error: friendly(error) };
  revalidatePublic();
  return { ok: true };
}

// ── Quote requests ──────────────────────────────────────────────────────────
export async function updateQuoteStatus(id, status) {
  const a = await authed();
  if (!a.ok) return a;
  if (!QUOTE_STATUSES.includes(status)) return { ok: false, error: "وضعیت نامعتبر است." };
  const { error } = await a.admin.from("quote_requests").update({ status }).eq("id", id);
  if (error) return { ok: false, error: friendly(error) };
  return { ok: true };
}

export async function updateQuoteNotes(id, notes) {
  const a = await authed();
  if (!a.ok) return a;
  const { error } = await a.admin
    .from("quote_requests")
    .update({ internal_notes: str(notes) })
    .eq("id", id);
  if (error) return { ok: false, error: friendly(error) };
  return { ok: true };
}

// ── Image upload (server-side; service role) ──────────────────────────────────
export async function uploadProductImage(formData) {
  const a = await authed();
  if (!a.ok) return a;
  const file = formData?.get?.("file");
  if (!file || typeof file === "string") return { ok: false, error: "فایلی انتخاب نشده است." };
  if (file.size > MAX_IMAGE_BYTES) return { ok: false, error: "حجم تصویر بیش از ۵ مگابایت است." };
  if (!ALLOWED_IMAGE_TYPES.includes(file.type))
    return { ok: false, error: "فقط تصویر JPG/PNG/WEBP/AVIF مجاز است." };
  const path = `products/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeFileName(file.name)}`;
  const { error } = await a.admin.storage
    .from("product-images")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) {
    const msg = /bucket/i.test(String(error.message)) ? "باکت product-images وجود ندارد. مایگریشن ۰۶ را اجرا کنید." : "آپلود ناموفق بود.";
    return { ok: false, error: msg };
  }
  const { data } = a.admin.storage.from("product-images").getPublicUrl(path);
  return { ok: true, path, url: data.publicUrl };
}
