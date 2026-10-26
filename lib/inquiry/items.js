// lib/inquiry/items.js — the inquiry LIST (several products in one customer request).
//
// The browser sends only { id, quantity } pairs. Names and SKUs are read from the products table by
// the server and written into the request, so a visitor cannot put an invented product name, a
// different SKU or an archived product into a request. Plain module (relative imports only) so
// node --test loads it directly.

import { clean } from "../security/sanitize.js";

export const MAX_ITEMS = 30;
export const MAX_QTY = 1_000_000;
const NAME_MAX = 300;
const SKU_MAX = 120;

const toId = (v) => {
  if (typeof v === "number") return Number.isSafeInteger(v) && v > 0 ? v : null;
  if (typeof v === "string" && /^[1-9]\d{0,15}$/.test(v)) { const n = Number(v); return Number.isSafeInteger(n) ? n : null; }
  return null;
};

// raw: whatever the browser sent. Returns { items: [{ id, quantity }] } (duplicates merged, quantities
// summed and capped) or { error: "invalid" } when it is not a non-empty list of at most MAX_ITEMS valid ids.
export function parseItemRequests(raw) {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_ITEMS) return { error: "invalid" };
  const byId = new Map();
  for (const entry of raw) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return { error: "invalid" };
    const id = toId(entry.id);
    if (id === null) return { error: "invalid" };
    const q = Number(entry.quantity);
    const quantity = Number.isFinite(q) && q >= 1 ? Math.min(Math.round(q), MAX_QTY) : 1;
    byId.set(id, Math.min((byId.get(id) || 0) + quantity, MAX_QTY));
  }
  return { items: [...byId].map(([id, quantity]) => ({ id, quantity })) };
}

// requests: output of parseItemRequests().items; rows: product rows read from the database
// ({ id, sku, name_en, name_ru, name_tg, name_fa, is_active }). Keeps the visitor's order; drops ids that
// do not exist or are archived. Returns the structure stored in `items`.
export function buildStoredItems(requests, rows) {
  const byId = new Map((rows || []).filter((r) => r && r.is_active !== false).map((r) => [Number(r.id), r]));
  const out = [];
  for (const { id, quantity } of requests) {
    const r = byId.get(id);
    if (!r) continue;
    const name = clean(r.name_en || r.name_ru || r.name_tg || r.name_fa || "", NAME_MAX);
    out.push({ product_id: id, sku: clean(r.sku || "", SKU_MAX) || null, name: name || `#${id}`, quantity });
  }
  return out;
}

// The one-line summary kept in the old product_name column, so lists, search and the Telegram notice
// still show something meaningful: "Gloves +2".
export function summarizeItems(items) {
  if (!items?.length) return null;
  const first = items[0].name;
  const text = items.length === 1 ? first : `${first} +${items.length - 1}`;
  return text.length > NAME_MAX ? `${text.slice(0, NAME_MAX - 1)}…` : text;
}

// Plain text for a database without the `items` column (migration 33 not yet applied): the list goes
// into the message so the team still sees every product.
export function itemsAsText(items) {
  return (items || []).map((i) => `- ${i.name}${i.sku ? ` (${i.sku})` : ""} × ${i.quantity}`).join("\n");
}
