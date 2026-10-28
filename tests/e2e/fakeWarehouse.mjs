// An in-process stand-in for migration 36's functions (<house>_stock_post / _reverse / _reserve / _release), operating on the fake
// database's tables. It mirrors the rules the real PostgreSQL functions are proved to have in tests/warehouse-migration.test.mjs
// (never negative, idempotency keys, transfers in two legs, reversals once, reservations) so the screens can be driven end to end.
import { simulateCountClose } from "../helpers/countCloseSim.mjs";

class Refusal extends Error { constructor(code, details) { super(`stock:${code}`); this.details = details; } }

export function warehouseRpc(tables, name, a) {
  const m = /^(health|beauty)_stock_(post|reverse|reserve|release|count_close|lot_post|lot_reverse|lot_update)$/.exec(name);
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
  if (fn !== "lot_update" && (typeof key !== "string" || key.length < 8 || key.length > 80)) throw new Refusal("bad_key");      // a lot update is guarded by the version, not by a key
  const group = () => `g-${Math.random().toString(36).slice(2)}`;
  // migration 45's guard on the balance: usable stock = quantity - reserved - unusable (quarantined / rejected / expired lots); lot stock is covered
  const today = new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10);
  const lots = () => T("lots"), lotBals = () => T("lot_balances");
  const lotOf = (id) => lots().find((l) => l.id === id);
  const unusableQty = (loc, prod) => lotBals().filter((b) => b.location_id === loc).reduce((n, b) => { const l = lotOf(b.lot_id); return l && l.product_id === prod && (l.status !== "active" || (l.expiry_date && l.expiry_date < today)) ? n + b.quantity : n; }, 0);
  const lotSum = (loc, prod) => lotBals().filter((b) => b.location_id === loc).reduce((n, b) => (lotOf(b.lot_id)?.product_id === prod ? n + b.quantity : n), 0);
  const guardBalance = (b, newQty, newReserved) => {
    if ((newQty - newReserved) < (b.quantity - b.reserved)) {
      const un = unusableQty(b.location_id, b.product_id);
      if (newQty - newReserved < un) throw new Refusal("insufficient_stock", `available=${Math.max(b.quantity - b.reserved - un, 0)}`);
    }
    if (newQty < lotSum(b.location_id, b.product_id)) throw new Refusal("lot_stock_protected");
  };
  const move = (loc, prod, delta, extra) => {
    const b = bal(loc, prod);
    if (delta < 0 && b.quantity - b.reserved < -delta) throw new Refusal("insufficient_stock", `available=${b.quantity - b.reserved}`);
    guardBalance(b, b.quantity + delta, b.reserved);
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

  // ── migration 45: lots ─────────────────────────────────────────────────────────────────────────────────────────────────
  const creditLot = (lotId, loc, q) => {
    let b = lotBals().find((x) => x.lot_id === lotId && x.location_id === loc);
    if (!b) { b = { lot_id: lotId, location_id: loc, quantity: 0, updated_at: new Date().toISOString() }; lotBals().push(b); }
    b.quantity = Math.round((b.quantity + q) * 1000) / 1000;
  };
  const debitLot = (lotId, loc, q) => {
    const b = lotBals().find((x) => x.lot_id === lotId && x.location_id === loc);
    if (!b || b.quantity < q) throw new Refusal("insufficient_lot_stock", `available=${b ? b.quantity : 0}`);
    b.quantity = Math.round((b.quantity - q) * 1000) / 1000;
  };
  const linkLot = (movementId, lotId, delta) => T("movement_lots").push({ movement_id: movementId, lot_id: lotId, delta });
  const lotEvent = (lotId, kind, from, to, reason) => T("lot_events").push({ id: next(T("lot_events")), lot_id: lotId, kind, from_value: from, to_value: to, reason: reason || null, actor_label: a.p_actor_label ?? null, created_at: new Date().toISOString() });

  if (fn === "lot_post") {
    const code = String(a.p_lot_code || "").trim() || null;
    if ((a.p_lot_id != null && code) || (code && a.p_kind !== "receive") || (a.p_kind === "receive" && a.p_lot_id != null) || ((a.p_expiry || a.p_lot_status) && !code) || (a.p_lot_status && !["active", "quarantine"].includes(a.p_lot_status))) throw new Refusal("bad_lot");
    const q = Number(a.p_qty), delta = a.p_kind === "receive" || a.p_kind === "adjust" ? q : -q;
    const first = T("movements").find((r) => r.idempotency_key === key && r.leg === 0);
    if (first) {
      const prev = T("movement_lots").find((l) => l.movement_id === first.id)?.lot_id ?? null;
      const wanted = code ? (lots().find((l) => l.product_id === a.p_product && l.lot_code.toLowerCase() === code.toLowerCase())?.id ?? null) : (a.p_lot_id ?? null);
      if (prev !== wanted) throw new Refusal("idempotency_key_reused");
      return { ...warehouseRpc(tables, `${house}_stock_post`, a), lot_id: prev };
    }
    if (!products.find((p) => p.id === a.p_product)) throw new Refusal("unknown_product");
    let lot = null, created = false;
    if (code) {
      lot = lots().find((l) => l.product_id === a.p_product && l.lot_code.toLowerCase() === code.toLowerCase());
      if (lot) {
        if (lot.status === "rejected") throw new Refusal("lot_rejected");
        if (a.p_expiry && lot.expiry_date !== a.p_expiry) throw new Refusal("lot_expiry_mismatch");
      } else {
        lot = { id: next(lots()), product_id: a.p_product, lot_code: code, expiry_date: a.p_expiry || null, status: a.p_lot_status || "active", created_at: new Date().toISOString(), created_label: a.p_actor_label ?? null, updated_at: new Date().toISOString(), version: 1 };
        lots().push(lot); created = true;
        lotEvent(lot.id, "create", null, lot.status, a.p_reason);
      }
    } else if (a.p_lot_id != null) {
      lot = lotOf(a.p_lot_id);
      if (!lot || lot.product_id !== a.p_product) throw new Refusal("unknown_lot");
      if (["issue", "transfer"].includes(a.p_kind) && (lot.status !== "active" || (lot.expiry_date && lot.expiry_date < today))) throw new Refusal("lot_not_usable");
    }
    const snap = JSON.stringify([T("lot_balances"), T("movements"), T("balances"), T("reservations"), T("lots"), T("lot_events")]);
    try {
      if (lot && delta < 0) debitLot(lot.id, a.p_location, -delta);
      const res = warehouseRpc(tables, `${house}_stock_post`, a);
      if (lot && (delta > 0 || a.p_kind === "transfer")) creditLot(lot.id, a.p_kind === "transfer" ? a.p_to_location : a.p_location, Math.abs(delta));
      if (lot) { linkLot(res.movement_ids[0], lot.id, delta); if (a.p_kind === "transfer") linkLot(res.movement_ids[1], lot.id, q); }
      return { ...res, lot_id: lot ? lot.id : null, lot_created: created };
    } catch (e) {
      const [lb, mv, ba, rs, lo, ev] = JSON.parse(snap);       // all or nothing, like the database transaction
      Object.assign(tables, { [`${house}_stock_lot_balances`]: lb, [`${house}_stock_movements`]: mv, [`${house}_stock_balances`]: ba, [`${house}_stock_reservations`]: rs, [`${house}_stock_lots`]: lo, [`${house}_stock_lot_events`]: ev });
      throw e;
    }
  }

  if (fn === "lot_reverse") {
    const orig = T("movements").find((r) => r.id === a.p_movement);
    if (!orig) throw new Refusal("unknown_movement");
    if (T("movements").some((r) => r.idempotency_key === key && r.leg === 0)) return warehouseRpc(tables, `${house}_stock_reverse`, a);
    if (String(a.p_reason || "").trim().length < 3) throw new Refusal("reason_required");
    if (orig.kind === "reversal") throw new Refusal("cannot_reverse_a_reversal");
    const legs = T("movements").filter((r) => r.group_id === orig.group_id);
    if (T("movements").some((r) => legs.some((l) => l.id === r.reverses_id))) throw new Refusal("already_reversed");
    const links = legs.map((l) => ({ leg: l, link: T("movement_lots").find((x) => x.movement_id === l.id) })).filter((x) => x.link);
    const snap = JSON.stringify([T("lot_balances"), T("movements"), T("balances")]);
    try {
      for (const { leg, link } of links) if (link.delta > 0) debitLot(link.lot_id, leg.location_id, link.delta);
      const res = warehouseRpc(tables, `${house}_stock_reverse`, a);
      for (const { leg, link } of links) if (link.delta < 0) creditLot(link.lot_id, leg.location_id, -link.delta);
      for (const id of res.movement_ids) { const r = T("movements").find((x) => x.id === id); const l = links.find((x) => x.leg.id === r.reverses_id); if (l) linkLot(id, l.link.lot_id, -l.link.delta); }
      return res;
    } catch (e) {
      const [lb, mv, ba] = JSON.parse(snap);
      Object.assign(tables, { [`${house}_stock_lot_balances`]: lb, [`${house}_stock_movements`]: mv, [`${house}_stock_balances`]: ba });
      throw e;
    }
  }

  if (fn === "lot_update") {
    const lot = lotOf(a.p_lot);
    if (!lot) throw new Refusal("unknown_lot");
    if (lot.version !== a.p_expected_version) throw new Refusal("stale_version");
    const reason = String(a.p_reason || "").trim();
    if (reason.length < 3 || reason.length > 300) throw new Refusal("reason_required");
    const status = a.p_status || lot.status;
    if (!["active", "quarantine", "rejected"].includes(status)) throw new Refusal("bad_lot");
    const expiry = a.p_set_expiry ? (a.p_expiry || null) : lot.expiry_date;
    if (status === lot.status && expiry === lot.expiry_date) throw new Refusal("nothing_to_change");
    if (lot.status === "rejected") throw new Refusal("lot_rejected");
    const was = lot.status !== "active" || (lot.expiry_date && lot.expiry_date < today), will = status !== "active" || (expiry && expiry < today);
    if (will && !was) {
      for (const lb of lotBals().filter((x) => x.lot_id === lot.id && x.quantity > 0)) {
        const b = bal(lb.location_id, lot.product_id);
        const un = unusableQty(lb.location_id, lot.product_id);
        if (b.quantity - b.reserved < un + lb.quantity) throw new Refusal("reserved_stock_in_lot", `available=${Math.max(b.quantity - b.reserved - un, 0)}`);
      }
    }
    if (status !== lot.status) lotEvent(lot.id, "status", lot.status, status, reason);
    if (expiry !== lot.expiry_date) lotEvent(lot.id, "expiry", lot.expiry_date, expiry, reason);
    Object.assign(lot, { status, expiry_date: expiry, version: lot.version + 1, updated_at: new Date().toISOString() });
    return { ok: true, lot_id: lot.id, version: lot.version };
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
    guardBalance(b, b.quantity, b.reserved + q);
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
