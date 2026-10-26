// lib/catalogQuery.js — the product list query shared by the Health and Beauty data layers:
// filters, a STABLE sort, and server-side paging with an exact total.
//
// Why paging lives on the server: the catalog used to download every product (capped at 500, silently)
// and filter/sort/slice in the browser. With more than 500 products the rest would simply vanish. Now the
// browser (or the Beauty page) asks for one page at a time and gets the exact number of matches.
//
// Plain module (no alias imports) so node --test can load it with a mock PostgREST server.

export const PAGE_SIZE = 24;
export const MAX_PAGE_SIZE = 60;
export const MAX_PAGE = 500;            // 500 × 60 rows: far beyond any real catalog, bounds a hostile ?page=
export const SORTS = ["default", "newest", "price_asc", "price_desc", "popular", "name"];
export const NAME_LANGS = ["en", "ru", "tg", "fa"];

// Search terms are interpolated into a PostgREST .or() filter where `,` `(` `)` are syntax; strip them
// (plus quotes/backslashes) and escape LIKE wildcards so arbitrary input can neither alter the filter nor
// 400 the query.
export function sanitizeSearchTerm(s) {
  return String(s)
    .slice(0, 80)
    .replace(/[,()"'\\]/g, " ")
    .replace(/[%_]/g, "\\$&")
    .trim();
}

export function parsePage(v) {
  const n = typeof v === "number" ? v : typeof v === "string" && /^\d{1,4}$/.test(v.trim()) ? Number(v) : NaN;
  return Number.isSafeInteger(n) && n >= 1 && n <= MAX_PAGE ? n : 1;
}

export function parsePageSize(v, fallback = PAGE_SIZE) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 ? Math.min(n, MAX_PAGE_SIZE) : fallback;
}

export const parseSort = (v) => (SORTS.includes(v) ? v : "default");

// One OR group over every searchable text column.
function searchOr(term) {
  return [
    `name_ru.ilike.%${term}%`, `name_tg.ilike.%${term}%`,
    `name_en.ilike.%${term}%`, `name_fa.ilike.%${term}%`,
    `sku.ilike.%${term}%`,     `brand.ilike.%${term}%`,
  ].join(",");
}

// Filters. `categoryIds`: only products in these categories (the caller decides which: a selected branch of
// the tree, or every visible category). `keepUncategorized` also keeps products that have no category yet.
export function applyFilters(q, { categoryIds, keepUncategorized, brand, badge, stockOnly, featured, search } = {}) {
  if (Array.isArray(categoryIds)) {
    const ids = categoryIds.filter((x) => x != null);
    if (keepUncategorized) q = q.or(ids.length ? `category_id.in.(${ids.join(",")}),category_id.is.null` : "category_id.is.null");
    else q = q.in("category_id", ids);
  }
  if (brand) q = q.eq("brand", brand);
  if (stockOnly) q = q.eq("in_stock", true);
  if (featured) q = q.eq("is_featured", true);
  if (badge === "none") q = q.is("badge", null);
  else if (badge) q = q.eq("badge", badge);
  const term = search ? sanitizeSearchTerm(search) : "";
  if (term) q = q.or(searchOr(term));
  return q;
}

// Every sort ends with `id`, so two requests for neighbouring pages never overlap or skip a row.
export function applySort(q, sort = "default", lang = "en") {
  switch (sort) {
    case "newest":     return q.order("created_at", { ascending: false }).order("id", { ascending: true });
    case "price_asc":  return q.order("price", { ascending: true, nullsFirst: false }).order("id", { ascending: true });
    case "price_desc": return q.order("price", { ascending: false, nullsFirst: false }).order("id", { ascending: true });
    case "popular":    return q.order("views", { ascending: false }).order("is_featured", { ascending: false }).order("id", { ascending: true });
    case "name":       return q.order(`name_${NAME_LANGS.includes(lang) ? lang : "en"}`, { ascending: true }).order("id", { ascending: true });
    default:           return q.order("is_featured", { ascending: false }).order("id", { ascending: true });
  }
}

// Runs one page. `base()` returns a FRESH `from(table).select("*", { count: "exact" })` builder (callers add
// their own always-on filters, e.g. is_active). Returns { rows, total, page, pageSize, pages, clamped }.
// A page past the end (416 PGRST103, or an empty page above 1) answers page 1 with clamped = true instead of failing.
export async function fetchProductPage(base, opts = {}) {
  const pageSize = parsePageSize(opts.pageSize);
  let page = parsePage(opts.page);
  let clamped = false;
  const run = async (p) => {
    let q = applyFilters(base(), opts);
    q = applySort(q, parseSort(opts.sort), opts.lang);
    return q.range((p - 1) * pageSize, p * pageSize - 1);
  };
  let res = await run(page);
  // Past the end PostgREST may answer 416 (PGRST103) or an empty 200, depending on version and headers:
  // both mean "no such page", and both go back to page 1.
  const pastEnd = page > 1 && (res.error?.code === "PGRST103" || (!res.error && (res.data || []).length === 0));
  if (pastEnd) { page = 1; clamped = true; res = await run(1); }
  if (res.error) return { error: res.error, rows: [], total: 0, page, pageSize, pages: 0, clamped };
  const total = Number.isFinite(res.count) ? res.count : (res.data || []).length;
  return { rows: res.data || [], total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)), clamped };
}
