// lib/operator/listReaders.js — the database side of the paged panel lists (products, customer requests, dashboard numbers, counts per
// category / brand). Plain module: no Next imports and no session check — the data layers (lib/operator/data.js, lib/beauty/operator/data.js)
// check the session and the right BEFORE calling these, then pass the service-role client. Everything here is filtered, sorted and
// counted by the database over ALL rows; nothing silently stops at a cap. A failure is returned as { ok: false, error }, never as an
// empty list (an empty answer must mean "nothing matches", not "the read failed").
import {
  PRODUCT_SEARCH_COLUMNS, sanitizeTerm, applyProductFilters, applyProductSort, applyQuoteFilters, applyQuoteSort, applyQuoteTab, attentionExpr, isMissingObject, readAll, runPage,
} from "./listQuery.js";
import { teamDay, phoneKey } from "./quoteOps.js";
import { QUOTE_STATUSES, QUOTE_ACTIVE_STATUSES } from "./constants.js";
import { variantsReady, topLevel, variantCounts } from "./variantScope.js";

export const HOUSE_TABLES = {
  health: { products: "products", categories: "categories", quotes: "quote_requests", brands: null },
  beauty: { products: "beauty_products", categories: "beauty_categories", quotes: "beauty_quote_requests", brands: "beauty_brands" },
};

const headCount = (admin, table, apply = (q) => q) => apply(admin.from(table).select("id", { count: "exact", head: true })).then((r) => (r.error ? { error: r.error } : { n: r.count ?? 0 }));

// ── products ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
// → { ok: true, rows, total, page, pageCount, size, clamped } | { ok: false, error: "unavailable" | "needs_migration" }
export async function readProductsPage(admin, house, params, { lang = "fa" } = {}) {
  const t = HOUSE_TABLES[house];
  let worldCategoryIds = null;
  if (params.world && house === "beauty") {
    const w = await admin.from(t.categories).select("id").eq("world", params.world);
    if (w.error) return { ok: false, error: "unavailable" };
    worldCategoryIds = (w.data || []).map((c) => c.id);
  }
  const wantsGaps = Boolean(params.complete);
  // a list shows products; a SEARCH also reaches their variants (by SKU or name), so a variant's SKU can be found from here
  const hideVariants = !params.q && await variantsReady(admin, t.products);
  const out = await runPage((from, to) => {
    let q = admin.from(t.products).select(wantsGaps ? "*, gap_count" : "*", { count: "exact" });
    q = applyProductFilters(q, params, { legacySlug: true, worldCategoryIds });
    if (hideVariants) q = topLevel(q);
    q = applyProductSort(q, params.sort, lang);
    return q.range(from, to);
  }, params);
  if (!out.ok) return { ok: false, error: wantsGaps && isMissingObject(out.error) ? "needs_migration" : "unavailable" };
  // how many variants each product of this page has (migration 44)
  const counts = await variantsReady(admin, t.products) ? await variantCounts(admin, t.products, out.rows.filter((r) => r.variant_of == null).map((r) => r.id), readAll) : {};
  return { ...out, variantCounts: counts };
}

// ── customer requests ──────────────────────────────────────────────────────────────────────────────────────────────────────
export const QUOTE_TAB_STATUSES = { active: QUOTE_ACTIVE_STATUSES, all: QUOTE_STATUSES, archived: [], spam: [] };

// The page of requests, the exact count of every tab, the count per status of the current tab, the "needs follow-up" count and the
// earlier requests of the same customers (the customer file) — all from the database.
export async function readQuotesPage(admin, house, params, { now = Date.now(), statuses = QUOTE_TAB_STATUSES } = {}) {
  const t = HOUSE_TABLES[house];
  const today = teamDay(now);
  const opts = { now, today };
  const page = await runPage((from, to) => applyQuoteSort(applyQuoteFilters(admin.from(t.quotes).select("*", { count: "exact" }), params, opts)).range(from, to), params);
  if (!page.ok) return { ok: false, error: "unavailable" };

  const tabs = ["active", "archived", "spam", "all"];
  const tabRes = await Promise.all(tabs.map((tb) => headCount(admin, t.quotes, (q) => applyQuoteTab(q, tb))));
  const statusList = statuses[params.tab] || [];
  const statusRes = await Promise.all(statusList.map((s) => headCount(admin, t.quotes, (q) => applyQuoteTab(q, params.tab).eq("status", s))));
  const attention = await headCount(admin, t.quotes, (q) => applyQuoteTab(q, "active").or(attentionExpr({ now, today })));
  if ([...tabRes, ...statusRes, attention].some((r) => r.error)) return { ok: false, error: "unavailable" };

  // the customer file: other requests with the same phone key (migration 43). Without it the file only knows the rows of this page.
  const keys = [...new Set(page.rows.map((r) => r.phone_key ?? phoneKey(r.phone)).filter(Boolean))];
  let related = page.rows, customerFile = "page_only";
  if (keys.length && page.rows.some((r) => "phone_key" in r)) {
    const rel = await admin.from(t.quotes).select("id,phone,phone_key,status,created_at,product_name,tracking_code").in("phone_key", keys).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1000);
    if (!rel.error) { related = rel.data || []; customerFile = "full"; }
  }
  return {
    ok: true, ...page,
    tabCounts: Object.fromEntries(tabs.map((tb, i) => [tb, tabRes[i].n])),
    statusCounts: Object.fromEntries(statusList.map((s, i) => [s, statusRes[i].n])),
    attentionCount: attention.n,
    related, customerFile,
  };
}

// ── dashboard ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Exact numbers (head counts), the newest six products and eight requests. A number that cannot be computed is null (the screen shows "—").
export async function readDashboard(admin, house, { products = true, quotes = true, now = Date.now() } = {}) {
  const t = HOUSE_TABLES[house];
  const today = teamDay(now);
  const cutoff = new Date(now - 24 * 3_600_000).toISOString();
  const n = (r) => (r.error ? null : r.n);
  const stats = {};
  let recentProducts = [], recentQuotes = [];
  if (products) {
    const scope = await variantsReady(admin, t.products) ? topLevel : (q) => q;       // the numbers count products, not their variants (migration 44)
    const [total, active, inactive, noPrice, noImage, incomplete, recent] = await Promise.all([
      headCount(admin, t.products, scope),
      headCount(admin, t.products, (q) => scope(q).or("is_active.is.null,is_active.eq.true")),
      headCount(admin, t.products, (q) => scope(q).eq("is_active", false)),
      headCount(admin, t.products, (q) => scope(q).or("price.is.null,price.eq.0")),
      headCount(admin, t.products, (q) => scope(q).or("image_url.is.null,image_url.eq.")),
      headCount(admin, t.products, (q) => scope(q).or("is_active.is.null,is_active.eq.true").gt("gap_count", 0)),   // active products with at least one gap (migration 43)
      scope(admin.from(t.products).select("*")).order("updated_at", { ascending: false, nullsFirst: false }).order("id", { ascending: false }).limit(6),
    ]);
    Object.assign(stats, { total: n(total), active: n(active), inactive: n(inactive), noPrice: n(noPrice), noImage: n(noImage), incomplete: n(incomplete) });
    recentProducts = recent.error ? [] : recent.data || [];
  }
  if (quotes) {
    const [total, fresh, overdue, failed, recent] = await Promise.all([
      headCount(admin, t.quotes),
      headCount(admin, t.quotes, (q) => q.eq("status", "new")),
      headCount(admin, t.quotes, (q) => q.eq("status", "new").is("first_response_at", null).lte("created_at", cutoff)),
      headCount(admin, t.quotes, (q) => q.eq("notify_status", "failed").not("status", "in", "(spam,archived)")),
      admin.from(t.quotes).select("*").order("created_at", { ascending: false }).order("id", { ascending: false }).limit(8),
    ]);
    Object.assign(stats, { totalQuotes: n(total), newQuotes: n(fresh), overdueQuotes: n(overdue), notifyFailures: n(failed) });
    recentQuotes = recent.error ? [] : recent.data || [];
  }
  return { stats, recentProducts, recentQuotes, today };
}

// ── counts per category / brand: every product, read in chunks (a plain select stops at the API's row limit without saying so) ─────────
export async function readProductCounts(admin, house) {
  const t = HOUSE_TABLES[house];
  const cols = house === "health" ? "id,category_id,category" : "id,category_id,brand";
  const scope = await variantsReady(admin, t.products) ? topLevel : (q) => q;       // products, not their variants (migration 44)
  const all = await readAll((from, to) => scope(admin.from(t.products).select(cols)).order("id", { ascending: true }).range(from, to));
  if (!all.ok) return { ok: false };
  return { ok: true, rows: all.rows };
}

// ── a Beauty brand's roster: the products that carry the brand's name, and a server-side search over the other products ────────────────
// (brand ↔ product is the text join on the brand name). Nothing is loaded in bulk: the modal asks for what it shows.
const escapeLike = (s) => String(s).replace(/[\\%_]/g, "\\$&");
export async function readBrandRoster(admin, brandName, query = "", { currentLimit = 200, candidateLimit = 60 } = {}) {
  const name = String(brandName ?? "").replace(/[\u0000-\u001F]/g, " ").trim().slice(0, 120);
  if (!name) return { ok: false, error: "bad_brand" };
  const cols = "id,name_fa,name_en,name_tg,name_ru,sku,brand,image_url";
  const scope = await variantsReady(admin, "beauty_products") ? topLevel : (q) => q;       // brands carry products, not their variants (migration 44)
  const cur = await scope(admin.from("beauty_products").select(cols, { count: "exact" })).ilike("brand", escapeLike(name)).order("id", { ascending: true }).limit(currentLimit);
  if (cur.error) return { ok: false, error: "unavailable" };
  let cand = scope(admin.from("beauty_products").select(cols, { count: "exact" })).or(`brand.is.null,brand.not.ilike.${sanitizeTerm(name).replace(/\\/g, "")}`);
  const term = sanitizeTerm(query);
  if (term) cand = cand.or(PRODUCT_SEARCH_COLUMNS.map((c) => `${c}.ilike.%${term}%`).join(","));
  const res = await cand.order("id", { ascending: false }).limit(candidateLimit);
  if (res.error) return { ok: false, error: "unavailable" };
  return { ok: true, current: cur.data || [], currentTotal: cur.count ?? (cur.data || []).length, candidates: res.data || [], candidatesTotal: res.count ?? (res.data || []).length };
}
