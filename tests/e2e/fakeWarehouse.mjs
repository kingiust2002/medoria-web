// An in-process stand-in for migration 36's functions (<house>_stock_post / _reverse / _reserve / _release), operating on the fake
// database's tables. It mirrors the rules the real PostgreSQL functions are proved to have in tests/warehouse-migration.test.mjs
// (never negative, idempotency keys, transfers in two legs, reversals once, reservations) so the screens can be driven end to end.
import { simulateCountClose } from "../helpers/countCloseSim.mjs";

class Refusal extends Error { constructor(code, details) { super(`stock:${code}`); this.details = details; } }

export function warehouseRpc(tables, name, a) {
  const m = /^(health|beauty)_stock_(post|reverse|reserve|release|count_close)$/.exec(name);
  if (!m) return null;
  const [, house, fn] = m;
  const T = (t) => (tables[`${house}_stock_${t}`] ??= []);
  const products = tables[house === "health" ? "products" : "beauty_products"] || [];
  const next = (arr) => Math.max(0, ...arr.map((r) => r.id || 0)) + 1;
  const bal = (loc, prod) => {
    let b = T("balances").find((r) => r.location_id === loc && r.product_id === prod);
    if (!b) { b = { location_id: loc, product_id: prod, quantity: 0, reserved: 0, updated_at: new Date().toISOString() }; T("balances").push(b); }
    return b;
  };
  const activeLoc = (id) => {
    const l = T("locations").find((x) => x.id === id);
    if (!l) throw new Refusal("unknown_location");
    if (!l.is_active) throw new Refusal("location_inactive");
    return l;
  };
  const ledger = (row) => { const r = { id: next(T("movements")), created_at: new Date().toISOString(), reverses_id: null, reservation_id: null, ...row }; T("movements").push(r); return r; };
  if (fn === "count_close") {
    // migration 41's transactional close: every difference through the post rules above, all or nothing (a failing line restores the ledger)
    const tablesToRestore = ["movements", "balances", "reservations"];
    const snapshot = () => JSON.stringify(tablesToRestore.map((t) => T(t)));
    const restore = (snap) => { JSON.parse(snap).forEach((rows, i) => { tables[`${house}_stock_${tablesToRestore[i]}`] = rows; }); };
    const post = (args) => { try { warehouseRpc(tables, `${house}_stock_post`, args); return null; } catch (e) { if (e instanceof Refusal) return { error: { message: e.message, details: e.details } }; throw e; } };
    const out = simulateCountClose({ tables, house, args: a, post, snapshot, restore });
    if (out.error) throw new Refusal(String(out.error.message).replace(/^stock:/, ""), out.error.details);
    return out.data;
  }
  const key = a.p_key;
  if (typeof key !== "string" || key.length < 8 || key.length > 80) throw new Refusal("bad_key");
  const group = () => `g-${Math.random().toString(36).slice(2)}`;
  const move = (loc, prod, delta, extra) => {
    const b = bal(loc, prod);
    if (delta < 0 && b.quantity - b.reserved < -delta) throw new Refusal("insufficient_stock", `available=${b.quantity - b.reserved}`);
    b.quantity = Math.round((b.quantity + delta) * 1000) / 1000; b.updated_at = new Date().toISOString();
    return ledger({ product_id: prod, location_id: loc, delta, balance_after: b.quantity, ...extra });
  };
  const actor = { actor_user_id: a.p_actor ?? null, actor_label: a.p_actor_label ?? null, request_id: a.p_request ?? null };

  if (fn === "post") {
    const prior = T("movements").filter((r) => r.idempotency_key === key);
    const q = Number(a.p_qty);
    if (!["receive", "issue", "transfer", "adjust"].includes(a.p_kind)) throw new Refusal("bad_kind");
    if (!q || (a.p_kind !== "adjust" && q < 0)) throw new Refusal("bad_quantity");
    const delta = a.p_kind === "receive" || a.p_kind === "adjust" ? q : -q;
    if (prior.length) {
      const f = prior.find((r) => r.leg === 0);
      if (f.kind !== a.p_kind || f.product_id !== a.p_product || f.location_id !== a.p_location || f.delta !== delta) throw new Refusal("idempotency_key_reused");
      return { ok: true, replayed: true, group_id: f.group_id, movement_ids: prior.map((r) => r.id) };
    }
    if (a.p_kind === "adjust" && String(a.p_reason || "").trim().length < 3) throw new Refusal("reason_required");
    if (a.p_kind === "transfer" && (!a.p_to_location || a.p_to_location === a.p_location)) throw new Refusal("bad_destination");
    const prod = products.find((p) => p.id === a.p_product);
    if (!prod) throw new Refusal("unknown_product");
    activeLoc(a.p_location);
    if (a.p_kind === "transfer") activeLoc(a.p_to_location);
    const g = group();
    const common = { idempotency_key: key, group_id: g, kind: a.p_kind, sku: prod.sku, reason: a.p_reason || null, reference: a.p_reference || null, ...actor };
    if (a.p_reservation) {
      const r = T("reservations").find((x) => x.id === a.p_reservation);
      if (!r || r.status !== "active") throw new Refusal("reservation_not_active");
      if (r.product_id !== a.p_product || r.location_id !== a.p_location || r.qty !== q) throw new Refusal("reservation_mismatch");
      Object.assign(r, { status: "consumed", closed_at: new Date().toISOString(), close_key: key, closed_label: a.p_actor_label });
      bal(a.p_location, a.p_product).reserved -= q;
    }
    const first = move(a.p_location, a.p_product, delta, { ...common, leg: 0, reservation_id: a.p_reservation || null });
    const ids = [first.id];
    let after2;
    if (a.p_kind === "transfer") { const second = move(a.p_to_location, a.p_product, q, { ...common, leg: 1 }); ids.push(second.id); after2 = second.balance_after; }
    return { ok: true, replayed: false, group_id: g, movement_ids: ids, balance_after: first.balance_after, balance_after_to: after2 };
  }

  if (fn === "reverse") {
    const orig = T("movements").find((r) => r.id === a.p_movement);
    if (!orig) throw new Refusal("unknown_movement");
    const prior = T("movements").filter((r) => r.idempotency_key === key);
    if (prior.length) return { ok: true, replayed: true, group_id: prior[0].group_id, movement_ids: prior.map((r) => r.id) };
    if (String(a.p_reason || "").trim().length < 3) throw new Refusal("reason_required");
    if (orig.kind === "reversal") throw new Refusal("cannot_reverse_a_reversal");
    const legs = T("movements").filter((r) => r.group_id === orig.group_id).sort((x, y) => x.leg - y.leg);
    if (T("movements").some((r) => legs.some((l) => l.id === r.reverses_id))) throw new Refusal("already_reversed");
    const g = group(), ids = [];
    for (const l of legs) {
      activeLoc(l.location_id);
      const r = move(l.location_id, l.product_id, -l.delta, { idempotency_key: key, leg: l.leg, group_id: g, kind: "reversal", sku: l.sku, reason: String(a.p_reason).trim(), reference: l.reference, reverses_id: l.id, ...actor });
      ids.push(r.id);
    }
    return { ok: true, replayed: false, group_id: g, movement_ids: ids };
  }

  if (fn === "reserve") {
    const prior = T("reservations").find((r) => r.idempotency_key === key);
    const q = Number(a.p_qty);
    if (prior) {
      if (prior.product_id !== a.p_product || prior.location_id !== a.p_location || prior.qty !== q) throw new Refusal("idempotency_key_reused");
      return { ok: true, replayed: true, reservation_id: prior.id };
    }
    if (!(q > 0)) throw new Refusal("bad_quantity");
    const prod = products.find((p) => p.id === a.p_product);
    if (!prod) throw new Refusal("unknown_product");
    activeLoc(a.p_location);
    const b = bal(a.p_location, a.p_product);
    if (b.quantity - b.reserved < q) throw new Refusal("insufficient_stock", `available=${b.quantity - b.reserved}`);
    b.reserved += q;
    const r = { id: next(T("reservations")), idempotency_key: key, product_id: a.p_product, sku: prod.sku, location_id: a.p_location, qty: q, status: "active", reference: a.p_reference || null, note: a.p_note || null, created_at: new Date().toISOString(), created_label: a.p_actor_label, closed_at: null };
    T("reservations").push(r);
    return { ok: true, replayed: false, reservation_id: r.id };
  }

  // release
  const r = T("reservations").find((x) => x.id === a.p_reservation);
  if (!r) throw new Refusal("unknown_reservation");
  if (r.status === "released" && r.close_key === key) return { ok: true, replayed: true, reservation_id: r.id };
  if (r.status !== "active") throw new Refusal("reservation_not_active");
  bal(r.location_id, r.product_id).reserved -= r.qty;
  Object.assign(r, { status: "released", closed_at: new Date().toISOString(), close_key: key, closed_label: a.p_actor_label });
  return { ok: true, replayed: false, reservation_id: r.id };
}

export { Refusal };
