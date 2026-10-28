// lib/operator/variantScope.js — product LISTS in the panels show products, not their variants (migration 44): a variant is managed from its
// product's page, and found by its SKU or name when a person searches. Until migration 44 is applied there is no `variant_of` column and
// nothing is filtered, so the panel keeps working before and after the migration. Plain module: the client is passed in.
const cache = new Map();                     // table → { ready, at }
const RECHECK_MS = 30_000;                   // "not yet" is asked again after a while (the migration may be applied while the server runs)

export async function variantsReady(admin, table, now = Date.now()) {
  const hit = cache.get(table);
  if (hit && (hit.ready || now - hit.at < RECHECK_MS)) return hit.ready;
  const { error } = await admin.from(table).select("variant_of").limit(1);
  const ready = !error;
  cache.set(table, { ready, at: now });
  return ready;
}
export const resetVariantScope = () => cache.clear();

// products only (no variants)
export const topLevel = (q) => q.is("variant_of", null);

// { [parentId]: number of variants } for a page of products
export async function variantCounts(admin, table, ids, readAll) {
  const list = (ids || []).filter((x) => Number.isSafeInteger(Number(x)));
  if (!list.length) return {};
  const got = await readAll((from, to) => admin.from(table).select("variant_of").in("variant_of", list).order("id", { ascending: true }).range(from, to));
  if (!got.ok) return {};
  const out = {};
  for (const r of got.rows) out[r.variant_of] = (out[r.variant_of] || 0) + 1;
  return out;
}
