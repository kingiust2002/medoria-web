// lib/operator/dashboardBlocks.js — the pure part of "my dashboard" (N10, round 3): which of the four dashboard blocks a person shows and in which order. The
// blocks themselves are drawn by the two dashboard pages; whatever a person is not allowed to see (requests, products) stays hidden there whatever is stored.
// Whatever is stored is cleaned against this catalogue, so a stored value can never name a block the page does not define. Plain module: unit-tested.
import { tr } from "../panel/i18n.js";

export const DASH_BLOCKS = [["stats", tr("آمار کلی")], ["actions", tr("دسترسی سریع")], ["quotes", tr("استعلام‌های اخیر")], ["products", tr("محصولات اخیراً به‌روزشده")]];
export const DEFAULT_DASH = DASH_BLOCKS.map(([k]) => k);
const CARDS = new Set(["quotes", "products"]);                           // the two list cards sit side by side when they follow each other

// anything → the chosen blocks in the chosen order (no repeats, only known names), or null when nothing valid is left (= the default dashboard)
export function cleanDash(raw) {
  if (!Array.isArray(raw)) return null;
  const out = [];
  for (const k of raw) if (typeof k === "string" && DEFAULT_DASH.includes(k) && !out.includes(k)) out.push(k);
  return out.length ? out : null;
}
export const effectiveDash = (saved) => cleanDash(saved) || DEFAULT_DASH;

// [{ key }] for a full-width block, [{ cards: [keys] }] for list cards that follow each other (shown two across on a wide screen)
export function groupDash(order) {
  const groups = [];
  for (const key of order) {
    if (CARDS.has(key) && groups.at(-1)?.cards) groups.at(-1).cards.push(key);
    else groups.push(CARDS.has(key) ? { cards: [key] } : { key });
  }
  return groups;
}
