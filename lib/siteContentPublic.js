// lib/siteContentPublic.js — what the PUBLIC pages read of the site content (migration 42): the rows that are live right now, with the
// public columns only (the database policy decides "live"; the anon key can do nothing else with this table). A short in-memory cache
// absorbs bursts; on a failed read the previous answer is served, and with none the page simply shows no banner / no FAQ — a content
// outage must never break a public page.
import { supabase } from "@/lib/supabase";
import { CONTENT_KINDS, LIMITS } from "@/lib/siteContent";

const TTL_MS = 60_000;
const cache = new Map();            // "house:kind" → { rows, at }

export async function getLiveContent(house, kind) {
  if (!["health", "beauty"].includes(house) || !CONTENT_KINDS.includes(kind)) return [];
  const k = `${house}:${kind}`, now = Date.now();
  const hit = cache.get(k);
  if (hit && now - hit.at < TTL_MS) return hit.rows;
  try {
    const { data, error } = await supabase.from("site_content").select("id,house,kind,data,sort_order")
      .eq("house", house).eq("kind", kind).order("sort_order", { ascending: true }).order("id", { ascending: true }).limit(LIMITS.perHouse);
    if (error) throw error;
    const rows = data || [];
    cache.set(k, { rows, at: now });
    return rows;
  } catch (e) {
    console.error("getLiveContent", house, kind, e?.code || e?.message);
    return hit?.rows || [];
  }
}
