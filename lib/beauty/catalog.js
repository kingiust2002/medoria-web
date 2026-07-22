// lib/beauty/catalog.js
// PUBLIC data layer for the Medoria Beauty catalog (beauty_* tables).
// Mirrors lib/supabase.js's proven shape, minus the legacy fallbacks — the
// Beauty schema is born complete (migration 10), so is_active and category_id
// always exist. Reads use the shared anon client; RLS already restricts anon
// reads to active rows, so hidden products/categories never leak.
//
// Taxonomy (Sephora-style, two levels):
//   world (fixed in code: skincare | makeup | tools) → category (DB, unlimited)
//   → product. Brand is a first-class browse axis on the product row.
import { supabase } from "@/lib/supabase";

const MAX_LIST_ROWS = 500;

// Same PostgREST-safety rules as the Health layer: strip .or() syntax chars,
// escape LIKE wildcards, cap length.
function sanitizeSearchTerm(s) {
  return String(s)
    .slice(0, 80)
    .replace(/[,()"'\\]/g, " ")
    .replace(/[%_]/g, "\\$&")
    .trim();
}

// ── Categories ───────────────────────────────────────────────────────────────
// Short-TTL cache — absorbs bursts, picks up operator edits within a minute,
// serves stale data over a broken page on a failed refresh.
const CAT_TTL_MS = 60_000;
let _catCache = { data: null, at: 0 };
export async function getBeautyCategories() {
  const now = Date.now();
  if (_catCache.data && now - _catCache.at < CAT_TTL_MS) return _catCache.data;
  const { data, error } = await supabase
    .from("beauty_categories")
    .select("*")
    .order("sort_order", { ascending: true })
    .limit(MAX_LIST_ROWS);
  if (error) { console.error("getBeautyCategories", error.code || error.message); return _catCache.data || []; }
  _catCache = { data: data || [], at: now };
  return _catCache.data;
}

export async function getBeautyCategoryBySlug(slug) {
  const cats = await getBeautyCategories();
  return cats.find((c) => c.slug === slug) || null;
}

export async function getBeautyCategoriesByWorld(world) {
  const cats = await getBeautyCategories();
  return world ? cats.filter((c) => c.world === world) : cats;
}

// ── Brands (browse axis) ─────────────────────────────────────────────────────
// Distinct brand names across active products, alphabetical. Cached like
// categories; a null/empty brand never appears.
let _brandCache = { data: null, at: 0 };
export async function getBeautyBrands() {
  const now = Date.now();
  if (_brandCache.data && now - _brandCache.at < CAT_TTL_MS) return _brandCache.data;
  const { data, error } = await supabase
    .from("beauty_products")
    .select("brand")
    .not("brand", "is", null)
    .limit(1000);
  if (error) { console.error("getBeautyBrands", error.code || error.message); return _brandCache.data || []; }
  const brands = [...new Set((data || []).map((r) => String(r.brand).trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "en"));
  _brandCache = { data: brands, at: now };
  return brands;
}

// ── Brand directory ("Maisons") ──────────────────────────────────────────────
// The operator-managed brand houses (beauty_brands, migration 11) with their
// OFFICIAL uploaded logo. Distinct from getBeautyBrands() above (which just
// derives brand strings off products for the catalog filter). Graceful: a
// missing table (migration not yet run) returns [] so the page shows its
// honest "coming soon" state instead of erroring.
let _brandDirCache = { data: null, at: 0 };
export async function getBeautyBrandDirectory() {
  const now = Date.now();
  if (_brandDirCache.data && now - _brandDirCache.at < CAT_TTL_MS) return _brandDirCache.data;
  const { data, error } = await supabase
    .from("beauty_brands")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true })
    .limit(MAX_LIST_ROWS);
  if (error) {
    // 42P01 = table missing (migration 11 not run yet) — stay silent-ish.
    if (error.code !== "42P01") console.error("getBeautyBrandDirectory", error.code || error.message);
    return _brandDirCache.data || [];
  }
  _brandDirCache = { data: data || [], at: now };
  return _brandDirCache.data;
}

// Brand logo URL (Beauty's own logo bucket; passthrough for full https URLs).
export function beautyBrandLogoUrl(path) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const { data } = supabase.storage.from("beauty-brand-logos").getPublicUrl(path);
  return data.publicUrl;
}

// ── Products ─────────────────────────────────────────────────────────────────
// opts: { world, categoryId, categorySlug, search, brand, badge, stockOnly,
//         featured, sort, limit }
//   sort ∈ "default" | "newest" | "price_asc" | "price_desc" | "popular"
export async function getBeautyProducts(opts = {}) {
  const {
    world, categoryId, categorySlug, search, brand, badge,
    stockOnly, featured, sort = "default", limit,
  } = opts;

  // Resolve slug/world → category id list up front (categories are cached).
  let resolvedCatId = categoryId;
  if (!resolvedCatId && categorySlug) {
    const cat = await getBeautyCategoryBySlug(categorySlug);
    if (!cat) return []; // unknown category → honest empty list
    resolvedCatId = cat.id;
  }
  let worldCatIds = null;
  if (!resolvedCatId && world) {
    const cats = await getBeautyCategoriesByWorld(world);
    worldCatIds = cats.map((c) => c.id);
    if (!worldCatIds.length) return [];
  }

  let q = supabase.from("beauty_products").select("*").eq("is_active", true);
  if (resolvedCatId)       q = q.eq("category_id", resolvedCatId);
  else if (worldCatIds)    q = q.in("category_id", worldCatIds);
  if (brand)     q = q.eq("brand", brand);
  if (stockOnly) q = q.eq("in_stock", true);
  if (featured)  q = q.eq("is_featured", true);
  if (badge === "none") q = q.is("badge", null);
  else if (badge)       q = q.eq("badge", badge);
  const term = search ? sanitizeSearchTerm(search) : "";
  if (term) {
    q = q.or(
      [
        `name_ru.ilike.%${term}%`, `name_tg.ilike.%${term}%`,
        `name_en.ilike.%${term}%`, `name_fa.ilike.%${term}%`,
        `sku.ilike.%${term}%`,     `brand.ilike.%${term}%`,
      ].join(",")
    );
  }
  switch (sort) {
    case "newest":     q = q.order("created_at", { ascending: false }); break;
    case "price_asc":  q = q.order("price", { ascending: true,  nullsFirst: false }); break;
    case "price_desc": q = q.order("price", { ascending: false, nullsFirst: false }); break;
    case "popular":    q = q.order("views", { ascending: false })
                            .order("is_featured", { ascending: false }); break;
    default:           q = q.order("is_featured", { ascending: false })
                            .order("id", { ascending: true });
  }
  q = q.limit(Math.min(Number(limit) || MAX_LIST_ROWS, MAX_LIST_ROWS));

  const { data, error } = await q;
  if (error) { console.error("getBeautyProducts", error.code || error.message); return []; }
  return data || [];
}

export async function getBeautyProductBySlug(slug, { throwOnError = false } = {}) {
  const key = String(slug || "").trim();
  if (!key || key.length > 120) return null;
  const isNumeric = /^\d+$/.test(key);
  const field = isNumeric ? "id" : "slug";
  const { data, error } = await supabase
    .from("beauty_products").select("*").eq(field, key).eq("is_active", true).maybeSingle();
  if (error) {
    console.error("getBeautyProductBySlug", error.code || error.message);
    // ISR callers opt in: fail the (re)render on transient DB errors so Next
    // keeps the last good page instead of caching a false 404.
    if (throwOnError) throw new Error("PRODUCT_FETCH_FAILED");
    return null;
  }
  return data;
}

export async function getRelatedBeautyProducts(product, n = 4) {
  if (!product || product.category_id == null) return [];
  const { data, error } = await supabase
    .from("beauty_products")
    .select("*")
    .eq("category_id", product.category_id)
    .eq("is_active", true)
    .neq("id", product.id)
    .order("is_featured", { ascending: false })
    .limit(n);
  if (error) { console.error("getRelatedBeautyProducts", error.code || error.message); return []; }
  return data || [];
}

// Atomic popularity counter (SECURITY DEFINER RPC from migration 10).
export async function recordBeautyProductView(productId) {
  if (!productId) return;
  const { error } = await supabase.rpc("increment_beauty_product_views", { p_id: productId });
  if (error) console.error("recordBeautyProductView", error);
}

// ── Image URL helper (Beauty's own bucket) ───────────────────────────────────
export function beautyImageUrl(path) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const { data } = supabase.storage.from("beauty-product-images").getPublicUrl(path);
  return data.publicUrl;
}
