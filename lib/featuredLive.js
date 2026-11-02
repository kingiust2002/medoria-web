// lib/featuredLive.js — SERVER ONLY. The products the operators put on a house's home page (kind "featured" of the site content, migration 51), in
// their order: only the live entries, only products that are active right now, never a variant, at most `limit`. An empty answer (no live entry, a
// missing migration, a failed read) means "use the old rule" — the home pages then show the products starred with is_featured, as before.
import "server-only";
import { supabase } from "@/lib/supabase";
import { getLiveContent } from "@/lib/siteContentPublic";
import { pickFeaturedIds } from "@/lib/siteContent";

export async function getLiveFeatured(house, limit = 6) {
  const h = house === "beauty" ? "beauty" : "health";
  try {
    const ids = pickFeaturedIds(await getLiveContent(h, "featured"));
    if (!ids.length) return [];
    const { data, error } = await supabase.from(h === "beauty" ? "beauty_products" : "products").select("*").in("id", ids).eq("is_active", true);
    if (error) throw error;
    const byId = new Map((data || []).filter((p) => p.variant_of == null).map((p) => [p.id, p]));
    return ids.map((id) => byId.get(id)).filter(Boolean).slice(0, limit);
  } catch (e) {
    console.error("getLiveFeatured", house, e?.code || e?.message);
    return [];
  }
}
