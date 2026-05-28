// lib/supabase.js
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const supabase = createClient(url, key, {
  auth: { persistSession: false },
});

// ── Get all products with optional filters ───────────────────────────────────
export async function getProducts({ category, search, stockOnly, limit, featured } = {}) {
  let q = supabase.from("products").select("*").order("id", { ascending: true });

  if (category)  q = q.eq("category", category);
  if (stockOnly) q = q.eq("in_stock", true);
  if (featured)  q = q.eq("is_featured", true);
  if (limit)     q = q.limit(limit);
  if (search) {
    q = q.or(
      `name_ru.ilike.%${search}%,name_tg.ilike.%${search}%,name_en.ilike.%${search}%,name_fa.ilike.%${search}%,sku.ilike.%${search}%`
    );
  }

  const { data, error } = await q;
  if (error) { console.error(error); return []; }
  return data || [];
}

export async function getProduct(idOrSlug) {
  const isNumeric = /^\d+$/.test(String(idOrSlug));
  const field = isNumeric ? "id" : "slug";
  const { data, error } = await supabase.from("products").select("*").eq(field, idOrSlug).single();
  if (error) { console.error(error); return null; }
  return data;
}

export async function getRelated(product, n = 4) {
  if (!product?.category) return [];
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("category", product.category)
    .neq("id", product.id)
    .limit(n);
  if (error) return [];
  return data || [];
}

// ── Image URL ────────────────────────────────────────────────────────────────
export function imageUrl(path) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  const { data } = supabase.storage.from("product-images").getPublicUrl(path);
  return data.publicUrl;
}
