// lib/beauty/operator/constants.js — shared, secret-free constants for the
// Beauty panel (client + server). Quote statuses / badges / labels are the
// same proven set as Health's panel; Beauty adds the fixed WORLD list — the
// top level of the two-level luxury taxonomy (world → category → product).
export {
  QUOTE_STATUSES, QUOTE_STATUS_FA, QUOTE_STATUS_TONE,
  PRODUCT_BADGES, CONTACT_FA, LANG_FA,
} from "@/lib/operator/constants";

// Worlds are fixed in code (their public pages are designed surfaces), while
// categories under them are unlimited and DB-managed. `label` is the panel's
// Persian UI; public names come from components/beauty/i18n.js.
export const BEAUTY_WORLDS = [
  { value: "skincare", label: "مراقبت پوست · Skincare" },
  { value: "makeup",   label: "آرایش و عطر · Makeup" },
  { value: "tools",    label: "ابزار زیبایی · Tools" },
];

export const WORLD_FA = Object.fromEntries(BEAUTY_WORLDS.map((w) => [w.value, w.label]));
