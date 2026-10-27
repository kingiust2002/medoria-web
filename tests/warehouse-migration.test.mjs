// Migration 36 (the internal warehouse) run for real on a throw-away PostgreSQL cluster (skipped where the server binaries are not
// installed). Proves: the committed SQL is the template's output; it needs migration 34 and the product tables; it is idempotent and
// PRIVATE (anon / authenticated reach nothing, not even the functions; service_role cannot write the ledger, balances or reservations
// directly); stock never goes negative; the same key twice is the same answer with no second effect, a different request under the
// same key is refused; a transfer moves both legs or neither; reversals undo once; reservations hold stock until released or consumed;
// the ledger is append-only; two simultaneous issues of the last units cannot both win; Health and Beauty never mix.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync, execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const pgBin = ["/usr/lib/postgresql/17/bin", "/usr/lib/postgresql/16/bin", "/usr/lib/postgresql/15/bin", "/usr/lib/postgresql/14/bin"].find((d) => fs.existsSync(path.join(d, "initdb")));
const isRoot = process.getuid?.() === 0;
const canRun = Boolean(pgBin) && (!isRoot || (spawnSync("id", ["nobody"]).status === 0 && spawnSync("which", ["runuser"]).status === 0));
const SKIP = canRun ? false : "PostgreSQL server binaries (and a non-root user to run them) are not available";
const asPg = (cmd, args, opts = {}) => (isRoot ? spawnSync("runuser", ["-u", "nobody", "--", cmd, ...args], { encoding: "utf8", ...opts }) : spawnSync(cmd, args, { encoding: "utf8", ...opts }));

let dir, sock;
const port = 6100 + (process.pid % 200);
const SETUP = "CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;";

const baseArgs = (db) => ["-h", sock, "-p", String(port), "-U", "postgres", "-d", db, "-X", "-At", "-v", "ON_ERROR_STOP=1", "-q"];
function psql(sql, { file = false, role = null, db = "postgres" } = {}) {
  const args = baseArgs(db);
  if (file) args.push("-f", sql); else args.push("-c", role ? `SET ROLE ${role}; ${sql}` : sql);
  const r = asPg(path.join(pgBin, "psql"), args);
  return { ok: r.status === 0, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}
// the same, asynchronously, so two sessions can really overlap
function psqlAsync(sql, role = "service_role") {
  const args = [...baseArgs("postgres"), "-c", `SET ROLE ${role}; ${sql}`];
  const [cmd, a] = isRoot ? ["runuser", ["-u", "nobody", "--", path.join(pgBin, "psql"), ...args]] : [path.join(pgBin, "psql"), args];
  return new Promise((resolve) => execFile(cmd, a, { encoding: "utf8" }, (err, stdout, stderr) => resolve({ ok: !err, out: (stdout || "").trim(), err: (stderr || "").trim() })));
}
const must = (r) => { assert.ok(r.ok, r.err); return r.out; };

before(() => {
  if (SKIP) return;
  dir = fs.mkdtempSync(path.join("/tmp", "pg36-"));
  sock = fs.mkdtempSync(path.join("/tmp", "s36-"));
  fs.chmodSync(dir, 0o777); fs.chmodSync(sock, 0o777);
  fs.writeFileSync(path.join(dir, "setup.sql"), SETUP);
  for (const [name, f] of [["m30.sql", "30_operator_security.sql"], ["m34.sql", "34_operator_users.sql"], ["m36.sql", "36_warehouse.sql"]]) fs.copyFileSync(path.join(root, "migrations", f), path.join(dir, name));
  for (const f of fs.readdirSync(dir)) fs.chmodSync(path.join(dir, f), 0o644);
  assert.equal(asPg(path.join(pgBin, "initdb"), ["-D", path.join(dir, "data"), "-U", "postgres", "-A", "trust"]).status, 0);
  const st = asPg(path.join(pgBin, "pg_ctl"), ["-D", path.join(dir, "data"), "-o", `-p ${port} -k ${sock} -c listen_addresses=''`, "-l", path.join(dir, "log"), "-w", "start"]);
  assert.equal(st.status, 0, st.stderr);
  must(psql(path.join(dir, "setup.sql"), { file: true }));
});
after(() => {
  if (SKIP || !dir) return;
  asPg(path.join(pgBin, "pg_ctl"), ["-D", path.join(dir, "data"), "-m", "immediate", "stop"]);
  fs.rmSync(dir, { recursive: true, force: true }); fs.rmSync(sock, { recursive: true, force: true });
});
const M = (n) => path.join(dir, `m${n}.sql`);

test("the committed migration is exactly the template's output", () => {
  const r = spawnSync(process.execPath, [path.join(root, "scripts/db/gen-warehouse-migration.mjs"), "--check"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
});

test("needs migration 34 and the product tables, and changes nothing without them", { skip: SKIP }, () => {
  const r = psql(M(36), { file: true });
  assert.equal(r.ok, false);
  assert.match(r.err, /needs migration 34/);
  must(psql(M(30), { file: true }));
  must(psql(M(34), { file: true }));
  const r2 = psql(M(36), { file: true });
  assert.equal(r2.ok, false);
  assert.match(r2.err, /needs the product tables/);
  must(psql("CREATE TABLE public.products (id BIGINT PRIMARY KEY, sku TEXT); CREATE TABLE public.beauty_products (id BIGINT PRIMARY KEY, sku TEXT);"));
  must(psql("INSERT INTO products VALUES (1, 'H-1'), (2, 'H-2'); INSERT INTO beauty_products VALUES (1, 'B-1');"));
  assert.equal(must(psql("SELECT to_regclass('public.health_stock_movements') IS NULL")), "t", "the failed runs left nothing behind");
});

test("applies, is idempotent, and is private", { skip: SKIP }, () => {
  must(psql(M(36), { file: true }));
  must(psql(M(36), { file: true }));
  for (const house of ["health", "beauty"]) {
    for (const t of ["locations", "balances", "movements", "reservations"]) {
      const tbl = `${house}_stock_${t}`;
      for (const role of ["anon", "authenticated"]) {
        assert.equal(psql(`SELECT * FROM ${tbl}`, { role }).ok, false, `${role} must not read ${tbl}`);
        assert.equal(psql(`DELETE FROM ${tbl}`, { role }).ok, false, `${role} must not write ${tbl}`);
      }
      assert.equal(must(psql(`SELECT count(*) FROM pg_policies WHERE tablename = '${tbl}'`)), "0");
      assert.equal(must(psql(`SELECT relrowsecurity FROM pg_class WHERE oid = 'public.${tbl}'::regclass`)), "t");
    }
    for (const fn of ["post('abcdefgh','receive',1,1,NULL,1,NULL,NULL,NULL,NULL,'x','r')", "reverse('abcdefgh',1,'because',NULL,'x','r')", "reserve('abcdefgh',1,1,1,NULL,NULL,NULL,'x','r')", "release('abcdefgh',1,NULL,'x','r')"]) {
      for (const role of ["anon", "authenticated"]) assert.equal(psql(`SELECT public.${house}_stock_${fn}`, { role }).ok, false, `${role} must not run ${house}_stock_${fn.split("(")[0]}`);
    }
    // service_role reads, manages locations, and cannot touch the ledger, balances or reservations directly
    for (const t of ["locations", "balances", "movements", "reservations"]) assert.equal(psql(`SELECT count(*) FROM ${house}_stock_${t}`, { role: "service_role" }).ok, true);
    assert.equal(psql(`INSERT INTO ${house}_stock_movements(idempotency_key, group_id, kind, product_id, location_id, delta, balance_after) VALUES ('forged-key-1', gen_random_uuid(), 'receive', 1, 1, 5, 5)`, { role: "service_role" }).ok, false);
    assert.equal(psql(`UPDATE ${house}_stock_balances SET quantity = 999`, { role: "service_role" }).ok, false);
    assert.equal(psql(`DELETE FROM ${house}_stock_locations`, { role: "service_role" }).ok, false, "locations are deactivated, never deleted");
  }
});

// ── behaviour ────────────────────────────────────────────────────────────────────────────────────────────────────────────
const q = (v) => (v == null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const post = (house, key, kind, product, loc, to, qty, o = {}) =>
  psql(`SELECT public.${house}_stock_post(${q(key)}, ${q(kind)}, ${product}, ${loc}, ${to ?? "NULL"}, ${qty}, ${q(o.reason)}, ${q(o.reference)}, ${o.reservation ?? "NULL"}, NULL, 'tester', 'req-1')`, { role: "service_role" });
const reverse = (house, key, id, reason = "wrong entry") => psql(`SELECT public.${house}_stock_reverse(${q(key)}, ${id}, ${q(reason)}, NULL, 'tester', 'req-2')`, { role: "service_role" });
const reserve = (house, key, product, loc, qty) => psql(`SELECT public.${house}_stock_reserve(${q(key)}, ${product}, ${loc}, ${qty}, 'order-7', NULL, NULL, 'tester', 'req-3')`, { role: "service_role" });
const release = (house, key, id) => psql(`SELECT public.${house}_stock_release(${q(key)}, ${id}, NULL, 'tester', 'req-4')`, { role: "service_role" });
const bal = (house, loc, product = 1) => must(psql(`SELECT COALESCE((SELECT quantity || '/' || reserved FROM ${house}_stock_balances WHERE location_id = ${loc} AND product_id = ${product}), 'none')`));
const rows = (house) => Number(must(psql(`SELECT count(*) FROM ${house}_stock_movements`)));
const json = (r) => JSON.parse(must(r));
const refusal = (r, code) => { assert.equal(r.ok, false); assert.match(r.err, new RegExp(`stock:${code}`), r.err); };

test("locations: a code is fixed, a location with stock cannot be deactivated", { skip: SKIP }, () => {
  must(psql("INSERT INTO health_stock_locations(code, name) VALUES ('MAIN', 'Main warehouse'), ('SHOP', 'Shop floor'), ('OLD', 'Old room')", { role: "service_role" }));
  must(psql("INSERT INTO beauty_stock_locations(code, name) VALUES ('MAIN', 'Beauty main')", { role: "service_role" }));
  assert.equal(psql("INSERT INTO health_stock_locations(code, name) VALUES ('MAIN', 'again')", { role: "service_role" }).ok, false, "unique code");
  assert.equal(psql("INSERT INTO health_stock_locations(code, name) VALUES ('bad code', 'x')", { role: "service_role" }).ok, false, "code pattern");
  assert.equal(psql("UPDATE health_stock_locations SET code = 'MAIN2' WHERE code = 'MAIN'", { role: "service_role" }).ok, false, "a code never changes");
  assert.equal(must(psql("SELECT version FROM health_stock_locations WHERE code = 'SHOP'")), "1");
  must(psql("UPDATE health_stock_locations SET name = 'Shop' WHERE code = 'SHOP'", { role: "service_role" }));
  assert.equal(must(psql("SELECT version FROM health_stock_locations WHERE code = 'SHOP'")), "2", "a real change moves the version");
  must(psql("UPDATE health_stock_locations SET is_active = FALSE WHERE code = 'OLD'", { role: "service_role" }));   // empty: fine
  assert.equal(must(psql("SELECT is_active FROM health_stock_locations WHERE code = 'OLD'")), "f");
});

test("receive / issue: balances move, stock never goes negative, a refusal leaves nothing behind", { skip: SKIP }, () => {
  const r = json(post("health", "key-receive-1", "receive", 1, 1, null, 10, { reference: "PO-5" }));
  assert.equal(r.ok, true); assert.equal(r.replayed, false); assert.equal(r.balance_after, 10);
  assert.equal(bal("health", 1), "10.000/0.000");
  assert.equal(must(psql("SELECT sku || '|' || balance_after || '|' || reference || '|' || actor_label FROM health_stock_movements ORDER BY id LIMIT 1")), "H-1|10.000|PO-5|tester", "the SKU is read from the product, not trusted from the caller");
  json(post("health", "key-issue-0001", "issue", 1, 1, null, 4));
  assert.equal(bal("health", 1), "6.000/0.000");
  const n = rows("health");
  refusal(post("health", "key-issue-0002", "issue", 1, 1, null, 7), "insufficient_stock");
  assert.equal(bal("health", 1), "6.000/0.000"); assert.equal(rows("health"), n, "no half-written row");
  for (const [qty, code] of [[0, "bad_quantity"], [-1, "bad_quantity"], ["1.2345", "bad_quantity"]]) refusal(post("health", "key-bad-qty-1", "receive", 1, 1, null, qty), code);
  refusal(post("health", "key-bad-kind-1", "teleport", 1, 1, null, 1), "bad_kind");
  refusal(post("health", "short", "receive", 1, 1, null, 1), "bad_key");
  refusal(post("health", "key-unknown-p1", "receive", 999, 1, null, 1), "unknown_product");
  refusal(post("health", "key-unknown-l1", "receive", 1, 999, null, 1), "unknown_location");
  refusal(post("health", "key-inactive-1", "receive", 1, 3, null, 1), "location_inactive");
  assert.equal(rows("health"), n);
});

test("idempotency: the same key again changes nothing; another request under the same key is refused", { skip: SKIP }, () => {
  const n = rows("health");
  const again = json(post("health", "key-receive-1", "receive", 1, 1, null, 10, { reference: "PO-5" }));
  assert.equal(again.replayed, true);
  assert.equal(bal("health", 1), "6.000/0.000"); assert.equal(rows("health"), n);
  refusal(post("health", "key-receive-1", "receive", 1, 1, null, 11), "idempotency_key_reused");
  refusal(post("health", "key-receive-1", "issue", 1, 1, null, 10), "idempotency_key_reused");
  refusal(post("health", "key-receive-1", "receive", 2, 1, null, 10), "idempotency_key_reused");
});

test("transfer: both legs or neither; adjust needs a reason", { skip: SKIP }, () => {
  const t = json(post("health", "key-transfer-1", "transfer", 1, 1, 2, 3));
  assert.equal(t.movement_ids.length, 2);
  assert.equal(bal("health", 1), "3.000/0.000"); assert.equal(bal("health", 2), "3.000/0.000");
  assert.equal(must(psql("SELECT count(DISTINCT group_id) || '|' || sum(delta) FROM health_stock_movements WHERE idempotency_key = 'key-transfer-1'")), "1|0.000", "one group, the legs cancel out");
  assert.equal(json(post("health", "key-transfer-1", "transfer", 1, 1, 2, 3)).replayed, true);
  assert.equal(bal("health", 1), "3.000/0.000");
  refusal(post("health", "key-transfer-2", "transfer", 1, 1, 1, 1), "bad_destination");
  refusal(post("health", "key-transfer-3", "transfer", 1, 1, null, 1), "bad_destination");
  refusal(post("health", "key-transfer-4", "transfer", 1, 1, 3, 1), "location_inactive");
  refusal(post("health", "key-transfer-5", "transfer", 1, 1, 2, 4), "insufficient_stock");
  assert.equal(bal("health", 1), "3.000/0.000"); assert.equal(bal("health", 2), "3.000/0.000");
  refusal(post("health", "key-adjust-001", "adjust", 1, 1, null, -1), "reason_required");
  refusal(post("health", "key-adjust-002", "adjust", 1, 1, null, -1, { reason: "ab" }), "reason_required");
  json(post("health", "key-adjust-003", "adjust", 1, 1, null, -1, { reason: "count correction" }));
  assert.equal(bal("health", 1), "2.000/0.000");
  json(post("health", "key-adjust-004", "adjust", 1, 1, null, 1.5, { reason: "found a box" }));
  assert.equal(bal("health", 1), "3.500/0.000");
  refusal(post("health", "key-adjust-005", "adjust", 1, 1, null, -4, { reason: "too many" }), "insufficient_stock");
});

test("reservations hold stock; consuming one issues exactly its quantity; releasing is idempotent", { skip: SKIP }, () => {
  // loc 1 / product 1 holds 3.5
  const r = json(reserve("health", "key-reserve-01", 1, 1, 2));
  assert.equal(r.replayed, false);
  assert.equal(bal("health", 1), "3.500/2.000");
  assert.equal(json(reserve("health", "key-reserve-01", 1, 1, 2)).replayed, true);
  assert.equal(bal("health", 1), "3.500/2.000", "a replay holds nothing twice");
  refusal(reserve("health", "key-reserve-01", 1, 1, 3), "idempotency_key_reused");
  refusal(reserve("health", "key-reserve-02", 1, 1, 2), "insufficient_stock");                    // only 1.5 available
  refusal(post("health", "key-issue-0003", "issue", 1, 1, null, 2), "insufficient_stock");        // reserved stock is not for anybody else
  refusal(post("health", "key-issue-0004", "issue", 1, 1, null, 1, { reservation: r.reservation_id }), "reservation_mismatch");
  json(post("health", "key-issue-0005", "issue", 1, 1, null, 1.5));                                // the free part can go
  assert.equal(bal("health", 1), "2.000/2.000");
  const used = json(post("health", "key-issue-0006", "issue", 1, 1, null, 2, { reservation: r.reservation_id }));
  assert.equal(used.balance_after, 0);
  assert.equal(bal("health", 1), "0.000/0.000");
  assert.equal(must(psql(`SELECT status || '|' || close_key FROM health_stock_reservations WHERE id = ${r.reservation_id}`)), "consumed|key-issue-0006");
  refusal(release("health", "key-release-01", r.reservation_id), "reservation_not_active");
  // release
  json(post("health", "key-receive-2", "receive", 1, 1, null, 5));
  const r2 = json(reserve("health", "key-reserve-03", 1, 1, 4));
  assert.equal(bal("health", 1), "5.000/4.000");
  json(release("health", "key-release-02", r2.reservation_id));
  assert.equal(bal("health", 1), "5.000/0.000");
  assert.equal(json(release("health", "key-release-02", r2.reservation_id)).replayed, true);
  refusal(release("health", "key-release-03", r2.reservation_id), "reservation_not_active");
  refusal(release("health", "key-release-04", 99999), "unknown_reservation");
  // a location holding a reservation cannot be switched off
  const r3 = json(reserve("health", "key-reserve-04", 1, 1, 1));
  assert.equal(psql("UPDATE health_stock_locations SET is_active = FALSE WHERE code = 'MAIN'", { role: "service_role" }).ok, false);
  json(release("health", "key-release-05", r3.reservation_id));
});

test("reversals: undo once, never undo an undo, a transfer comes back whole, stock that is gone cannot be 'un-received'", { skip: SKIP }, () => {
  const idOf = (key, leg = 0) => must(psql(`SELECT id FROM health_stock_movements WHERE idempotency_key = '${key}' AND leg = ${leg}`));
  // loc1 5, loc2 3
  assert.equal(bal("health", 1), "5.000/0.000"); assert.equal(bal("health", 2), "3.000/0.000");
  const rv = json(reverse("health", "key-reverse-01", idOf("key-transfer-1", 1)));          // naming the destination leg undoes the whole transfer
  assert.equal(rv.movement_ids.length, 2);
  assert.equal(bal("health", 1), "8.000/0.000"); assert.equal(bal("health", 2), "0.000/0.000");
  assert.equal(json(reverse("health", "key-reverse-01", idOf("key-transfer-1", 0))).replayed, true, "the same key again = the same answer");
  assert.equal(bal("health", 1), "8.000/0.000");
  refusal(reverse("health", "key-reverse-02", idOf("key-transfer-1", 0)), "already_reversed");
  const revRow = must(psql("SELECT id FROM health_stock_movements WHERE kind = 'reversal' ORDER BY id LIMIT 1"));
  refusal(reverse("health", "key-reverse-03", revRow), "cannot_reverse_a_reversal");
  refusal(reverse("health", "key-reverse-04", idOf("key-receive-2"), "no"), "reason_required");
  refusal(reverse("health", "key-reverse-05", 987654), "unknown_movement");
  // key-receive-2 added 5 to loc 1; issue most of it, then un-receiving would go negative
  json(post("health", "key-issue-0007", "issue", 1, 1, null, 8));
  refusal(reverse("health", "key-reverse-06", idOf("key-receive-2")), "insufficient_stock");
  assert.equal(bal("health", 1), "0.000/0.000");
  const before = rows("health");
  refusal(reverse("health", "key-reverse-07", idOf("key-receive-2")), "insufficient_stock");
  assert.equal(rows("health"), before, "a refused reversal writes nothing");
  // reversing an issue returns the stock
  json(reverse("health", "key-reverse-08", idOf("key-issue-0007"), "issued by mistake"));
  assert.equal(bal("health", 1), "8.000/0.000");
});

test("the ledger is append-only and nothing writes balances / rows outside the functions — even a superuser's plain SQL", { skip: SKIP }, () => {
  for (const sql of ["UPDATE health_stock_movements SET reason = 'x'", "DELETE FROM health_stock_movements", "TRUNCATE health_stock_movements"]) {
    refusal(psql(sql), "ledger_is_append_only");
  }
  refusal(psql("UPDATE health_stock_balances SET quantity = 1000"), "write_only_through_functions");
  refusal(psql("DELETE FROM health_stock_balances"), "never_deleted");
  refusal(psql("INSERT INTO health_stock_balances(location_id, product_id, quantity) VALUES (2, 2, 5)"), "write_only_through_functions");
  refusal(psql("INSERT INTO health_stock_movements(idempotency_key, group_id, kind, product_id, location_id, delta, balance_after) VALUES ('forged-key-2', gen_random_uuid(), 'receive', 1, 1, 5, 5)"), "write_only_through_functions");
  refusal(psql("UPDATE health_stock_reservations SET qty = 100"), "write_only_through_functions");
  refusal(psql("DELETE FROM health_stock_reservations"), "never_deleted");
  // CHECKs hold even when the guards are bypassed on purpose
  const sneaky = (sql) => psql(`SELECT set_config('medoria.stock_write', 'on', false); ${sql}`);
  assert.equal(sneaky("UPDATE health_stock_balances SET quantity = -1 WHERE location_id = 1").ok, false, "never negative");
  assert.equal(sneaky("UPDATE health_stock_balances SET reserved = quantity + 1 WHERE location_id = 1").ok, false, "never more reserved than present");
  assert.equal(sneaky("INSERT INTO health_stock_movements(idempotency_key, group_id, kind, product_id, location_id, delta, balance_after) VALUES ('forged-key-3', gen_random_uuid(), 'issue', 1, 1, 5, 5)").ok, false, "an issue must take stock away");
  assert.equal(sneaky("INSERT INTO health_stock_movements(idempotency_key, group_id, kind, product_id, location_id, delta, balance_after) VALUES ('forged-key-4', gen_random_uuid(), 'adjust', 1, 1, 5, 5)").ok, false, "an adjustment needs a reason");
});

test("two sessions at once: the last units go to one of them; the same key twice is one movement", { skip: SKIP }, async () => {
  json(post("health", "key-receive-3", "receive", 2, 1, null, 5));          // product 2 at loc 1: 5
  const call = (key) => psqlAsync(`SELECT public.health_stock_post('${key}', 'issue', 2, 1, NULL, 5, NULL, NULL, NULL, NULL, 'racer', 'r')`);
  const [a, b] = await Promise.all([call("race-issue-aaaa"), call("race-issue-bbbb")]);
  assert.equal([a, b].filter((x) => x.ok).length, 1, `exactly one wins: ${a.err} | ${b.err}`);
  assert.match([a, b].find((x) => !x.ok).err, /stock:insufficient_stock/);
  assert.equal(bal("health", 1, 2), "0.000/0.000");
  json(post("health", "key-receive-4", "receive", 2, 1, null, 5));
  const same = () => psqlAsync("SELECT public.health_stock_post('race-same-key-1', 'issue', 2, 1, NULL, 2, NULL, NULL, NULL, NULL, 'racer', 'r')");
  const [c, d] = await Promise.all([same(), same()]);
  assert.ok(c.ok && d.ok, `${c.err} | ${d.err}`);
  assert.equal([c, d].filter((x) => JSON.parse(x.out).replayed).length, 1, "one did it, the other got the same answer");
  assert.equal(bal("health", 1, 2), "3.000/0.000", "issued once, not twice");
  // opposite transfers in parallel cannot deadlock
  json(post("health", "key-receive-5", "receive", 2, 2, null, 5));
  const t1 = psqlAsync("SELECT public.health_stock_post('race-xfer-aaaa', 'transfer', 2, 1, 2, 1, NULL, NULL, NULL, NULL, 'racer', 'r')");
  const t2 = psqlAsync("SELECT public.health_stock_post('race-xfer-bbbb', 'transfer', 2, 2, 1, 1, NULL, NULL, NULL, NULL, 'racer', 'r')");
  const [x, y] = await Promise.all([t1, t2]);
  assert.ok(x.ok && y.ok, `${x.err} | ${y.err}`);
  assert.equal(bal("health", 1, 2), "3.000/0.000"); assert.equal(bal("health", 2, 2), "5.000/0.000");
});

test("the balance always equals the sum of its ledger rows, and balance_after always matches the running total", { skip: SKIP }, () => {
  assert.equal(must(psql(`SELECT count(*) FROM health_stock_balances b WHERE b.quantity <> COALESCE((SELECT sum(delta) FROM health_stock_movements m WHERE m.location_id = b.location_id AND m.product_id = b.product_id), 0)`)), "0");
  assert.equal(must(psql(`SELECT count(*) FROM (SELECT balance_after, sum(delta) OVER (PARTITION BY location_id, product_id ORDER BY id) AS running FROM health_stock_movements) s WHERE s.balance_after <> s.running`)), "0");
});

test("Beauty is its own warehouse: same rules, separate data, its own product table", { skip: SKIP }, () => {
  const r = json(post("beauty", "key-b-receive-1", "receive", 1, 1, null, 7));
  assert.equal(r.balance_after, 7);
  assert.equal(bal("beauty", 1), "7.000/0.000");
  refusal(post("beauty", "key-b-issue-0001", "issue", 1, 1, null, 8), "insufficient_stock");
  refusal(post("beauty", "key-b-receive-2", "receive", 2, 1, null, 1), "unknown_product");        // Health's product 2 does not exist in Beauty
  assert.equal(must(psql("SELECT sku FROM beauty_stock_movements LIMIT 1")), "B-1");
  assert.equal(rows("beauty"), 1);
  // keys are per house: Health's "key-receive-1" is just another new key for Beauty
  assert.equal(json(post("beauty", "key-receive-1", "receive", 1, 1, null, 10)).replayed, false);
  assert.equal(bal("beauty", 1), "17.000/0.000");
  assert.equal(must(psql("SELECT count(*) FROM health_stock_movements WHERE product_id = 1 AND sku = 'B-1'")), "0", "no Beauty row in Health's ledger");
});
