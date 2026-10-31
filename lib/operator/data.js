// lib/operator/data.js — SERVER ONLY
// Read helpers for the operator panel, using the service-role client so the
// panel sees everything (inactive products, all quotes) regardless of RLS.
import "server-only";
import { listMedia, MEDIA_MESSAGES } from "@/lib/operator/mediaLibrary";
import { listVersions } from "@/lib/operator/productVersions";
import { listVariantRows } from "@/lib/operator/variantActions";
import { VARIANT_MESSAGES } from "@/lib/operator/variants";
import { houseAssignees } from "@/lib/operator/quoteFollowUpCore";
import { cleanDays, REPORT_COLUMNS } from "@/lib/operator/quoteReport";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";
import { mayView } from "@/lib/operator/access";
import { requireHealthSession } from "@/lib/operator/panelGuard";
import { parseProductParams, parseQuoteParams, readAll } from "@/lib/operator/listQuery";
import { readProductsPage, readQuotesPage, readDashboard, readProductCounts } from "@/lib/operator/listReaders";
import { getPanelLang } from "@/lib/panel/server";

const EMPTY = [];

// One page of the product list: the database filters, sorts and counts over ALL products (lib/operator/listQuery.js).
// → { params, ok, rows, total, page, pageCount, size } | { params, ok: false, error }
export async function getProductsPage(searchParams) {
  await requireHealthSession("products.view");
  const params = parseProductParams(searchParams);
  const admin = getAdminClient();
  if (!admin) return { params, ok: false, error: "unavailable" };
  return { params, ...(await readProductsPage(admin, "health", params, { lang: await getPanelLang() })) };
}

export async function getAdminProduct(id) {
  await requireHealthSession("products.view");
  const admin = getAdminClient();
  if (!admin) return null;
  const { data } = await admin.from("products").select("*").eq("id", id).single();
  return data || null;
}

// The variants of one product for its edit page (needs products.view). `hidden`: migration 44 is not applied, so the section is not shown at all.
export async function getAdminVariants(parentId) {
  await requireHealthSession("products.view");
  const admin = getAdminClient();
  if (!admin) return { variants: [], unavailable: VARIANT_MESSAGES.generic };
  const res = await listVariantRows(admin, "products", parentId);
  if (res.needsMigration) return { variants: [], hidden: true };
  return res.ok ? { variants: res.variants } : { variants: [], unavailable: res.error };
}

// the change history of one product (needs products.view); `unavailable` when migration 38 is not applied
export async function getProductHistory(id) {
  await requireHealthSession("products.view");
  const admin = getAdminClient();
  if (!admin) return null;
  const product = await getAdminProduct(id);
  if (!product) return null;
  const res = await listVersions(admin, "health", product.id);
  return { product, versions: res.ok ? res.versions : [], unavailable: res.ok ? null : res.error };
}

// Product forms should only assign products to terminal categories. Before the
// tree migration every category is effectively a leaf, so the old flat schema
// remains compatible.
export async function getAdminCategories() {
  await requireHealthSession(["categories.view", "products.view"]);
  const admin = getAdminClient();
  if (!admin) return EMPTY;
  const { data } = await admin.from("categories").select("*").order("sort_order", { ascending: true });
  const rows = data || EMPTY;
  const parents = new Set(rows.map((row) => row.parent_id).filter((id) => id != null).map(String));
  return rows.filter((row) => !parents.has(String(row.id)));
}

export async function getCategoriesWithCounts() {
  await requireHealthSession(["categories.view", "products.view"]);
  const admin = getAdminClient();
  if (!admin) return EMPTY;
  const [cats, prods] = await Promise.all([
    admin.from("categories").select("*").order("sort_order", { ascending: true }),
    readProductCounts(admin, "health"),
  ]);
  // a count that could not be read must not turn into "0 products" (the delete screens trust it): fail loudly instead
  if (!prods.ok) throw new Error("product counts are unavailable");
  const counts = {};
  for (const p of prods.rows) {
    if (p.category_id != null) counts[`id:${p.category_id}`] = (counts[`id:${p.category_id}`] || 0) + 1;
    if (p.category) counts[`slug:${p.category}`] = (counts[`slug:${p.category}`] || 0) + 1;
  }
  return (cats.data || []).map((c) => ({
    ...c,
    product_count: (counts[`id:${c.id}`] || 0) || (counts[`slug:${c.slug}`] || 0),
  }));
}

// One page of customer requests + the exact counts of the tabs / statuses / "needs follow-up" and the customer file of the people on the page.
export async function getQuotesPage(searchParams) {
  await requireHealthSession("quotes.view");
  const params = parseQuoteParams(searchParams);
  const admin = getAdminClient();
  if (!admin) return { params, ok: false, error: "unavailable" };
  return { params, ...(await readQuotesPage(admin, "health", params)) };
}

// the names a request can be handed to: the active people of this house (empty with the old shared login)
export async function getQuoteAssignees() {
  await requireHealthSession("quotes.view");
  return houseAssignees(getAdminClient(), "health");
}

// status / dates / assignee / notice result of the last `days` days: no customer text (the report page needs reports.view)
export async function getQuoteReportRows(days) {
  await requireHealthSession("reports.view");
  const admin = getAdminClient();
  if (!admin) return { ok: false, rows: [] };
  const since = new Date(Date.now() - cleanDays(days) * 86_400_000).toISOString();
  const page = (cols) => readAll((from, to) => admin.from("quote_requests").select(cols).gte("created_at", since).order("created_at", { ascending: false }).order("id", { ascending: false }).range(from, to));   // EVERY request of the period
  let res = await page(REPORT_COLUMNS);
  if (!res.ok) res = await page("status,created_at,first_response_at,assigned_to,notify_status");   // before migration 37
  return res.ok ? { ok: true, rows: res.rows } : { ok: false, rows: [] };
}

export async function getDashboardData() {
  const session = await requireHealthSession();
  // only what this person may see is read at all (a number is data too)
  const access = { products: mayView(session, "health", "products.view"), quotes: mayView(session, "health", "quotes.view"), create: mayView(session, "health", "products.create") };
  const admin = getAdminClient();
  if (!admin) return { configured: false, access, stats: null, recentProducts: [], recentQuotes: [] };
  const d = await readDashboard(admin, "health", { products: access.products, quotes: access.quotes });
  return { configured: true, access, stats: d.stats, recentProducts: d.recentProducts, recentQuotes: d.recentQuotes };
}

// every uploaded image of this house with where it is used (needs media.view)
export async function getMediaLibrary() {
  await requireHealthSession("media.view");
  const admin = getAdminClient();
  if (!admin) return { ok: false, error: MEDIA_MESSAGES.unavailable };
  return listMedia(admin, "health");
}
