// tests/helpers/atomicDeleteRpc.mjs — an in-memory stand-in for migration 53's functions, so the many tests that run the panels'
// code against a memory database (and the e2e fake database) keep working. It mirrors the SEMANTICS only; the real SQL — locks,
// timestamp precision, overlapping sessions, the 1000-row cap — is proven by tests/atomic-approved-deletes-migration.test.mjs
// on a real PostgreSQL, and tests/atomic-delete-bridge.test.mjs drives the real executors through the real functions.
import { createHash } from "node:crypto";

const HOUSE = {
  health: { cat: "categories", prod: "products", quote: "quote_requests", legacySlug: true },
  beauty: { cat: "beauty_categories", prod: "beauty_products", quote: "beauty_quote_requests", legacySlug: false },
};
const hash = (v) => createHash("md5").update(JSON.stringify(v, Object.keys(v).sort())).digest("hex");
const inst = (v) => (v == null ? null : new Date(v).toISOString().replace("Z", ""));          // microseconds would need the string itself; the memory tables use whole instants

export function atomicDeleteRpc() {
  const members = (t, h, cat) => t[h.prod]?.filter((p) => p.category_id === cat.id || (h.legacySlug && p.category === cat.slug)) || [];
  const basisOf = (t, house, id) => {
    const h = HOUSE[house];
    if (!h) return { found: false };
    const cat = t[h.cat]?.find((c) => String(c.id) === String(id));
    if (!cat) return { found: false };
    const ms = members(t, h, cat).sort((a, b) => a.id - b.id);
    return {
      found: true, slug: cat.slug, row_hash: hash(cat), children: (t[h.cat] || []).filter((k) => k.parent_id === cat.id).length,
      members: ms.length, members_hash: hash({ list: ms.map((m) => `${m.id}:${inst(m.updated_at) ?? ""}`) }),
    };
  };
  return {
    operator_category_basis: ({ p_house, p_id }, db) => ({ data: basisOf(db.tables, p_house, p_id), error: null }),
    operator_delete_category_checked: ({ p_house, p_id, p_move_to, p_basis }, db) => {
      const t = db.tables, h = HOUSE[p_house];
      if (!h) return { data: { ok: false, reason: "bad_house" }, error: null };
      if (!p_basis || typeof p_basis !== "object" || !p_basis.row_hash || !p_basis.members_hash) return { data: { ok: false, reason: "no_basis" }, error: null };
      const cat = t[h.cat]?.find((c) => String(c.id) === String(p_id));
      if (!cat) return { data: { ok: false, reason: "not_found" }, error: null };
      let target = null;
      if (p_move_to != null) {
        if (String(p_move_to) === String(p_id)) return { data: { ok: false, reason: "same_target" }, error: null };
        target = t[h.cat].find((c) => String(c.id) === String(p_move_to));
        if (!target) return { data: { ok: false, reason: "no_target" }, error: null };
      }
      const now = basisOf(t, p_house, p_id);
      if (now.children > 0) return { data: { ok: false, reason: "has_children" }, error: null };
      if (now.row_hash !== p_basis.row_hash || now.members_hash !== p_basis.members_hash || String(now.members) !== String(p_basis.members)) return { data: { ok: false, reason: "stale" }, error: null };
      if (now.members > 0 && !target) return { data: { ok: false, reason: "needs_move" }, error: null };
      const ms = members(t, h, cat);
      for (const m of ms) { m.category_id = target.id; m.category = target.slug; }
      t[h.cat] = t[h.cat].filter((c) => c !== cat);
      return { data: { ok: true, moved: ms.length }, error: null };
    },
    operator_brand_basis: ({ p_id }, db) => {
      const b = db.tables.beauty_brands?.find((x) => String(x.id) === String(p_id));
      return { data: b ? { found: true, slug: b.slug, name: b.name, row_hash: hash(b) } : { found: false }, error: null };
    },
    operator_delete_brand_checked: ({ p_id, p_basis }, db) => {
      if (!p_basis || !p_basis.row_hash) return { data: { ok: false, reason: "no_basis" }, error: null };
      const b = db.tables.beauty_brands?.find((x) => String(x.id) === String(p_id));
      if (!b) return { data: { ok: false, reason: "not_found" }, error: null };
      if (hash(b) !== p_basis.row_hash) return { data: { ok: false, reason: "stale" }, error: null };
      db.tables.beauty_brands = db.tables.beauty_brands.filter((x) => x !== b);
      return { data: { ok: true }, error: null };
    },
    operator_delete_quotes_checked: ({ p_house, p_ids, p_versions }, db) => {
      const h = HOUSE[p_house];
      if (!h) return { data: { ok: false, reason: "bad_house" }, error: null };
      const ids = [...new Set(p_ids || [])].sort((a, b) => a - b);
      if (!ids.length) return { data: { ok: false, reason: "none" }, error: null };
      const rows = ids.map((i) => db.tables[h.quote]?.find((q) => q.id === i)).filter(Boolean);
      if (rows.length !== ids.length) return { data: { ok: false, reason: "stale", missing: ids.length - rows.length }, error: null };
      const bad = rows.find((r) => (r.updated_at ?? null) !== ((p_versions || {})[r.id] ?? null));
      if (bad) return { data: { ok: false, reason: "stale", changed_id: bad.id }, error: null };
      db.tables[h.quote] = db.tables[h.quote].filter((q) => !ids.includes(q.id));
      return { data: { ok: true, deleted: ids }, error: null };
    },
  };
}
