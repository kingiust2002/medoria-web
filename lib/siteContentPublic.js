// lib/siteContentPublic.js — what the PUBLIC pages read of the site content (migration 42): the rows that are live right now, with the
// public columns only (the database policy decides "live"; the anon key can do nothing else with this table). No cache of its own: the
// request goes through publicFetch (Next's data cache, at most a minute old), and an operator's save purges the pages and that cache at once
// (lib/siteContentRevalidate.js). On a failed read the last good answer is served, and with none the page simply shows no banner / no FAQ —
// a content outage must never break a public page.
import { supabase } from "@/lib/supabase";
import { CONTENT_KINDS, LIMITS } from "@/lib/siteContent";

const lastGood = new Map();            // "house:kind" → rows

export async function getLiveContent(house, kind) {
  if (!["health", "beauty"].includes(house) || !CONTENT_KINDS.includes(kind)) return [];
  const k = `${house}:${kind}`;
  try {
    const { data, error } = await supabase.from("site_content").select("id,house,kind,data,sort_order")
      .eq("house", house).eq("kind", kind).order("sort_order", { ascending: true }).order("id", { ascending: true }).limit(LIMITS.perHouse);
    if (error) throw error;
    lastGood.set(k, data || []);
    return data || [];
  } catch (e) {
    console.error("getLiveContent", house, kind, e?.code || e?.message);
    return lastGood.get(k) || [];
  }
}
