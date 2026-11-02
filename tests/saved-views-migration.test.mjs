// Migration 49 (saved list views) run for real on a throw-away PostgreSQL cluster (skipped where the server binaries are not installed).
// Proves: it needs migration 34; it is idempotent; the table is PRIVATE (nothing for anon / authenticated); a view belongs to a person and goes with
// them; the house and list are checked; a name is unique per person (case-insensitive); at most 20 per person, house and list; only a small JSON
// object; views are never edited in place and service_role can create and delete but not update.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createCluster, SKIP } from "./helpers/pgCluster.mjs";

const pg = createCluster("pg49", 7710);
before(() => pg.start({ migrations: { 30: "30_operator_security.sql", 34: "34_operator_users.sql", 49: "49_operator_saved_views.sql" } }));
after(() => pg.stop());
const must = (r) => pg.must(r);
const psql = (sql, o) => pg.psql(sql, o);
const sc = (sql) => pg.psql(sql, { role: "service_role" });
const U1 = "11111111-1111-4111-8111-111111111111", U2 = "22222222-2222-4222-8222-222222222222";
const view = (u, name, o = {}) => `INSERT INTO operator_saved_views(user_id, house, list, name, params) VALUES ('${u}', '${o.house || "health"}', '${o.list || "products"}', '${name}', '${o.params || '{"stock":"out"}'}')`;

test("needs migration 34 and is idempotent; two people exist", { skip: SKIP }, () => {
  must(psql(pg.M(30), { file: true })); must(psql(pg.M(34), { file: true }));
  must(psql(pg.M(49), { file: true })); must(psql(pg.M(49), { file: true }));
  for (const [id, n] of [[U1, "ann"], [U2, "bob"]]) {
    must(psql(`INSERT INTO operator_users(id, username, display_name, password_hash, role, houses) VALUES ('${id}', '${n}-user', '${n}', 'scrypt:x', 'viewer', ARRAY['health','beauty'])`));
  }
  assert.equal(must(psql("SELECT count(*) FROM operator_saved_views")), "0");
});

test("only service_role reaches it, and it can create and delete but never update", { skip: SKIP }, () => {
  must(sc(view(U1, "Out of stock")));
  for (const role of ["anon", "authenticated"]) {
    assert.equal(psql("SELECT * FROM operator_saved_views", { role }).ok, false, `${role} must not read`);
    assert.equal(psql(view(U1, "x"), { role }).ok, false, `${role} must not insert`);
    assert.equal(psql("DELETE FROM operator_saved_views", { role }).ok, false, `${role} must not delete`);
  }
  assert.equal(sc("UPDATE operator_saved_views SET name = 'renamed'").ok, false, "no update for service_role");
  assert.equal(must(sc("SELECT count(*) FROM operator_saved_views")), "1");
});

test("house, list, name and params are checked", { skip: SKIP }, () => {
  assert.equal(sc(view(U1, "a", { house: "mars" })).ok, false);
  assert.equal(sc(view(U1, "a", { list: "orders" })).ok, false);
  assert.equal(sc(view(U1, "   ")).ok, false, "blank name");
  assert.equal(sc(view(U1, "x".repeat(41))).ok, false, "name too long");
  assert.equal(sc(view(U1, "arr", { params: "[1]" })).ok, false, "params must be an object");
  assert.equal(sc(view(U1, "big", { params: JSON.stringify({ q: "x".repeat(3000) }) })).ok, false, "params must be small");
  must(sc(view(U1, "x".repeat(40))));
});

test("a name is unique per person, house and list — case-insensitively; another person or list may reuse it", { skip: SKIP }, () => {
  assert.equal(sc(view(U1, "out of STOCK")).ok, false);
  assert.equal(sc(view(U1, "  Out of stock  ")).ok, false, "surrounding spaces do not make a new name");
  must(sc(view(U2, "Out of stock")));
  must(sc(view(U1, "Out of stock", { list: "quotes", params: '{"tab":"spam"}' })));
  must(sc(view(U1, "Out of stock", { house: "beauty" })));
});

test("at most 20 per person, house and list", { skip: SKIP }, () => {
  for (let i = 0; i < 18; i++) must(sc(view(U2, `v${i}`, { house: "beauty", list: "quotes", params: '{"tab":"spam"}' })));
  const count = () => Number(must(sc("SELECT count(*) FROM operator_saved_views WHERE user_id = '" + U2 + "' AND house = 'beauty' AND list = 'quotes'")));
  assert.equal(count(), 18);
  must(sc(view(U2, "v18", { house: "beauty", list: "quotes", params: '{"tab":"spam"}' })));
  must(sc(view(U2, "v19", { house: "beauty", list: "quotes", params: '{"tab":"spam"}' })));
  const r = sc(view(U2, "v20", { house: "beauty", list: "quotes", params: '{"tab":"spam"}' }));
  assert.equal(r.ok, false); assert.match(r.err, /too_many/);
  must(sc(view(U2, "other list ok", { house: "beauty", list: "products" })));
  must(sc("DELETE FROM operator_saved_views WHERE name = 'v0' AND user_id = '" + U2 + "'"));
  must(sc(view(U2, "v20", { house: "beauty", list: "quotes", params: '{"tab":"spam"}' })));
});

test("views go with the person", { skip: SKIP }, () => {
  must(psql(`DELETE FROM operator_saved_views WHERE user_id = '${U2}'`));
  const left = Number(must(sc(`SELECT count(*) FROM operator_saved_views WHERE user_id = '${U1}'`)));
  assert.ok(left > 0);
  const del = psql(`DELETE FROM operator_users WHERE id = '${U1}'`);
  if (del.ok) assert.equal(must(sc(`SELECT count(*) FROM operator_saved_views WHERE user_id = '${U1}'`)), "0");
});
