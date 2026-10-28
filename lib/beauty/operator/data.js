// lib/beauty/operator/data.js — SERVER ONLY
// Read helpers for the BEAUTY operator panel. Uses the shared service-role
// client (same Supabase project as Health) so the panel sees everything —
// inactive products, all quotes — regardless of RLS. Only beauty_* tables.
import "server-only";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";
import { summarizeQuotes } from "@/lib/operator/quoteOps";
import { countIncomplete } from "@/lib/operator/completeness";
import { buildCategoryTree } from "@/lib/beauty/catalog";
import { mayView } from "@/lib/operator/access";
import { requireBeautySession } from "@/lib/operator/panelGuard";

const EMPTY = [];

export async function getAdminBeautyProducts() {
  await requireBeautySession("products.view");
  const admin = getAdminClient();
  if (!admin) return EMPTY;
  const { data, error } = await admin
    .from("beauty_products")
    .select("*")
    .order("updated_at", { ascending: false, nullsFirst: false });
  if (error) {
    const r2 = await admin.from("beauty_products").select("*").order("id", { ascending: false });
    return r2.data || EMPTY;
  }
  return data || EMPTY;
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
    admin.from("beauty_products").select("id,category_id"),
  ]);
  const counts = {};
  for (const p of prods.data || []) {
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
    admin.from("beauty_products").select("brand"),
  ]);
  // Table may not exist yet (migration 11 not run) — degrade to empty list.
  if (brandsRes.error) return EMPTY;
  const counts = {};
  for (const p of prodsRes.data || []) {
    const b = String(p.brand || "").trim().toLowerCase();
    if (b) counts[b] = (counts[b] || 0) + 1;
  }
  return (brandsRes.data || []).map((b) => ({
    ...b,
    product_count: counts[String(b.name || "").trim().toLowerCase()] || 0,
  }));
}

export async function getBeautyQuotes() {
  await requireBeautySession("quotes.view");
  const admin = getAdminClient();
  if (!admin) return EMPTY;
  const { data } = await admin
    .from("beauty_quote_requests")
    .select("*")
    .order("created_at", { ascending: false });
  return data || EMPTY;
}

export async function getBeautyDashboardData() {
  const session = await requireBeautySession();
  // only what this person may see is read at all (a number is data too)
  const access = { products: mayView(session, "beauty", "products.view"), quotes: mayView(session, "beauty", "quotes.view"), create: mayView(session, "beauty", "products.create") };
  const admin = getAdminClient();
  if (!admin) return { configured: false, access, stats: null, recentProducts: [], recentQuotes: [] };
  const [prodRes, quoteRes] = await Promise.all([
    access.products ? admin.from("beauty_products").select("*") : { data: [] },
    access.quotes ? admin.from("beauty_quote_requests").select("*").order("created_at", { ascending: false }) : { data: [] },
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
