// lib/supabase.js
// Data layer for the Medoria B2B catalog.
//   • category_id filtering (falls back to the legacy `category` slug string)
//   • sort: default | newest | price_asc | price_desc | popular
//   • getCategories / getCategoryBySlug / getProductBySlug / getRelatedProducts
//   • recordProductView (atomic) + createQuoteRequest (persists B2B inquiries)
// Back-compat aliases getProduct / getRelated are kept so older imports work.
import { createClient } from "@supabase/supabase-js";

// Resilient env handling: never throw at import time. Real values come from
// .env.local in dev and the platform env in production; the placeholders only
// keep `createClient` from throwing during `next build` when env is absent.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "public-anon-placeholder-key";

export const isSupabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export const supabase = createClient(url, key, {
  auth: { persistSession: false },
});

// ── Categories ───────────────────────────────────────────────────────────────
let _catCache = null;
export async function getCategories() {
  if (_catCache) return _catCache;
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) { console.error("getCategories", error); return []; }
  _catCache = data || [];
  return _catCache;
}

export async function getCategoryBySlug(slug) {
  const cats = await getCategories();
  return cats.find((c) => c.slug === slug) || null;
}

// ── Products ─────────────────────────────────────────────────────────────────
// `is_active` hides archived products on the PUBLIC site, but the column only
// exists after migration 04. We auto-detect once: if filtering by it errors with
// "undefined column" (42703), we remember that and stop adding the filter, so the
// public site keeps working unchanged before the migration is applied.
let _hasIsActive = null; // null = unknown, true/false once detected

async function execProducts(build, label = "getProducts") {
  if (_hasIsActive !== false) {
    const { data, error } = await build(true);
    if (!error) { _hasIsActive = true; return data || []; }
    if (error.code === "42703") { _hasIsActive = false; } // column missing → retry without
    else { console.error(label, error); return []; }
  }
  const { data, error } = await build(false);
  if (error) { console.error(label, error); return []; }
  return data || [];
}

// opts: { categoryId, categorySlug, search, brand, badge, stockOnly, featured,
//         sort, limit }
//   sort ∈ "default" | "newest" | "price_asc" | "price_desc" | "popular"
export async function getProducts(opts = {}) {
  const {
    categoryId, categorySlug, search, brand, badge,
    stockOnly, featured, sort = "default", limit,
  } = opts;

  // Resolve slug → id up front so the query builder can stay synchronous.
  let resolvedCatId = categoryId;
  let fallbackCatSlug = null;
  if (!resolvedCatId && categorySlug) {
    const cat = await getCategoryBySlug(categorySlug);
    if (cat?.id != null) resolvedCatId = cat.id;
    else fallbackCatSlug = categorySlug; // pre-migration fallback
  }

  const build = (withActive) => {
    let q = supabase.from("products").select("*");
    if (resolvedCatId)        q = q.eq("category_id", resolvedCatId);
    else if (fallbackCatSlug) q = q.eq("category", fallbackCatSlug);
    if (brand)     q = q.eq("brand", brand);
    if (stockOnly) q = q.eq("in_stock", true);
    if (featured)  q = q.eq("is_featured", true);
    if (withActive) q = q.eq("is_active", true);
    if (badge === "none") q = q.is("badge", null);
    else if (badge)       q = q.eq("badge", badge);
    if (search) {
      q = q.or(
        [
          `name_ru.ilike.%${search}%`, `name_tg.ilike.%${search}%`,
          `name_en.ilike.%${search}%`, `name_fa.ilike.%${search}%`,
          `sku.ilike.%${search}%`,     `brand.ilike.%${search}%`,
        ].join(",")
      );
    }
    // Sort (DB-side). Nulls-last keeps "request price" items from topping price sorts.
    switch (sort) {
      case "newest":     q = q.order("created_at", { ascending: false }); break;
      case "price_asc":  q = q.order("price", { ascending: true,  nullsFirst: false }); break;
      case "price_desc": q = q.order("price", { ascending: false, nullsFirst: false }); break;
      case "popular":    q = q.order("views", { ascending: false })
                              .order("is_featured", { ascending: false }); break;
      default:           q = q.order("is_featured", { ascending: false })
                              .order("id", { ascending: true });
    }
    if (limit) q = q.limit(limit);
    return q;
  };

  return execProducts(build, "getProducts");
}

export async function getProductBySlug(slug) {
  const isNumeric = /^\d+$/.test(String(slug));
  const field = isNumeric ? "id" : "slug";
  const { data, error } = await supabase
    .from("products").select("*").eq(field, slug).single();
  if (error) { console.error("getProductBySlug", error); return null; }
  return data;
}

export async function getRelatedProducts(product, n = 4) {
  if (!product) return [];
  // Prefer the relation; fall back to legacy string during transition.
  const col = product.category_id != null ? "category_id" : "category";
  const val = product.category_id != null ? product.category_id : product.category;
  if (val == null) return [];
  const build = (withActive) => {
    let q = supabase.from("products").select("*").eq(col, val).neq("id", product.id);
    if (withActive) q = q.eq("is_active", true);
    return q.order("is_featured", { ascending: false }).limit(n);
  };
  return execProducts(build, "getRelatedProducts");
}

// Atomic popularity counter (uses the SQL RPC from migration 03).
export async function recordProductView(productId) {
  if (!productId) return;
  const { error } = await supabase.rpc("increment_product_views", { p_id: productId });
  if (error) console.error("recordProductView", error);
}

// ── Quote requests (persists the B2B inquiry) ────────────────────────────────
// payload: { name, phone, organization, product, quantity, message,
//            preferredContact: 'whatsapp'|'telegram'|'phone', language }
export async function createQuoteRequest(payload) {
  const { product } = payload;
  const row = {
    name:              payload.name,
    phone:             payload.phone || null,
    organization:      payload.organization || null,
    product_id:        product?.id ?? null,
    product_name:      product ? (product.name_en || product[`name_${payload.language}`] || null) : null,
    product_sku:       product?.sku ?? null,
    quantity:          payload.quantity ? Number(payload.quantity) : null,
    message:           payload.message || null,
    preferred_contact: payload.preferredContact || "whatsapp",
    language:          payload.language || null,
  };
  const { data, error } = await supabase
    .from("quote_requests").insert(row).select().single();
  if (error) { console.error("createQuoteRequest", error); return { ok: false, error }; }
  return { ok: true, data };
}

// ── Image URL helper ─────────────────────────────────────────────────────────
export function imageUrl(path) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const { data } = supabase.storage.from("product-images").getPublicUrl(path);
  return data.publicUrl;
}

// ── Back-compat aliases (so existing imports keep working during migration) ──
export const getProduct = getProductBySlug;
export const getRelated = getRelatedProducts;
