// lib/supabase.js
// Data layer for the Medoria B2B catalog.
//   • category_id filtering (falls back to the legacy `category` slug string)
//   • sort: default | newest | price_asc | price_desc | popular | name
//   • getProductsPage (server-side filter/sort/count/paging), getAllProducts, getProductBrands
//   • getCategories / getCategoryBySlug / getProductBySlug / getRelatedProducts
//   • recordProductView (atomic popularity counter)
// Back-compat aliases getProduct / getRelated are kept so older imports work.
import { createClient } from "@supabase/supabase-js";
import { fetchProductPage, applySort, sanitizeSearchTerm } from "./catalogQuery.js";

// Resilient env handling: never throw at import time. Real values come from
// .env.local in dev and the platform env in production; the placeholders only
// keep `createClient` from throwing during `next build` when env is absent.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "public-anon-placeholder-key";

export const isSupabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Next's data cache and "stale forever" product pages.
// The Health/Beauty layouts set `fetchCache = "default-cache"` (runbook §21: Next 15
// stopped caching fetch by default and the ISR pages depend on it). A fetch WITHOUT
// its own `revalidate` is then cached with no expiry, and the route's `revalidate`
// does not shorten that: an ISR page re-renders every few minutes from the SAME
// cached rows, so a price or an archive change stays invisible until something
// calls revalidatePath for exactly that route (reproduced on Next 15.5.27 and seen
// on the live product page, runbook §23). Giving every public GET a numeric
// `revalidate` lets the entry expire (with the shorter of this value and the
// route's own `revalidate`). The operator actions still purge instantly through
// lib/health/revalidate.js; this covers edits made any other way (SQL, Studio).
// Browsers ignore the `next` option; non-GET requests such as RPC calls pass
// through untouched.
export const PUBLIC_DATA_TTL_SECONDS = 60;

export function publicFetch(input, init) {
  const method = String(init?.method || "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") return fetch(input, init);
  return fetch(input, {
    ...init,
    next: { ...(init && init.next), revalidate: PUBLIC_DATA_TTL_SECONDS },
  });
}

export const supabase = createClient(url, key, {
  auth: { persistSession: false },
  global: { fetch: publicFetch },
});

// Defensive ceiling for list queries: keeps a growing catalog (or a hostile
// crafted request) from turning into an unbounded full-table transfer.
const MAX_LIST_ROWS = 500;

// ── Categories ───────────────────────────────────────────────────────────────
// Short-TTL in-memory cache: absorbs bursts without a DB call per request, but
// (unlike the previous forever-cache) picks up operator edits within a minute.
// On a failed refresh the previous data is served — stale beats a broken page.
const CAT_TTL_MS = 60_000;
let _catCache = { data: null, at: 0 };
export async function getCategories() {
  const now = Date.now();
  if (_catCache.data && now - _catCache.at < CAT_TTL_MS) return _catCache.data;
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .order("sort_order", { ascending: true })
    .limit(MAX_LIST_ROWS);
  if (error) { console.error("getCategories", error.code || error.message); return _catCache.data || []; }
  _catCache = { data: data || [], at: now };
  return _catCache.data;
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
    q = q.limit(Math.min(Number(limit) || MAX_LIST_ROWS, MAX_LIST_ROWS));
    return q;
  };

  return execProducts(build, "getProducts");
}

// One page of the public catalog, filtered/sorted/counted by the database (lib/catalogQuery.js).
// opts: { search, categoryIds, keepUncategorized, brand, badge, stockOnly, sort, lang, page, pageSize }
// → { rows, total, page, pageSize, pages, clamped } or { error, rows: [], total: 0, ... } on a database error.
export async function getProductsPage(opts = {}) {
  const run = (withActive) => fetchProductPage(() => {
    let q = supabase.from("products").select("*", { count: "exact" });
    if (withActive) q = q.eq("is_active", true);
    return q;
  }, opts);
  if (_hasIsActive !== false) {
    const r = await run(true);
    if (!r.error) { _hasIsActive = true; return r; }
    if (r.error.code === "42703") _hasIsActive = false;
    else { console.error("getProductsPage", r.error.code || r.error.message); return r; }
  }
  const r = await run(false);
  if (r.error) console.error("getProductsPage", r.error.code || r.error.message);
  return r;
}

// EVERY active product, read in chunks (a single request is capped at 1000 rows and getProducts() at 500).
// For the sitemap and for counts, where silently dropping product number 501 would be a bug.
const ALL_CHUNK = 1000;
const ALL_CEILING = 20_000;
export async function getAllProducts() {
  const out = [];
  for (let from = 0; from < ALL_CEILING; from += ALL_CHUNK) {
    const rows = await execProducts((withActive) => {
      let q = supabase.from("products").select("*");
      if (withActive) q = q.eq("is_active", true);
      return applySort(q, "default").range(from, from + ALL_CHUNK - 1);
    }, "getAllProducts");
    out.push(...rows);
    if (rows.length < ALL_CHUNK) break;
  }
  return out;
}

// The brand filter's options: every distinct brand of an active product (names only, cached briefly).
let _brandCache = { data: null, at: 0 };
export async function getProductBrands() {
  const now = Date.now();
  if (_brandCache.data && now - _brandCache.at < CAT_TTL_MS) return _brandCache.data;
  const rows = await execProducts((withActive) => {
    let q = supabase.from("products").select("brand").not("brand", "is", null);
    if (withActive) q = q.eq("is_active", true);
    return q.order("brand", { ascending: true }).limit(5000);
  }, "getProductBrands");
  const brands = [...new Set(rows.map((r) => String(r.brand || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  _brandCache = { data: brands, at: now };
  return brands;
}

// Active products by id (the inquiry list shows them again from the database). At most 30 ids.
export async function getProductsByIds(ids) {
  const list = [...new Set((ids || []).map(Number).filter((n) => Number.isSafeInteger(n) && n > 0))].slice(0, 30);
  if (!list.length) return [];
  return execProducts((withActive) => {
    let q = supabase.from("products").select("*").in("id", list);
    if (withActive) q = q.eq("is_active", true);
    return q;
  }, "getProductsByIds");
}

// The variants of ONE active product (migration 44): [{ id, sku, options, price, currency, unit, in_stock, image_url, sort }].
// Empty when there are none or the function does not exist yet (migration 44 not applied); never throws, a product page must render without them.
export async function getProductVariants(parentId) {
  const id = Number(parentId);
  if (!Number.isSafeInteger(id) || id <= 0) return [];
  const { data, error } = await supabase.rpc("public_product_variants", { p_parent: id });
  if (error) { if (error.code !== "PGRST202" && error.code !== "42883") console.error("getProductVariants", error.code || error.message); return []; }
  return Array.isArray(data) ? data : [];
}

// Variants by id for the inquiry list (Health): same public columns as a product plus the parent's address. At most 30 ids.
export async function getVariantItemsByIds(ids) {
  const list = [...new Set((ids || []).map(Number).filter((n) => Number.isSafeInteger(n) && n > 0))].slice(0, 30);
  if (!list.length) return [];
  const { data, error } = await supabase.rpc("public_variant_items", { p_ids: list });
  if (error) { if (error.code !== "PGRST202" && error.code !== "42883") console.error("getVariantItemsByIds", error.code || error.message); return []; }
  return Array.isArray(data) ? data : [];
}

export async function getProductBySlug(slug, { throwOnError = false } = {}) {
  const key = String(slug || "").trim();
  if (!key || key.length > 120) return null; // real slugs are ≤ 80 chars
  const isNumeric = /^\d+$/.test(key);
  const field = isNumeric ? "id" : "slug";
  // Archived products (is_active = false) are NOT public: the page answers 404 and
  // the RLS policy (migrations 27/28) hides the row from the API as well. Same
  // one-time fallback as execProducts() for a database that predates migration 04.
  const run = (withActive) => {
    let q = supabase.from("products").select("*").eq(field, key);
    if (withActive) q = q.eq("is_active", true);
    return q.maybeSingle(); // an unknown slug is a routine 404, not an error to log
  };
  let res = await run(_hasIsActive !== false);
  if (res.error?.code === "42703" && _hasIsActive !== false) {
    _hasIsActive = false;
    res = await run(false);
  } else if (!res.error && _hasIsActive === null) {
    _hasIsActive = true;
  }
  const { data, error } = res;
  if (error) {
    console.error("getProductBySlug", error.code || error.message);
    // ISR pages opt in: a transient DB failure must FAIL the (re)render —
    // Next then keeps serving the last good cached page — rather than
    // return null and cache a false "not found" for the revalidate window.
    if (throwOnError) throw new Error("PRODUCT_FETCH_FAILED");
    return null;
  }
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

// Quote/contact submissions go through the validated, rate-limited server
// action in lib/actions/quote.js — never insert quote_requests from the client.

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
