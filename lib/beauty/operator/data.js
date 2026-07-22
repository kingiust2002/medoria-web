// lib/beauty/operator/data.js — SERVER ONLY
// Read helpers for the BEAUTY operator panel. Uses the shared service-role
// client (same Supabase project as Health) so the panel sees everything —
// inactive products, all quotes — regardless of RLS. Only beauty_* tables.
import "server-only";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";

const EMPTY = [];

export async function getAdminBeautyProducts() {
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
  const admin = getAdminClient();
  if (!admin) return null;
  const { data } = await admin.from("beauty_products").select("*").eq("id", id).single();
  return data || null;
}

export async function getAdminBeautyCategories() {
  const admin = getAdminClient();
  if (!admin) return EMPTY;
  const { data } = await admin.from("beauty_categories").select("*").order("sort_order", { ascending: true });
  return data || EMPTY;
}

export async function getBeautyCategoriesWithCounts() {
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

export async function getBeautyBrandsWithCounts() {
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
  const admin = getAdminClient();
  if (!admin) return EMPTY;
  const { data } = await admin
    .from("beauty_quote_requests")
    .select("*")
    .order("created_at", { ascending: false });
  return data || EMPTY;
}

export async function getBeautyDashboardData() {
  const admin = getAdminClient();
  if (!admin) return { configured: false, stats: null, recentProducts: [], recentQuotes: [] };
  const [prodRes, quoteRes] = await Promise.all([
    admin.from("beauty_products").select("*"),
    admin.from("beauty_quote_requests").select("*").order("created_at", { ascending: false }),
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
    totalQuotes: quotes.length,
    newQuotes: quotes.filter((q) => q.status === "new").length,
  };
  return { configured: true, stats, recentProducts, recentQuotes: quotes.slice(0, 8) };
}
