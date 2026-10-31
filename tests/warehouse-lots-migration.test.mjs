// Migration 45 (warehouse lots, expiry, quarantine) run for real on a throw-away PostgreSQL cluster, for BOTH houses (skipped where the server
// binaries are not installed). Proves: it needs migration 36 and changes nothing without it; it is idempotent and private; lot stock never
// exceeds the product's balance; quarantined / rejected / expired stock can be neither issued, transferred nor reserved — by any path,
// including the older functions of migration 36; a lot becoming unusable is refused while reserved stock would be left uncovered; the lot
// of a movement is recorded with it and a reversal puts the stock back into the same lot; a refusal leaves nothing half-done; the same key
// twice (also from two sessions at once) posts once; links and events are append-only; the template and the committed file agree.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createCluster, SKIP, root } from "./helpers/pgCluster.mjs";

const pg = createCluster("pg45", 7500);
before(() => pg.start({ migrations: { 30: "30_operator_security.sql", 34: "34_operator_users.sql", 36: "36_warehouse.sql", 41: "41_warehouse_counts.sql", 45: "45_warehouse_lots.sql" } }));
after(() => pg.stop());

const must = (r) => pg.must(r);
const psql = (sql, o) => pg.psql(sql, o);
const sc = (sql) => pg.psql(sql, { role: "service_role" });
const q = (v) => (v == null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const refusal = (r, code) => { assert.equal(r.ok, false, `expected a refusal: ${code}`); assert.match(r.err, new RegExp(`stock:${code}`), r.err); };
const json = (r) => JSON.parse(must(r));

// the older (lot-unaware) function of migration 36 and the lot-aware ones of 45
const post = (h, key, kind, product, loc, to, qty, o = {}) =>
  sc(`SELECT public.${h}_stock_post(${q(key)}, ${q(kind)}, ${product}, ${loc}, ${to ?? "NULL"}, ${qty}, ${q(o.reason)}, ${q(o.reference)}, ${o.reservation ?? "NULL"}, NULL, 'tester', 'req-1')`);
const lotPost = (h, key, kind, product, loc, to, qty, o = {}) =>
  sc(`SELECT public.${h}_stock_lot_post(${q(key)}, ${q(kind)}, ${product}, ${loc}, ${to ?? "NULL"}, ${qty}, ${q(o.reason)}, ${q(o.reference)}, ${o.reservation ?? "NULL"}, NULL, 'tester', 'req-1', ${o.lotId ?? "NULL"}, ${q(o.code)}, ${o.expiry ? `'${o.expiry}'::date` : "NULL"}, ${q(o.status)})`);
const lotReverse = (h, key, id, reason = "wrong entry") => sc(`SELECT public.${h}_stock_lot_reverse(${q(key)}, ${id}, ${q(reason)}, NULL, 'tester', 'req-2')`);
const lotUpdate = (h, lot, version, o = {}) => sc(`SELECT public.${h}_stock_lot_update(${lot}, ${version}, ${q(o.status)}, ${o.setExpiry ? "TRUE" : "FALSE"}, ${o.expiry ? `'${o.expiry}'::date` : "NULL"}, ${q(o.reason ?? "quality check")}, NULL, 'tester', 'req-5')`);
const reserve = (h, key, product, loc, qty) => sc(`SELECT public.${h}_stock_reserve(${q(key)}, ${product}, ${loc}, ${qty}, 'order-7', NULL, NULL, 'tester', 'req-3')`);
const bal = (h, loc, product = 1) => must(psql(`SELECT COALESCE((SELECT quantity || '/' || reserved FROM ${h}_stock_balances WHERE location_id = ${loc} AND product_id = ${product}), 'none')`));
const lotQty = (h, lot, loc) => Number(must(psql(`SELECT COALESCE((SELECT quantity FROM ${h}_stock_lot_balances WHERE lot_id = ${lot} AND location_id = ${loc}), 0)`)));
const unusable = (h, loc = 1, product = 1) => Number(must(psql(`SELECT public.${h}_stock_unusable(${loc}, ${product})`)));
const lotRow = (h, code, product = 1) => must(psql(`SELECT id || '|' || status || '|' || version || '|' || COALESCE(expiry_date::text, '') FROM ${h}_stock_lots WHERE product_id = ${product} AND lot_code = ${q(code)}`)).split("|");
const today = () => must(psql("SELECT public.stock_today()"));
const day = (offset) => must(psql(`SELECT (public.stock_today() + ${offset})::text`));
const rowsOf = (h) => Number(must(psql(`SELECT count(*) FROM ${h}_stock_movements`)));

test("the committed migration is exactly the template's output", () => {
  const r = spawnSync(process.execPath, [path.join(root, "scripts/db/gen-warehouse-lots-migration.mjs"), "--check"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
});

test("needs migration 36 and changes nothing without it", { skip: SKIP }, () => {
  must(psql(pg.M(30), { file: true })); must(psql(pg.M(34), { file: true }));
  must(psql("CREATE TABLE public.products (id BIGINT PRIMARY KEY, sku TEXT); CREATE TABLE public.beauty_products (id BIGINT PRIMARY KEY, sku TEXT); INSERT INTO products VALUES (1,'H-1'),(2,'H-2'); INSERT INTO beauty_products VALUES (1,'B-1'),(2,'B-2');"));
  const r = psql(pg.M(45), { file: true });
  assert.equal(r.ok, false); assert.match(r.err, /needs migration 36/);
  must(psql(pg.M(36), { file: true })); must(psql(pg.M(41), { file: true }));
  assert.equal(must(psql("SELECT to_regclass('public.health_stock_lots') IS NULL")), "t", "the failed run left nothing behind");
});

test("applies, is idempotent, and is private (also for service_role: no direct writes)", { skip: SKIP }, () => {
  must(psql(pg.M(45), { file: true })); must(psql(pg.M(45), { file: true }));
  for (const h of ["health", "beauty"]) {
    for (const t of ["lots", "lot_balances", "movement_lots", "lot_events"]) {
      const tbl = `${h}_stock_${t}`;
      for (const role of ["anon", "authenticated"]) {
        assert.equal(psql(`SELECT * FROM ${tbl}`, { role }).ok, false, `${role} must not read ${tbl}`);
        assert.equal(psql(`DELETE FROM ${tbl}`, { role }).ok, false);
      }
      assert.equal(must(psql(`SELECT count(*) FROM pg_policies WHERE tablename = '${tbl}'`)), "0");
      assert.equal(must(psql(`SELECT relrowsecurity FROM pg_class WHERE oid = 'public.${tbl}'::regclass`)), "t");
      assert.equal(sc(`SELECT count(*) FROM ${tbl}`).ok, true, "service_role reads");
      assert.equal(sc(`DELETE FROM ${tbl}`).ok, false, "…and cannot write");
    }
    assert.equal(sc(`INSERT INTO ${h}_stock_lots(product_id, lot_code) VALUES (1, 'FORGED')`).ok, false);
    assert.equal(sc(`INSERT INTO ${h}_stock_lot_balances(lot_id, location_id, quantity) VALUES (1, 1, 5)`).ok, false);
    for (const fn of ["lot_post('abcdefgh','receive',1,1,NULL,1,NULL,NULL,NULL,NULL,'x','r',NULL,'L1',NULL,NULL)", "lot_reverse('abcdefgh',1,'because',NULL,'x','r')", "lot_update(1,1,'quarantine',FALSE,NULL,'because',NULL,'x','r')", "unusable(1,1)"]) {
      for (const role of ["anon", "authenticated"]) assert.equal(psql(`SELECT public.${h}_stock_${fn}`, { role }).ok, false, `${role} must not run ${h}_stock_${fn.split("(")[0]}`);
    }
  }
});

for (const h of ["health", "beauty"]) {
  const other = h === "health" ? "beauty" : "health";
  test(`${h}: set-up — warehouses`, { skip: SKIP }, () => {
    must(sc(`INSERT INTO ${h}_stock_locations(code, name) VALUES ('MAIN', 'Main'), ('SHOP', 'Shop')`));
  });

  test(`${h}: receiving into a lot records the lot, its expiry and the link; stock without a lot is untouched`, { skip: SKIP }, () => {
    json(post(h, `${h}-rec-plain-1`, "receive", 1, 1, null, 6));                                       // 6 without a lot
    const r = json(lotPost(h, `${h}-rec-lot-a-1`, "receive", 1, 1, null, 4, { code: "A-100", expiry: day(60), reference: "PO-9" }));
    assert.equal(r.ok, true); assert.equal(r.lot_created, true);
    const [id, status, version, expiry] = lotRow(h, "A-100");
    assert.equal(status, "active"); assert.equal(version, "1"); assert.equal(expiry, day(60));
    assert.equal(bal(h, 1), "10.000/0.000");
    assert.equal(lotQty(h, id, 1), 4.0);
    assert.equal(must(psql(`SELECT count(*) FROM ${h}_stock_movement_lots WHERE lot_id = ${id} AND delta = 4`)), "1", "the ledger row names its lot");
    assert.equal(must(psql(`SELECT kind || ':' || COALESCE(to_value, '') FROM ${h}_stock_lot_events WHERE lot_id = ${id}`)), "create:active");
    // the same code again adds to the same lot; a different expiry date for the same code is refused
    const again = json(lotPost(h, `${h}-rec-lot-a-2`, "receive", 1, 1, null, 2, { code: "a-100" }));
    assert.equal(again.lot_created, false); assert.equal(lotQty(h, id, 1), 6.0);
    refusal(lotPost(h, `${h}-rec-lot-a-3`, "receive", 1, 1, null, 1, { code: "A-100", expiry: day(90) }), "lot_expiry_mismatch");
    assert.equal(bal(h, 1), "12.000/0.000");
    // arguments that make no sense
    refusal(lotPost(h, `${h}-bad-lot-0001`, "issue", 1, 1, null, 1, { code: "NEW" }), "bad_lot");                        // a new lot is created by a receipt only
    refusal(lotPost(h, `${h}-bad-lot-0002`, "receive", 1, 1, null, 1, { lotId: 1 }), "bad_lot");
    refusal(lotPost(h, `${h}-bad-lot-0003`, "receive", 1, 1, null, 1, { expiry: day(5) }), "bad_lot");                    // expiry without a code
    refusal(lotPost(h, `${h}-bad-lot-0004`, "receive", 1, 1, null, 1, { code: "Z", status: "rejected" }), "bad_lot");
    refusal(lotPost(h, `${h}-bad-lot-0005`, "receive", 99, 1, null, 1, { code: "Z" }), "unknown_product");
    assert.equal(must(psql(`SELECT count(*) FROM ${h}_stock_lots WHERE lot_code = 'Z'`)), "0", "no lot for a product that does not exist");
    assert.equal(psql(`SELECT 1 FROM ${h}_stock_lots WHERE lot_code = 'a-100'`).ok, true);
  });

  test(`${h}: the lot code is unique per product, case-insensitively, and per product only`, { skip: SKIP }, () => {
    json(lotPost(h, `${h}-rec-p2-lot-1`, "receive", 2, 1, null, 3, { code: "A-100" }));
    assert.equal(must(psql(`SELECT count(*) FROM ${h}_stock_lots WHERE lower(lot_code) = 'a-100'`)), "2");
    assert.equal(psql(`SELECT public.${h}_stock_lot_post('${h}-ctrl-code-1', 'receive', 2, 1, NULL, 1, NULL, NULL, NULL, NULL, 'x', 'r', NULL, E'bad\\ncode', NULL, NULL)`, { role: "service_role" }).ok, false, "a control character in a code is refused");
  });

  test(`${h}: issuing from a lot takes it from the lot; stock without a lot cannot eat into lot stock`, { skip: SKIP }, () => {
    const [id] = lotRow(h, "A-100");                                  // product 1: 6 without a lot, 6 in lot A-100
    json(lotPost(h, `${h}-iss-lot-0001`, "issue", 1, 1, null, 2, { lotId: id }));
    assert.equal(lotQty(h, id, 1), 4.0); assert.equal(bal(h, 1), "10.000/0.000");
    const n = rowsOf(h);
    refusal(lotPost(h, `${h}-iss-lot-0002`, "issue", 1, 1, null, 5, { lotId: id }), "insufficient_lot_stock");
    assert.equal(lotQty(h, id, 1), 4.0); assert.equal(rowsOf(h), n, "a refusal leaves nothing behind");
    // 6 without a lot: 7 of them do not exist, the lot's stock is protected (older function of migration 36, or the new one without a lot)
    refusal(post(h, `${h}-iss-plain-001`, "issue", 1, 1, null, 7), "lot_stock_protected");
    refusal(lotPost(h, `${h}-iss-plain-002`, "issue", 1, 1, null, 7), "lot_stock_protected");
    json(lotPost(h, `${h}-iss-plain-003`, "issue", 1, 1, null, 6));
    assert.equal(bal(h, 1), "4.000/0.000"); assert.equal(lotQty(h, id, 1), 4.0);
    // a lot of ANOTHER product is not this product's
    const [other2] = lotRow(h, "A-100", 2);
    refusal(lotPost(h, `${h}-iss-wrong-01`, "issue", 1, 1, null, 1, { lotId: other2 }), "unknown_lot");
    refusal(lotPost(h, `${h}-iss-wrong-02`, "issue", 1, 1, null, 1, { lotId: 99999 }), "unknown_lot");
  });

  test(`${h}: quarantine makes stock unusable for issue, transfer and reserve — by every path; releasing it brings it back`, { skip: SKIP }, () => {
    json(post(h, `${h}-q-fill-00001`, "receive", 1, 1, null, 6, {}));                  // 6 without a lot + 4 in lot A-100 = 10
    const [id, , version] = lotRow(h, "A-100");
    // reserve 3 of the 6 usable-without-lot units first
    json(reserve(h, `${h}-q-res-000001`, 1, 1, 3));
    refusal(lotUpdate(h, id, "9", { status: "quarantine" }), "stale_version");
    refusal(lotUpdate(h, id, version, { status: "quarantine", reason: "x" }), "reason_required");
    refusal(lotUpdate(h, id, version, {}), "nothing_to_change");
    json(lotUpdate(h, id, version, { status: "quarantine", reason: "supplier recall" }));
    const [, status, v2] = lotRow(h, "A-100");
    assert.equal(status, "quarantine"); assert.equal(v2, String(Number(version) + 1));
    assert.equal(unusable(h), 4.0);
    // 10 on hand, 3 reserved, 4 quarantined → 3 usable
    refusal(post(h, `${h}-q-iss-000001`, "issue", 1, 1, null, 4), "insufficient_stock");           // the older function is held by the same rule
    refusal(lotPost(h, `${h}-q-iss-000002`, "issue", 1, 1, null, 4), "insufficient_stock");
    assert.match(lotPost(h, `${h}-q-iss-000003`, "issue", 1, 1, null, 4).err, /available=3/, "the message says how much is usable");
    refusal(lotPost(h, `${h}-q-iss-000004`, "issue", 1, 1, null, 1, { lotId: id }), "lot_not_usable");
    refusal(lotPost(h, `${h}-q-trf-000001`, "transfer", 1, 1, 2, 1, { lotId: id }), "lot_not_usable");
    refusal(reserve(h, `${h}-q-res-000002`, 1, 1, 4), "insufficient_stock");
    json(reserve(h, `${h}-q-res-000003`, 1, 1, 3));                                                // exactly what is usable
    assert.equal(bal(h, 1), "10.000/6.000");
    // the events say who / why / from / to
    assert.equal(must(psql(`SELECT kind || ':' || from_value || '>' || to_value || ':' || reason FROM ${h}_stock_lot_events WHERE lot_id = ${id} AND kind = 'status'`)), "status:active>quarantine:supplier recall");
    // release it again
    json(lotUpdate(h, id, v2, { status: "active", reason: "inspection passed" }));
    assert.equal(unusable(h), 0.0);
    json(lotPost(h, `${h}-q-iss-000005`, "issue", 1, 1, null, 4, { lotId: id }));
    assert.equal(bal(h, 1), "6.000/6.000");
    // put the shelf back in order for the next tests
    for (const r of must(psql(`SELECT id FROM ${h}_stock_reservations WHERE status = 'active' ORDER BY id`)).split("\n")) json(sc(`SELECT public.${h}_stock_release('${h}-q-rel-${r}-xx', ${r}, NULL, 'tester', 'r')`));
    assert.equal(bal(h, 1), "6.000/0.000");
  });

  test(`${h}: expiry — a lot is expired the day AFTER its date (team calendar); expired stock is unusable; writing it off is allowed`, { skip: SKIP }, () => {
    json(lotPost(h, `${h}-exp-rec-0001`, "receive", 1, 1, null, 5, { code: "E-1", expiry: day(-1) }));       // received already expired: allowed, and unusable at once
    const [e1] = lotRow(h, "E-1");
    assert.equal(unusable(h), 5.0);
    refusal(lotPost(h, `${h}-exp-iss-0001`, "issue", 1, 1, null, 1, { lotId: e1 }), "lot_not_usable");
    refusal(lotPost(h, `${h}-exp-iss-0002`, "issue", 1, 1, null, 7), "insufficient_stock");                    // 11 on hand, 5 expired: only 6 are usable
    json(lotPost(h, `${h}-exp-rec-0002`, "receive", 1, 1, null, 3, { code: "E-2", expiry: today() }));        // today is the last valid day
    const [e2] = lotRow(h, "E-2");
    json(lotPost(h, `${h}-exp-iss-0003`, "issue", 1, 1, null, 1, { lotId: e2 }));
    // moving the date back makes it expire
    const [, , v] = lotRow(h, "E-2");
    json(lotUpdate(h, e2, v, { setExpiry: true, expiry: day(-3), reason: "label was wrong" }));
    assert.equal(unusable(h), 7.0);
    assert.equal(must(psql(`SELECT kind || ':' || to_value FROM ${h}_stock_lot_events WHERE lot_id = ${e2} AND kind = 'expiry'`)), `expiry:${day(-3)}`);
    // a write-off (adjust) is the way out of expired stock: any status, reason required, the lot goes down with the product
    refusal(lotPost(h, `${h}-exp-adj-0001`, "adjust", 1, 1, null, -5, { lotId: e1 }), "reason_required");
    json(lotPost(h, `${h}-exp-adj-0002`, "adjust", 1, 1, null, -5, { lotId: e1, reason: "expired, destroyed" }));
    json(lotPost(h, `${h}-exp-adj-0003`, "adjust", 1, 1, null, -2, { lotId: e2, reason: "expired, destroyed" }));
    assert.equal(unusable(h), 0.0);
    assert.equal(bal(h, 1), "6.000/0.000");
  });

  test(`${h}: a lot cannot become unusable while reserved stock would be left uncovered; a rejected lot is final`, { skip: SKIP }, () => {
    json(lotPost(h, `${h}-rsv-rec-0001`, "receive", 1, 1, null, 4, { code: "R-1" }));
    const [r1, , v] = lotRow(h, "R-1");                               // 6 without a lot + 4 in R-1 = 10
    json(reserve(h, `${h}-rsv-res-0001`, 1, 1, 8));
    refusal(lotUpdate(h, r1, v, { status: "quarantine" }), "reserved_stock_in_lot");                 // 10 - 8 reserved = 2 < 4
    assert.equal(lotRow(h, "R-1")[1], "active", "nothing changed");
    refusal(lotUpdate(h, r1, v, { setExpiry: true, expiry: day(-1) }), "reserved_stock_in_lot");
    json(sc(`SELECT public.${h}_stock_release('${h}-rsv-rel-0001', ${must(psql(`SELECT max(id) FROM ${h}_stock_reservations`))}, NULL, 'tester', 'r')`));
    json(lotUpdate(h, r1, v, { status: "rejected", reason: "failed inspection" }));
    refusal(lotUpdate(h, r1, lotRow(h, "R-1")[2], { status: "active" }), "lot_rejected");
    refusal(lotPost(h, `${h}-rsv-rec-0002`, "receive", 1, 1, null, 1, { code: "R-1" }), "lot_rejected");
    assert.equal(unusable(h), 4.0);
    json(lotPost(h, `${h}-rsv-adj-0001`, "adjust", 1, 1, null, -4, { lotId: r1, reason: "rejected goods returned" }));
    assert.equal(bal(h, 1), "6.000/0.000");
  });

  test(`${h}: a transfer moves the lot between warehouses (both legs or neither); a reversal puts the stock back into the same lot`, { skip: SKIP }, () => {
    json(lotPost(h, `${h}-trf-rec-0001`, "receive", 1, 1, null, 5, { code: "T-1", expiry: day(30) }));
    const [t1] = lotRow(h, "T-1");
    const out = json(lotPost(h, `${h}-trf-out-0001`, "transfer", 1, 1, 2, 3, { lotId: t1 }));
    assert.equal(lotQty(h, t1, 1), 2.0); assert.equal(lotQty(h, t1, 2), 3.0);
    assert.equal(bal(h, 2), "3.000/0.000");
    assert.deepEqual(must(psql(`SELECT string_agg(delta::text, ',' ORDER BY movement_id) FROM ${h}_stock_movement_lots WHERE movement_id IN (${out.movement_ids.join(",")})`)).split(","), ["-3.000", "3.000"]);
    refusal(lotPost(h, `${h}-trf-out-0002`, "transfer", 1, 1, 2, 3, { lotId: t1 }), "insufficient_lot_stock");
    assert.equal(lotQty(h, t1, 1), 2.0, "nothing moved by the refused transfer");
    // reverse the transfer: the lot returns
    json(lotReverse(h, `${h}-trf-rev-0001`, out.movement_ids[0]));
    assert.equal(lotQty(h, t1, 1), 5.0); assert.equal(lotQty(h, t1, 2), 0.0); assert.equal(bal(h, 2), "0.000/0.000");
    refusal(lotReverse(h, `${h}-trf-rev-0002`, out.movement_ids[0]), "already_reversed");
    assert.equal(lotQty(h, t1, 1), 5.0);
    // reversing a receipt takes the stock out of the lot — impossible when it has been issued since
    const rcv = json(lotPost(h, `${h}-trf-rec-0002`, "receive", 1, 1, null, 2, { code: "T-2" }));
    const [t2] = lotRow(h, "T-2");
    json(lotPost(h, `${h}-trf-iss-0001`, "issue", 1, 1, null, 2, { lotId: t2 }));
    const before = bal(h, 1);
    refusal(lotReverse(h, `${h}-trf-rev-0003`, rcv.movement_ids[0]), "insufficient_lot_stock");
    assert.equal(bal(h, 1), before); assert.equal(lotQty(h, t2, 1), 0.0);
    // reversing an issue puts the stock back into the same lot
    const iss = json(lotPost(h, `${h}-trf-iss-0002`, "issue", 1, 1, null, 3, { lotId: t1 }));
    assert.equal(lotQty(h, t1, 1), 2.0);
    json(lotReverse(h, `${h}-trf-rev-0004`, iss.movement_ids[0]));
    assert.equal(lotQty(h, t1, 1), 5.0);
    assert.equal(must(psql(`SELECT l.delta FROM ${h}_stock_movement_lots l JOIN ${h}_stock_movements m ON m.id = l.movement_id WHERE m.kind = 'reversal' AND m.reverses_id = ${iss.movement_ids[0]}`)), "3.000", "the reversal row names the lot too");
  });

  test(`${h}: the same key twice posts once (also two sessions at once); the same key with another lot is refused; a failure rolls the lot back too`, { skip: SKIP }, async () => {
    const [t1] = lotRow(h, "T-1");
    const k = `${h}-idem-0001`;
    const a = json(lotPost(h, k, "issue", 1, 1, null, 1, { lotId: t1 }));
    const b = json(lotPost(h, k, "issue", 1, 1, null, 1, { lotId: t1 }));
    assert.equal(a.replayed, false); assert.equal(b.replayed, true);
    assert.equal(lotQty(h, t1, 1), 4.0, "taken from the lot once");
    refusal(lotPost(h, k, "issue", 1, 1, null, 1), "idempotency_key_reused");                              // the same key, no lot
    refusal(lotPost(h, k, "issue", 1, 1, null, 2, { lotId: t1 }), "idempotency_key_reused");               // the same key, another quantity
    const [t2] = lotRow(h, "T-2");
    refusal(lotPost(h, k, "issue", 1, 1, null, 1, { lotId: t2 }), "idempotency_key_reused");               // the same key, another lot
    // two sessions with one key at the same moment
    const sql = `SELECT public.${h}_stock_lot_post('${h}-idem-race-1', 'issue', 1, 1, NULL, 1, NULL, NULL, NULL, NULL, 'tester', 'r', ${t1}, NULL, NULL, NULL)`;
    const [x, y] = await Promise.all([pg.async(sql), pg.async(sql)]);
    assert.ok(x.ok && y.ok, `${x.err} ${y.err}`);
    assert.equal(lotQty(h, t1, 1), 3.0, "one movement, one debit");
    assert.equal(must(psql(`SELECT count(*) FROM ${h}_stock_movements WHERE idempotency_key = '${h}-idem-race-1'`)), "1");
    // a failure AFTER the lot was debited (the reservation does not match) rolls the debit back
    json(reserve(h, `${h}-idem-res-0001`, 1, 1, 1));
    const rid = must(psql(`SELECT max(id) FROM ${h}_stock_reservations`));
    refusal(lotPost(h, `${h}-idem-bad-0001`, "issue", 1, 1, null, 2, { lotId: t1, reservation: rid }), "reservation_mismatch");
    assert.equal(lotQty(h, t1, 1), 3.0, "the lot is exactly as it was");
    json(sc(`SELECT public.${h}_stock_release('${h}-idem-rel-0001', ${rid}, NULL, 'tester', 'r')`));
  });

  test(`${h}: lot stock never exceeds the product's balance, and no direct write, delete or edit gets around the functions`, { skip: SKIP }, () => {
    const [t1] = lotRow(h, "T-1");
    // as the OWNER (a script, a console): the guards still hold
    assert.match(psql(`UPDATE ${h}_stock_lot_balances SET quantity = quantity + 1 WHERE lot_id = ${t1} AND location_id = 1`).err, /write_only_through_functions/);
    assert.match(psql(`DELETE FROM ${h}_stock_lots WHERE id = ${t1}`).err, /never_deleted/);
    assert.match(psql(`UPDATE ${h}_stock_lots SET lot_code = 'RENAMED' WHERE id = ${t1}`).err, /write_only_through_functions/);
    assert.match(psql(`UPDATE ${h}_stock_movement_lots SET delta = 1`).err, /append_only/);
    assert.match(psql(`DELETE FROM ${h}_stock_lot_events`).err, /append_only/);
    assert.match(psql(`TRUNCATE ${h}_stock_movement_lots`).err, /append_only/);
    // even with the function flag on, the invariants hold
    const r = psql(`BEGIN; SELECT set_config('medoria.stock_write', 'on', true); UPDATE ${h}_stock_lot_balances SET quantity = quantity + 100 WHERE lot_id = ${t1} AND location_id = 1; COMMIT;`);
    refusal(r, "lot_stock_protected");
    const r2 = psql(`BEGIN; SELECT set_config('medoria.stock_write', 'on', true); UPDATE ${h}_stock_lots SET lot_code = 'RENAMED' WHERE id = ${t1}; COMMIT;`);
    refusal(r2, "lot_identity_is_fixed");
    const r3 = psql(`BEGIN; SELECT set_config('medoria.stock_write', 'on', true); UPDATE ${h}_stock_balances SET quantity = 0 WHERE location_id = 1 AND product_id = 1; COMMIT;`);
    refusal(r3, "lot_stock_protected");
  });

  test(`${h}: the other house is a separate warehouse — the same lot code there is unrelated and untouched`, { skip: SKIP }, () => {
    assert.equal(must(psql(`SELECT count(*) FROM ${other}_stock_lots`)), other === "health" ? must(psql("SELECT count(*) FROM health_stock_lots")) : must(psql("SELECT count(*) FROM beauty_stock_lots")));
    assert.equal(must(psql(`SELECT count(*) FROM ${h}_stock_lots WHERE product_id NOT IN (SELECT id FROM ${h === "health" ? "products" : "beauty_products"})`)), "0");
  });
}

test("the two houses stay in step: each has exactly the lots its own movements created", { skip: SKIP }, () => {
  for (const h of ["health", "beauty"]) {
    const links = Number(must(psql(`SELECT count(*) FROM ${h}_stock_movement_lots`)));
    assert.ok(links > 10, `${h}: ${links} lot links`);
    // the balance always equals the sum of its ledger rows, and lot stock is covered by the balance (both houses, every warehouse)
    assert.equal(must(psql(`SELECT count(*) FROM ${h}_stock_balances b WHERE b.quantity <> COALESCE((SELECT sum(delta) FROM ${h}_stock_movements m WHERE m.location_id = b.location_id AND m.product_id = b.product_id), 0)`)), "0");
    assert.equal(must(psql(`SELECT count(*) FROM ${h}_stock_balances b WHERE COALESCE((SELECT sum(lb.quantity) FROM ${h}_stock_lot_balances lb JOIN ${h}_stock_lots l ON l.id = lb.lot_id WHERE lb.location_id = b.location_id AND l.product_id = b.product_id), 0) > b.quantity`)), "0");
    // and every lot's balance equals the sum of its links (all locations)
    assert.equal(must(psql(`SELECT count(*) FROM ${h}_stock_lots l WHERE COALESCE((SELECT sum(quantity) FROM ${h}_stock_lot_balances WHERE lot_id = l.id), 0) <> COALESCE((SELECT sum(delta) FROM ${h}_stock_movement_lots WHERE lot_id = l.id), 0)`)), "0");
  }
});
