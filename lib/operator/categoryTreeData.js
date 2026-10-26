// lib/operator/categoryTreeData.js — SERVER ONLY
import "server-only";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";
import { buildHealthCategoryTree, rollupHealthCategoryCounts } from "@/lib/health/categories";
import { requireHealthSession } from "@/lib/operator/panelGuard";

const EMPTY = [];

export async function getHealthCategoryTreeAdmin() {
  await requireHealthSession();
  const admin = getAdminClient();
  if (!admin) return EMPTY;

  const [catsRes, productsRes] = await Promise.all([
    admin.from("categories").select("*").order("sort_order", { ascending: true }),
    admin.from("products").select("id,category_id,category"),
  ]);
  if (catsRes.error) return EMPTY;

  const counts = new Map();
  for (const product of productsRes.data || []) {
    if (product.category_id != null) {
      const key = String(product.category_id);
      counts.set(key, (counts.get(key) || 0) + 1);
    } else if (product.category) {
      const key = `slug:${product.category}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }

  const tree = buildHealthCategoryTree(catsRes.data || []);
  return rollupHealthCategoryCounts(tree, counts);
}
