// lib/beauty/seo.js — one place that decides whether search engines may index
// the Beauty vertical.
//
// Before this existed, each Beauty page declared its own `robots`, and the
// result had drifted into the worst of both worlds: the home and /worlds were
// noindex, while /about, /contact and /brands were open, and none of them were
// in the sitemap. Search engines could therefore reach a couple of thin
// information pages but not the page meant to rank for them. That was an
// accident of five separate declarations, not a decision.
//
// Now there is one rule, and it answers itself from the catalog — see
// BEAUTY_INDEX_MIN_PRODUCTS in lib/beauty/catalog.js for why it is a query
// rather than a reminder.
import { getBeautyProductCount, BEAUTY_INDEX_MIN_PRODUCTS } from "./catalog";

// Farsi is never indexed anywhere on the site — it is a live but unlisted
// locale (localization law), so it stays closed regardless of the catalog.
const HIDDEN_LOCALE = "fa";

export async function isBeautyIndexable(lang) {
  if (lang === HIDDEN_LOCALE) return false;
  try {
    return (await getBeautyProductCount()) >= BEAUTY_INDEX_MIN_PRODUCTS;
  } catch {
    // A failed count must not accidentally publish the pre-launch catalog.
    return false;
  }
}

// `follow: true` in both states on purpose: even while closed, we want the
// links out of these pages to be crawled so the indexable Health side and the
// gateway keep their internal link graph.
export async function beautyRobots(lang) {
  return { index: await isBeautyIndexable(lang), follow: true };
}
