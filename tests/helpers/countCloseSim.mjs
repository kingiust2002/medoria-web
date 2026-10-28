// tests/helpers/countCloseSim.mjs — a JavaScript stand-in for the database function <house>_stock_count_close of migration 41, for the unit tests and
// the fake database of the browser tests. It mirrors the function's rules (lock-free here, since JavaScript is single-threaded between awaits):
// unknown / cancelled count, nothing counted, reviewed snapshot (`p_expected`), the differences ordered by product, ALL-OR-NOTHING posting
// (a failing line undoes the lines posted before it), the closed state and the replay of a closed count. The REAL behaviour — including real
// concurrency — is proved on PostgreSQL in tests/warehouse-counts-migration.test.mjs; this only keeps the application tests honest about the shape.
const err = (message, details = null) => ({ data: null, error: { message, details } });

// post(args) → { error } | anything else (success); snapshot() → token, restore(token) undoes everything posted after the snapshot
export function simulateCountClose({ tables, house, args, post, snapshot, restore }) {
  const counts = (tables[`${house}_stock_counts`] ||= []);
  const lines = (tables[`${house}_stock_count_lines`] ||= []);
  const c = counts.find((x) => x.id === args.p_count);
  if (!c) return err("stock:unknown_count");
  if (!["open", "closed"].includes(c.status)) return err("stock:count_closed");
  const mine = lines.filter((l) => l.count_id === c.id);
  const counted = mine.filter((l) => l.counted != null);
  if (c.status === "open" && !counted.length) return err("stock:nothing_counted");
  const diffs = counted
    .map((l) => ({ product_id: l.product_id, sku: l.sku, delta: Math.round((Number(l.counted) - Number(l.expected)) * 1000) / 1000 }))
    .filter((d) => d.delta !== 0).sort((a, b) => a.product_id - b.product_id);
  if (args.p_expected && JSON.stringify(diffs.map((d) => [d.product_id, d.delta])) !== JSON.stringify(args.p_expected)) return err("stock:count_stale");
  if (c.status === "closed") return { data: { ok: true, replayed: true, differences: c.differences || 0 }, error: null };
  const token = snapshot();
  for (const d of diffs) {
    const r = post({
      p_key: `count-${c.id}-${d.product_id}`, p_kind: "adjust", p_product: d.product_id, p_location: c.location_id, p_to_location: null, p_qty: d.delta,
      p_reason: `Stock count #${c.id}`, p_reference: `count-${c.id}`, p_reservation: null, p_actor: args.p_actor, p_actor_label: args.p_actor_label, p_request: args.p_request,
    });
    if (r?.error) { restore(token); return err("stock:count_line_failed", `product=${d.product_id};sku=${d.sku || ""};reason=${r.error.message};detail=${r.error.details || ""}`); }
  }
  Object.assign(c, { status: "closed", closed_at: new Date().toISOString(), closed_label: args.p_actor_label ?? null, differences: diffs.length });
  return { data: { ok: true, replayed: false, differences: diffs.length }, error: null };
}
