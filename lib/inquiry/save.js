// lib/inquiry/save.js — the two database steps of a multi-product request, with the database passed in
// (so they are tested with a stand-in). Used by the Health and Beauty submit actions.

import { parseItemRequests, buildStoredItems, itemsAsText } from "./items.js";

const MESSAGE_ROOM = 3900;   // both request tables cap message at 4000 characters

// Reads name/SKU/active state of the requested ids from `productsTable` and returns the list to store.
// { items } | { error: "invalid" | "unavailable" }
export async function resolveItems(db, productsTable, rawItems) {
  const parsed = parseItemRequests(rawItems);
  if (parsed.error) return { error: "invalid" };
  const { data, error } = await db
    .from(productsTable)
    .select("id, sku, name_en, name_ru, name_tg, name_fa, is_active")
    .in("id", parsed.items.map((i) => i.id));
  if (error) return { error: "unavailable" };
  const items = buildStoredItems(parsed.items, data);
  return items.length ? { items } : { error: "invalid" };
}

const missingColumn = (e) => e && (e.code === "42703" || e.code === "PGRST204" || /column .*items/i.test(String(e.message || "")));

// Inserts the request. If the database predates migration 33 (no `items` column) the insert is repeated
// without it and the product list is appended to the message instead, so no request is ever lost.
// Returns the PostgREST result plus `degraded: true` when the fallback was used.
export async function insertRequest(db, table, row) {
  const res = await db.from(table).insert(row).select().single();
  if (!(res.error && row.items && missingColumn(res.error))) return res;
  const { items, ...rest } = row;
  const message = [rest.message, itemsAsText(items)].filter(Boolean).join("\n\n").slice(0, MESSAGE_ROOM);
  const retry = await db.from(table).insert({ ...rest, message }).select().single();
  return { ...retry, degraded: true };
}
