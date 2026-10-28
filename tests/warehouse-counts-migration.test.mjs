// Migration 41 (stock counts and minimum levels) run for real on a throw-away PostgreSQL cluster (skipped where the server binaries are not
// installed). Proves: it needs migration 36; it is idempotent and private; one open count per warehouse; a count is decided once and then
// frozen together with its lines; lines of a closed count cannot change; expected quantities never change; counts are never deleted.
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
const port = 7100 + (process.pid % 200);
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
  dir = fs.mkdtempSync(path.join("/tmp", "pg41-"));
  sock = fs.mkdtempSync(path.join("/tmp", "s41-"));
  fs.chmodSync(dir, 0o777); fs.chmodSync(sock, 0o777);
  fs.writeFileSync(path.join(dir, "setup.sql"), SETUP);
  for (const [name, f] of [["m30.sql", "30_operator_security.sql"], ["m34.sql", "34_operator_users.sql"], ["m36.sql", "36_warehouse.sql"], ["m41.sql", "41_warehouse_counts.sql"]]) fs.copyFileSync(path.join(root, "migrations", f), path.join(dir, name));
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


const HASH = "scrypt:131072:8:1:aa:bb";
const A = "00000000-0000-4000-8000-00000000000a";
const sc = (sql, o = {}) => psql(sql, { role: "service_role", ...o });

test("needs migration 36, and changes nothing without it", { skip: SKIP }, () => {
  must(psql(M(30), { file: true })); must(psql(M(34), { file: true }));
  const r = psql(M(41), { file: true });
  assert.equal(r.ok, false); assert.match(r.err, /needs migration 36/);
  must(psql("CREATE TABLE public.products (id BIGINT PRIMARY KEY, sku TEXT); CREATE TABLE public.beauty_products (id BIGINT PRIMARY KEY, sku TEXT); INSERT INTO products VALUES (1,'H-1'),(2,'H-2');"));
  must(psql(M(36), { file: true }));
  assert.equal(must(psql("SELECT to_regclass('public.health_stock_counts') IS NULL")), "t");
});

test("applies, is idempotent and private", { skip: SKIP }, () => {
  must(psql(M(41), { file: true })); must(psql(M(41), { file: true }));
  must(psql("INSERT INTO health_stock_locations(code, name) VALUES ('MAIN','Main'), ('SHOP','Shop'); INSERT INTO beauty_stock_locations(code, name) VALUES ('BMAIN','B')"));
  for (const h of ["health", "beauty"]) for (const t of ["stock_levels", "stock_counts", "stock_count_lines"]) {
    for (const role of ["anon", "authenticated"]) assert.equal(psql(`SELECT * FROM ${h}_${t}`, { role }).ok, false, `${role} reads ${h}_${t}`);
    assert.equal(must(psql(`SELECT count(*) FROM pg_policies WHERE tablename = '${h}_${t}'`)), "0");
    assert.equal(sc(`SELECT count(*) FROM ${h}_${t}`).ok, true);
  }
  assert.equal(sc("DELETE FROM health_stock_counts").ok, false, "service_role cannot delete counts");
});

test("levels: a non-negative bounded minimum per product", { skip: SKIP }, () => {
  assert.equal(sc("INSERT INTO health_stock_levels(product_id, min_level, updated_label) VALUES (1, 5, 'sara')").ok, true);
  assert.equal(sc("INSERT INTO health_stock_levels(product_id, min_level) VALUES (1, 6)").ok, false, "one level per product");
  assert.equal(sc("INSERT INTO health_stock_levels(product_id, min_level) VALUES (2, -1)").ok, false);
  assert.equal(sc("UPDATE health_stock_levels SET min_level = 8 WHERE product_id = 1").ok, true);
  assert.equal(sc("DELETE FROM health_stock_levels WHERE product_id = 1").ok, true, "a level can be removed");
});

test("one open count per warehouse; a count is decided once and then frozen with its lines", { skip: SKIP }, () => {
  const id = must(sc("INSERT INTO health_stock_counts(location_id, created_label) VALUES (1, 'sara') RETURNING id")).split("\n")[0];
  assert.equal(sc("INSERT INTO health_stock_counts(location_id) VALUES (1)").ok, false, "a second open count on the same warehouse");
  assert.equal(sc("INSERT INTO health_stock_counts(location_id) VALUES (2)").ok, true, "another warehouse is independent");
  assert.equal(sc(`INSERT INTO health_stock_count_lines(count_id, product_id, sku, expected) VALUES (${id}, 1, 'H-1', 10), (${id}, 2, 'H-2', 4)`).ok, true);
  assert.equal(sc(`INSERT INTO health_stock_count_lines(count_id, product_id, expected) VALUES (${id}, 3, -1)`).ok, false, "negative expected");
  assert.equal(sc(`UPDATE health_stock_count_lines SET counted = 9, counted_label = 'sara' WHERE count_id = ${id} AND product_id = 1`).ok, true);
  assert.equal(sc(`UPDATE health_stock_count_lines SET expected = 11 WHERE count_id = ${id} AND product_id = 1`).ok, false, "what was expected never changes");
  assert.equal(sc(`UPDATE health_stock_count_lines SET counted = -2 WHERE count_id = ${id} AND product_id = 1`).ok, false);
  assert.equal(sc(`UPDATE health_stock_counts SET status = 'closed' WHERE id = ${id}`).ok, false, "closing needs closed_at");
  assert.equal(sc(`UPDATE health_stock_counts SET location_id = 2 WHERE id = ${id}`).ok, false, "a count never moves to another warehouse");
  assert.equal(sc(`UPDATE health_stock_counts SET status = 'closed', closed_at = now(), closed_label = 'sara', differences = 1 WHERE id = ${id}`).ok, true);
  for (const sql of [`UPDATE health_stock_counts SET note = 'x' WHERE id = ${id}`, `UPDATE health_stock_counts SET status = 'open', closed_at = NULL WHERE id = ${id}`, `DELETE FROM health_stock_counts WHERE id = ${id}`]) {
    const r = psql(sql); assert.equal(r.ok, false, sql);
  }
  for (const sql of [`UPDATE health_stock_count_lines SET counted = 1 WHERE count_id = ${id}`, `INSERT INTO health_stock_count_lines(count_id, product_id, expected) VALUES (${id}, 9, 1)`, `DELETE FROM health_stock_count_lines WHERE count_id = ${id}`]) {
    const r = sc(sql); assert.equal(r.ok, false, sql); assert.match(r.err, /count_closed/);
  }
  assert.equal(sc("INSERT INTO health_stock_counts(location_id) VALUES (1)").ok, true, "after closing, a new count can start");
});

test("a cancelled count is frozen too, and Beauty has its own tables", { skip: SKIP }, () => {
  const id = must(sc("INSERT INTO beauty_stock_counts(location_id) VALUES (1) RETURNING id")).split("\n")[0];
  assert.equal(sc(`UPDATE beauty_stock_counts SET status = 'cancelled', closed_at = now() WHERE id = ${id}`).ok, true);
  assert.equal(sc(`UPDATE beauty_stock_counts SET note = 'x' WHERE id = ${id}`).ok, false);
  assert.equal(must(psql("SELECT count(*) FROM health_stock_counts WHERE status = 'cancelled'")), "0");
});

// ── review finding R7: closing a count is ONE transaction (real PostgreSQL, real concurrency) ─────────────────────────────
const H = "health";
const receive = (key, product, loc, qty) => must(sc(`SELECT public.health_stock_post('${key}','receive',${product},${loc},NULL,${qty},'t',NULL,NULL,NULL,'tester',NULL)`));
const balance = (loc, product) => must(sc(`SELECT quantity FROM ${H}_stock_balances WHERE location_id = ${loc} AND product_id = ${product}`));
const ledgerOf = (countId) => must(sc(`SELECT coalesce(string_agg(product_id || ':' || delta, ',' ORDER BY product_id), '') FROM ${H}_stock_movements WHERE idempotency_key LIKE 'count-${countId}-%'`));
const newCount = (loc, lines) => {
  const id = must(sc(`INSERT INTO ${H}_stock_counts(location_id, created_label) VALUES (${loc}, 'tester') RETURNING id`)).split("\n")[0];
  for (const [product, expected, counted] of lines) must(sc(`INSERT INTO ${H}_stock_count_lines(count_id, product_id, sku, expected, counted) VALUES (${id}, ${product}, 'H-${product}', ${expected}, ${counted ?? "NULL"})`));
  return id;
};
const close = (id, expected = "NULL") => `SELECT public.health_stock_count_close(${id}, ${expected === "NULL" ? "NULL" : `'${expected}'::jsonb`}, NULL, 'closer', 'req-1')`;
const statusOf = (id) => must(sc(`SELECT status FROM ${H}_stock_counts WHERE id = ${id}`));

test("R7 setup: a warehouse with stock", { skip: SKIP }, () => {
  must(psql("INSERT INTO products VALUES (3,'H-3'),(4,'H-4'),(5,'H-5') ON CONFLICT DO NOTHING; INSERT INTO health_stock_locations(code, name) VALUES ('DOCK','Dock')"));
  for (const [k, p, q] of [["recv-0003", 3, 10], ["recv-0004", 4, 4], ["recv-0005", 5, 6]]) receive(k, p, 3, q);
  assert.equal(balance(3, 3), "10.000");
});

test("R7: closing posts every difference and closes the count in one step; closing again is a replay that posts nothing", { skip: SKIP }, () => {
  const id = newCount(3, [[3, 10, 8], [4, 4, 4], [5, 6, null]]);               // 3: −2, 4: no difference, 5: not counted (left alone)
  const r = must(sc(close(id)));
  assert.match(r, /"ok": true/); assert.match(r, /"differences": 1/); assert.match(r, /"replayed": false/);
  assert.equal(statusOf(id), "closed");
  assert.equal(ledgerOf(id), "3:-2.000");
  assert.deepEqual([balance(3, 3), balance(3, 4), balance(3, 5)], ["8.000", "4.000", "6.000"]);
  assert.equal(must(sc(`SELECT differences FROM ${H}_stock_counts WHERE id = ${id}`)), "1");
  const again = must(sc(close(id)));
  assert.match(again, /"replayed": true/);
  assert.equal(ledgerOf(id), "3:-2.000", "no second movement");
  assert.match(must(sc(close(id, "[[3,-2]]"))), /"replayed": true/, "the same reviewed snapshot is a replay");
  assert.match(sc(close(id, "[[3,-5]]")).err, /stock:count_stale/, "a different snapshot is not mistaken for the closed one");
  assert.equal(balance(3, 3), "8.000");
  // the movement names the count and the person
  assert.equal(must(sc(`SELECT reference || '|' || actor_label || '|' || request_id FROM ${H}_stock_movements WHERE idempotency_key = 'count-${id}-3'`)), `count-${id}|closer|req-1`);
});

test("R7: a failure after the first of several movements rolls EVERYTHING back — no movement, no balance change, the count stays open", { skip: SKIP }, () => {
  must(sc("SELECT public.health_stock_reserve('resv-0004', 4, 3, 3, 'ref', 'hold', NULL, 'tester', NULL)"));      // 3 of the 4 units of product 4 are reserved: only 1 usable
  const id = newCount(3, [[3, 8, 7], [4, 4, 0], [5, 6, 6]]);                    // 3: −1 (fine, posted first), 4: −4 (not enough usable stock)
  const r = sc(close(id));
  assert.equal(r.ok, false);
  assert.match(r.err, /stock:count_line_failed/);
  assert.match(r.err, /product=4;sku=H-4;reason=stock:insufficient_stock/, "the failing line is named");
  assert.equal(statusOf(id), "open", "the count stays open");
  assert.equal(ledgerOf(id), "", "the first movement was rolled back with the rest");
  assert.equal(balance(3, 3), "8.000", "product 3 is untouched");
  assert.equal(must(sc(`SELECT count(*) FROM ${H}_stock_movements WHERE reference = 'count-${id}'`)), "0");
  // after the reservation is released the very same close works
  const resv = must(sc(`SELECT id FROM ${H}_stock_reservations WHERE idempotency_key = 'resv-0004'`));
  must(sc(`SELECT public.health_stock_release('rels-0004', ${resv}, NULL, 'tester', NULL)`));
  assert.match(must(sc(close(id))), /"differences": 2/);
  assert.equal(ledgerOf(id), "3:-1.000,4:-4.000");
  assert.deepEqual([balance(3, 3), balance(3, 4)], ["7.000", "0.000"]);
});

test("R7: the reviewed snapshot is verified inside the transaction — a count that no longer says what was approved posts nothing", { skip: SKIP }, () => {
  receive("recv-0013", 3, 3, 3);                                                // 10 again
  const id = newCount(3, [[3, 10, 8]]);
  const stale = sc(close(id, "[[3,-9]]"));
  assert.equal(stale.ok, false); assert.match(stale.err, /stock:count_stale/);
  assert.equal(ledgerOf(id), ""); assert.equal(statusOf(id), "open");
  assert.match(must(sc(close(id, "[[3,-2.000]]"))), /"differences": 1/, "the exact reviewed differences go through");
  const empty = newCount(3, [[3, 8, null]]);
  assert.match(sc(close(empty)).err, /stock:nothing_counted/);
  must(sc(`UPDATE ${H}_stock_counts SET status = 'cancelled', closed_at = now() WHERE id = ${empty}`));
});

test("R7: a save of a counted quantity that races the close cannot leave a closed count and the ledger disagreeing (real concurrency)", { skip: SKIP }, async () => {
  // (a) the close holds the lock; the save arrives meanwhile and is refused once the count is closed
  let id = newCount(3, [[3, 8, 6]]);                                            // −2
  const closing = `BEGIN; ${close(id)}; SELECT pg_sleep(1); COMMIT;`;
  const saving = `SELECT pg_sleep(0.3); UPDATE ${H}_stock_count_lines SET counted = 1 WHERE count_id = ${id} AND product_id = 3`;
  const [c, s] = await Promise.all([psqlAsync(closing), psqlAsync(saving)]);
  assert.ok(c.ok, c.err);
  assert.equal(s.ok, false); assert.match(s.err, /stock:count_closed/, "the late save is refused");
  assert.equal(must(sc(`SELECT counted FROM ${H}_stock_count_lines WHERE count_id = ${id}`)), "6.000");
  assert.equal(ledgerOf(id), "3:-2.000", "the ledger matches the counted quantity that was closed");
  // (b) the save commits first; the approval was prepared for the OLD quantity and must be refused as stale, posting nothing
  id = newCount(3, [[3, balance(3, 3).replace(/0+$/, "").replace(/\.$/, ""), 5]]);
  const delta = Number(balance(3, 3)) - 5;
  const saveFirst = `BEGIN; UPDATE ${H}_stock_count_lines SET counted = 4 WHERE count_id = ${id} AND product_id = 3; SELECT pg_sleep(1); COMMIT;`;
  const closeLater = `SELECT pg_sleep(0.3); ${close(id, `[[3,-${delta}]]`)}`;
  const [sv, cl] = await Promise.all([psqlAsync(saveFirst), psqlAsync(closeLater)]);
  assert.ok(sv.ok, sv.err);
  assert.equal(cl.ok, false); assert.match(cl.err, /stock:count_stale/);
  assert.equal(ledgerOf(id), "", "nothing was posted for the old snapshot");
  assert.equal(statusOf(id), "open");
  assert.match(must(sc(close(id))), /"differences": 1/, "closing without a snapshot applies the quantity as it is now");
  assert.equal(ledgerOf(id), `3:-${Number(delta) + 1}.000`);
});

test("R7: two simultaneous closes post once — one wins, the other replays", { skip: SKIP }, async () => {
  const id = newCount(3, [[3, balance(3, 3).replace(/0+$/, "").replace(/\.$/, ""), 1], [5, 6, 3]]);
  const [a, b] = await Promise.all([psqlAsync(close(id)), psqlAsync(close(id))]);
  assert.ok(a.ok && b.ok, `${a.err} | ${b.err}`);
  assert.equal([a.out, b.out].filter((o) => o.includes('"replayed": true')).length, 1, `exactly one replay: ${a.out} / ${b.out}`);
  assert.equal(must(sc(`SELECT count(*) FROM ${H}_stock_movements WHERE reference = 'count-${id}'`)), "2", "two differences, two movements, once");
  assert.equal(statusOf(id), "closed");
});

test("R7: the close function is private (service_role only)", { skip: SKIP }, () => {
  for (const role of ["anon", "authenticated"]) assert.equal(psql(`SELECT public.health_stock_count_close(1, NULL, NULL, 'x', 'y')`, { role }).ok, false, role);
  assert.equal(psql(`SELECT public.beauty_stock_count_close(1, NULL, NULL, 'x', 'y')`, { role: "anon" }).ok, false);
});
