// lib/beauty/operator/data.js — SERVER ONLY
// Read helpers for the BEAUTY operator panel. Uses the shared service-role
// client (same Supabase project as Health) so the panel sees everything —
// inactive products, all quotes — regardless of RLS. Only beauty_* tables.
import "server-only";
import { listMedia, MEDIA_MESSAGES } from "@/lib/operator/mediaLibrary";
import { listVersions } from "@/lib/operator/productVersions";
import { listVariantRows } from "@/lib/operator/variantActions";
import { VARIANT_MESSAGES } from "@/lib/operator/variants";
import { houseAssignees } from "@/lib/operator/quoteFollowUpCore";
import { cleanDays, REPORT_COLUMNS } from "@/lib/operator/quoteReport";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";
import { buildCategoryTree } from "@/lib/beauty/catalog";
import { mayView } from "@/lib/operator/access";
import { requireBeautySession } from "@/lib/operator/panelGuard";
import { parseProductParams, parseQuoteParams, readAll } from "@/lib/operator/listQuery";
import { readProductsPage, readQuotesPage, readDashboard, readProductCounts } from "@/lib/operator/listReaders";
import { getPanelLang } from "@/lib/panel/server";

const EMPTY = [];

// One page of the Beauty product list (the database filters, sorts and counts over ALL products; see lib/operator/listQuery.js).
export async function getBeautyProductsPage(searchParams) {
  await requireBeautySession("products.view");
  const params = parseProductParams(searchParams);
  const admin = getAdminClient();
  if (!admin) return { params, ok: false, error: "unavailable" };
  return { params, ...(await readProductsPage(admin, "beauty", params, { lang: await getPanelLang() })) };
}

export async function getAdminBeautyProduct(id) {
  await requireBeautySession("products.view");
  const admin = getAdminClient();
  if (!admin) return null;
  const { data } = await admin.from("beauty_products").select("*").eq("id", id).single();
  return data || null;
}

export async function getAdminBeautyCategories() {
  await requireBeautySession(["categories.view", "products.view"]);
  const admin = getAdminClient();
  if (!admin) return EMPTY;
  const { data } = await admin.from("beauty_categories").select("*").order("sort_order", { ascending: true });
  return data || EMPTY;
}

export async function getBeautyCategoriesWithCounts() {
  await requireBeautySession(["categories.view", "products.view"]);
  const admin = getAdminClient();
  if (!admin) return EMPTY;
  const [cats, prods] = await Promise.all([
    admin.from("beauty_categories").select("*").order("sort_order", { ascending: true }),
    readProductCounts(admin, "beauty"),
  ]);
  if (!prods.ok) throw new Error("product counts are unavailable");           // never a silent "0 products"
  const counts = {};
  for (const p of prods.rows) {
    if (p.category_id != null) counts[p.category_id] = (counts[p.category_id] || 0) + 1;
  }
  return (cats.data || []).map((c) => ({ ...c, product_count: counts[c.id] || 0 }));
}

// Full category TREE for the operator panel: every node (incl. inactive),
// each with its own product_count plus a rollup total_count over its subtree.
export async function getBeautyCategoryTreeAdmin() {
  await requireBeautySession(["categories.view", "products.view"]);
  const flat = await getBeautyCategoriesWithCounts();
  const roots = buildCategoryTree(flat);
  const roll = (n) => {
    let total = n.product_count || 0;
    for (const c of n.children) total += roll(c);
    n.total_count = total;
    return total;
  };
  roots.forEach(roll);
  return roots;
}

export async function getBeautyBrandsWithCounts() {
  await requireBeautySession(["brands.view", "products.view"]);
  const admin = getAdminClient();
  if (!admin) return EMPTY;
  const [brandsRes, prodsRes] = await Promise.all([
    admin.from("beauty_brands").select("*").order("sort_order", { ascending: true }),
    readProductCounts(admin, "beauty"),
  ]);
  // Table may not exist yet (migration 11 not run) — degrade to empty list.
  if (brandsRes.error) return EMPTY;
  if (!prodsRes.ok) throw new Error("product counts are unavailable");
  const counts = {};
  for (const p of prodsRes.rows) {
    const b = String(p.brand || "").trim().toLowerCase();
    if (b) counts[b] = (counts[b] || 0) + 1;
  }
  return (brandsRes.data || []).map((b) => ({
    ...b,
    product_count: counts[String(b.name || "").trim().toLowerCase()] || 0,
  }));
}

export async function getBeautyQuotesPage(searchParams) {
  await requireBeautySession("quotes.view");
  const params = parseQuoteParams(searchParams);
  const admin = getAdminClient();
  if (!admin) return { params, ok: false, error: "unavailable" };
  return { params, ...(await readQuotesPage(admin, "beauty", params)) };
}

// the names a request can be handed to: the active people of this house (empty with the old shared login)
export async function getBeautyQuoteAssignees() {
  await requireBeautySession("quotes.view");
  return houseAssignees(getAdminClient(), "beauty");
}

// status / dates / assignee / notice result of the last `days` days: no customer text (the report page needs reports.view)
export async function getBeautyQuoteReportRows(days) {
  await requireBeautySession("reports.view");
  const admin = getAdminClient();
  if (!admin) return { ok: false, rows: [] };
  const since = new Date(Date.now() - cleanDays(days) * 86_400_000).toISOString();
  const page = (cols) => readAll((from, to) => admin.from("beauty_quote_requests").select(cols).gte("created_at", since).order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, to));   // EVERY request of the period
  let res = await page(REPORT_COLUMNS);
  if (!res.ok) res = await page("status,created_at,first_response_at,assigned_to,notify_status");   // before migration 37
  return res.ok ? { ok: true, rows: res.rows } : { ok: false, rows: [] };
}

export async function getBeautyDashboardData() {
  const session = await requireBeautySession();
  // only what this person may see is read at all (a number is data too)
  const access = { products: mayView(session, "beauty", "products.view"), quotes: mayView(session, "beauty", "quotes.view"), create: mayView(session, "beauty", "products.create") };
  const admin = getAdminClient();
  if (!admin) return { configured: false, access, stats: null, recentProducts: [], recentQuotes: [] };
  const d = await readDashboard(admin, "beauty", { products: access.products, quotes: access.quotes });
  return { configured: true, access, stats: d.stats, recentProducts: d.recentProducts, recentQuotes: d.recentQuotes };
}

// The variants of one product for its edit page (needs products.view). `hidden`: migration 44 is not applied, so the section is not shown at all.
export async function getAdminBeautyVariants(parentId) {
  await requireBeautySession("products.view");
  const admin = getAdminClient();
  if (!admin) return { variants: [], unavailable: VARIANT_MESSAGES.generic };
  const res = await listVariantRows(admin, "beauty_products", parentId);
  if (res.needsMigration) return { variants: [], hidden: true };
  return res.ok ? { variants: res.variants } : { variants: [], unavailable: res.error };
}

// the change history of one product (needs products.view); `unavailable` when migration 38 is not applied
export async function getBeautyProductHistory(id) {
  await requireBeautySession("products.view");
  const admin = getAdminClient();
  if (!admin) return null;
  const product = await getAdminBeautyProduct(id);
  if (!product) return null;
  const res = await listVersions(admin, "beauty", product.id);
  return { product, versions: res.ok ? res.versions : [], unavailable: res.ok ? null : res.error };
}

// every uploaded image of this house with where it is used (needs media.view)
export async function getBeautyMediaLibrary() {
  await requireBeautySession("media.view");
  const admin = getAdminClient();
  if (!admin) return { ok: false, error: MEDIA_MESSAGES.unavailable };
  return listMedia(admin, "beauty");
}
