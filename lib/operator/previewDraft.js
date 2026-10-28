// lib/operator/previewDraft.js — the PRIVATE preview of a product on the real public page (N5): what a form's unsaved values would look like,
// held for a short time on the server for the person who made them. Plain module (no Next, no database): the page and the action pass
// their own session, so the rules run in unit tests.
//
//   * the draft is cleaned with the same function a save uses (productRow.js), so the preview shows what would really be stored;
//   * it lives in memory only (never in the database, a log, a cookie, a URL or a cache), for 30 minutes, at most 40 at a time;
//   * it is bound to the session AND the house that made it: another session, another house, an expired or a made-up token get nothing;
//   * the token is 192 random bits and means nothing by itself.
import { randomBytes, timingSafeEqual } from "node:crypto";
import { buildProductRow } from "./productRow.js";

export const PREVIEW_TTL_MS = 30 * 60 * 1000;
export const PREVIEW_MAX = 40;
export const PREVIEW_MAX_BYTES = 60_000;
export const PREVIEW_LANGS = ["tg", "ru", "en", "fa"];

// the fields a visitor can see on a product page (nothing that only the panel needs: slug, status, schedule, translation marks…)
const VISIBLE = [
  "name_en", "name_ru", "name_tg", "name_fa", "description_en", "description_ru", "description_tg", "description_fa", "sku", "brand", "category", "category_id",
  "price", "unit", "min_order_qty", "in_stock", "badge", "is_featured", "image_url", "gallery_urls", "specs", "brochure_url", "tags", "seo_title", "seo_description",
];

// → { ok, draft } | { ok: false, error: "too_big" | "bad" }
export function cleanDraft(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "bad" };
  let raw;
  try { raw = JSON.stringify(input); } catch { return { ok: false, error: "bad" }; }
  if (raw.length > PREVIEW_MAX_BYTES * 2) return { ok: false, error: "too_big" };
  const row = buildProductRow(input);
  const draft = Object.fromEntries(VISIBLE.map((k) => [k, row[k] ?? null]));
  draft.gallery_urls = row.gallery_urls || [];
  draft.tags = row.tags || [];
  draft.specs = row.specs && typeof row.specs === "object" ? row.specs : {};
  return JSON.stringify(draft).length > PREVIEW_MAX_BYTES ? { ok: false, error: "too_big" } : { ok: true, draft };
}

// the stored product with the draft on top (a draft that is a NEW product has no stored one)
export function overlay(stored, draft) {
  const base = stored || { id: 0, slug: "preview", is_active: false, views: 0, currency: "USD" };
  const out = { ...base };
  for (const [k, v] of Object.entries(draft || {})) if (VISIBLE.includes(k)) out[k] = v;
  return out;
}

// the stored product with the PROPOSED fields of a change request on top (what the reviewer is asked to approve)
export function applyProposal(stored, proposed) {
  const base = stored || { id: 0, slug: "preview", is_active: false, views: 0, currency: "USD" };
  const out = { ...base };
  for (const [k, v] of Object.entries(proposed || {})) if (!k.startsWith("_") && VISIBLE.includes(k)) out[k] = v;
  return out;
}

const same = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };

export function createPreviewStore({ now = () => Date.now() } = {}) {
  const items = new Map();                                  // token → { owner: { sid, house }, productId, draft, expires }
  const purge = () => { const t = now(); for (const [k, v] of items) if (v.expires <= t) items.delete(k); };
  return {
    // owner: { sid, house }. → token
    put(owner, productId, draft) {
      purge();
      while (items.size >= PREVIEW_MAX) items.delete(items.keys().next().value);      // the oldest goes
      const token = randomBytes(24).toString("hex");
      items.set(token, { owner: { sid: String(owner.sid), house: owner.house }, productId: productId == null ? null : Number(productId), draft, expires: now() + PREVIEW_TTL_MS });
      return token;
    },
    // → { productId, draft } | null  (never throws; a wrong owner, house, product or an expired token is simply nothing)
    get(token, owner, productId) {
      purge();
      if (typeof token !== "string" || !/^[0-9a-f]{48}$/.test(token)) return null;
      const v = items.get(token);
      if (!v || !same(v.owner.sid, owner.sid) || v.owner.house !== owner.house) return null;
      if ((v.productId ?? null) !== (productId == null ? null : Number(productId))) return null;
      return { productId: v.productId, draft: v.draft };
    },
    drop(token) { items.delete(token); },
    get size() { purge(); return items.size; },
  };
}

// one store per server process; the page and the action may be separate bundles, so it hangs on globalThis
export const previewStore = (globalThis.__medoriaPreviewStore ||= createPreviewStore());
