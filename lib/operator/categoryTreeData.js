// lib/operator/categoryTreeData.js — SERVER ONLY
import "server-only";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";
import { buildHealthCategoryTree, rollupHealthCategoryCounts } from "@/lib/health/categories";
import { requireHealthSession } from "@/lib/operator/panelGuard";
import { readProductCounts } from "@/lib/operator/listReaders";

const EMPTY = [];

export async function getHealthCategoryTreeAdmin() {
  await requireHealthSession(["categories.view", "products.view"]);
  const admin = getAdminClient();
  if (!admin) return EMPTY;

  const [catsRes, productsRes] = await Promise.all([
    admin.from("categories").select("*").order("sort_order", { ascending: true }),
    readProductCounts(admin, "health"),          // EVERY product, in chunks (a plain select stops at the API's 1,000 rows without saying so)
  ]);
  if (catsRes.error) return EMPTY;
  if (!productsRes.ok) throw new Error("product counts are unavailable");          // never a silent "0 products" (the delete screen trusts the count)

  const counts = new Map();
  for (const product of productsRes.rows) {
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
