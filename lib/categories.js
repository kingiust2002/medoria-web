// lib/categories.js
import { supabase } from "./supabase";

let cache = null;

export async function getCategories() {
  if (cache) return cache;
  const { data, error } = await supabase
    .from("categories")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) { console.error(error); return []; }
  cache = data || [];
  return cache;
}
