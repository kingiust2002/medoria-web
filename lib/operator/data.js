// lib/operator/data.js — SERVER ONLY
// Read helpers for the operator panel, using the service-role client so the
// panel sees everything (inactive products, all quotes) regardless of RLS.
import "server-only";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";

const EMPTY = [];

export async function getAdminProducts() {
  const admin = getAdminClient();
  if (!admin) return EMPTY;
  const { data, error } = await admin
    .from("products")
    .select("*")
    .order("updated_at", { ascending: false, nullsFirst: false });
  if (error) {
    const r2 = await admin.from("products").select("*").order("id", { ascending: false });
    return r2.data || EMPTY;
  }
  return data || EMPTY;
}

export async function getAdminProduct(id) {
  const admin = getAdminClient();
  if (!admin) return null;
  const { data } = await admin.from("products").select("*").eq("id", id).single();
  return data || null;
}

export async function getAdminCategories() {
  const admin = getAdminClient();
  if (!admin) return EMPTY;
  const { data } = await admin.from("categories").select("*").order("sort_order", { ascending: true });
  return data || EMPTY;
}

export async function getCategoriesWithCounts() {
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
  const admin = getAdminClient();
  if (!admin) return EMPTY;
  const { data } = await admin
    .from("quote_requests")
    .select("*")
    .order("created_at", { ascending: false });
  return data || EMPTY;
}

export async function getDashboardData() {
  const admin = getAdminClient();
  if (!admin) return { configured: false, stats: null, recentProducts: [], recentQuotes: [] };
  const [prodRes, quoteRes] = await Promise.all([
    admin.from("products").select("*"),
    admin.from("quote_requests").select("*").order("created_at", { ascending: false }),
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
