// lib/operator/data.js — SERVER ONLY
// Read helpers for the operator panel, using the service-role client so the
// panel sees everything (inactive products, all quotes) regardless of RLS.
import "server-only";
import { listMedia, MEDIA_MESSAGES } from "@/lib/operator/mediaLibrary";
import { listVersions } from "@/lib/operator/productVersions";
import { houseAssignees } from "@/lib/operator/quoteFollowUpCore";
import { cleanDays, REPORT_COLUMNS, REPORT_MAX_ROWS } from "@/lib/operator/quoteReport";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";
import { summarizeQuotes } from "@/lib/operator/quoteOps";
import { countIncomplete } from "@/lib/operator/completeness";
import { mayView } from "@/lib/operator/access";
import { requireHealthSession } from "@/lib/operator/panelGuard";
import { PRODUCT_LIST_LIMIT, QUOTE_LIST_LIMIT } from "@/lib/operator/listLimits";

const EMPTY = [];

export async function getAdminProducts() {
  await requireHealthSession("products.view");
  const admin = getAdminClient();
  if (!admin) return EMPTY;
  const { data, error } = await admin
    .from("products")
    .select("*")
    .order("updated_at", { ascending: false, nullsFirst: false })
    .limit(PRODUCT_LIST_LIMIT);
  if (error) {
    const r2 = await admin.from("products").select("*").order("id", { ascending: false }).limit(PRODUCT_LIST_LIMIT);
    return r2.data || EMPTY;
  }
  return data || EMPTY;
}

export async function getAdminProduct(id) {
  await requireHealthSession("products.view");
  const admin = getAdminClient();
  if (!admin) return null;
  const { data } = await admin.from("products").select("*").eq("id", id).single();
  return data || null;
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
    admin.from("products").select("id,category_id,category"),
  ]);
  const counts = {};
  for (const p of prods.data || []) {
    if (p.category_id != null) counts[`id:${p.category_id}`] = (counts[`id:${p.category_id}`] || 0) + 1;
    if (p.category) counts[`slug:${p.category}`] = (counts[`slug:${p.category}`] || 0) + 1;
  }
  return (cats.data || []).map((c) => ({
    ...c,
    product_count: (counts[`id:${c.id}`] || 0) || (counts[`slug:${c.slug}`] || 0),
  }));
}

export async function getQuotes() {
  await requireHealthSession("quotes.view");
  const admin = getAdminClient();
  if (!admin) return EMPTY;
  const { data } = await admin
    .from("quote_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(QUOTE_LIST_LIMIT);
  return data || EMPTY;
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
  let res = await admin.from("quote_requests").select(REPORT_COLUMNS).gte("created_at", since).order("created_at", { ascending: false }).limit(REPORT_MAX_ROWS);
  if (res.error) res = await admin.from("quote_requests").select("status,created_at,first_response_at,assigned_to,notify_status").gte("created_at", since).limit(REPORT_MAX_ROWS);   // before migration 37
  return res.error ? { ok: false, rows: [] } : { ok: true, rows: res.data || [] };
}

export async function getDashboardData() {
  const session = await requireHealthSession();
  // only what this person may see is read at all (a number is data too)
  const access = { products: mayView(session, "health", "products.view"), quotes: mayView(session, "health", "quotes.view"), create: mayView(session, "health", "products.create") };
  const admin = getAdminClient();
  if (!admin) return { configured: false, access, stats: null, recentProducts: [], recentQuotes: [] };
  const [prodRes, quoteRes] = await Promise.all([
    access.products ? admin.from("products").select("*") : { data: [] },
    access.quotes ? admin.from("quote_requests").select("*").order("created_at", { ascending: false }) : { data: [] },
  ]);
  const products = prodRes.data || [];
  const quotes = quoteRes.data || [];
  const isOnRequest = (p) => p.price == null || p.price === "" || Number(p.price) === 0;
  const recentProducts = [...products]
    .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0))
    .slice(0, 6);
  const stats = {
    total: products.length,
    active: products.filter((p) => p.is_active !== false).length,
    inactive: products.filter((p) => p.is_active === false).length,
    noPrice: products.filter(isOnRequest).length,
    noImage: products.filter((p) => !p.image_url).length,
    incomplete: countIncomplete(products),            // active products missing image / SKU / names / descriptions / specs
    totalQuotes: quotes.length,
    newQuotes: quotes.filter((q) => q.status === "new").length,
    overdueQuotes: summarizeQuotes(quotes).overdue,        // still unanswered after 24 h
    notifyFailures: summarizeQuotes(quotes).notifyFailures, // Telegram notice did not arrive
  };
  return { configured: true, access, stats, recentProducts, recentQuotes: quotes.slice(0, 8) };
}

// every uploaded image of this house with where it is used (needs media.view)
export async function getMediaLibrary() {
  await requireHealthSession("media.view");
  const admin = getAdminClient();
  if (!admin) return { ok: false, error: MEDIA_MESSAGES.unavailable };
  return listMedia(admin, "health");
}
