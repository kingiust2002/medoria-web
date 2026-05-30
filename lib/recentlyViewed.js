// lib/recentlyViewed.js — localStorage-backed recently-viewed product IDs.
// Client-only. Guard every call with `typeof window !== "undefined"`.
const KEY = "medoria_recently_viewed";
const MAX = 8;

export function getRecentlyViewedIds() {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); }
  catch { return []; }
}

// Call on a product-detail page mount. Most-recent first, de-duped, capped.
export function pushRecentlyViewed(productId) {
  if (typeof window === "undefined" || productId == null) return;
  const id = Number(productId);
  let ids = getRecentlyViewedIds().filter((x) => x !== id);
  ids.unshift(id);
  ids = ids.slice(0, MAX);
  try { localStorage.setItem(KEY, JSON.stringify(ids)); } catch {}
  // Notify any open <RecentlyViewed> on the same page.
  window.dispatchEvent(new CustomEvent("medoria:recently-viewed", { detail: ids }));
}

export function clearRecentlyViewed() {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(KEY); } catch {}
}
