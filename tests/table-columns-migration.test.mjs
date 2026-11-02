// Migration 55 (the columns a person chose for a list) run for real on a throw-away PostgreSQL cluster: needs migration 34; idempotent; private (nothing for
// anon / authenticated, row security on); one row per person, house and list; the key shape and count are enforced by the database itself; owner, house
// and list never change; removed with the person.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createCluster, SKIP } from "./helpers/pgCluster.mjs";

const pg = createCluster("pg55", 8500);
before(() => pg.start({ migrations: { 30: "30_operator_security.sql", 34: "34_operator_users.sql", 55: "55_operator_table_columns.sql" } }));
after(() => pg.stop());
const must = (r) => pg.must(r);
const sql = (q, role = "service_role") => pg.psql(q, { role });
const fails = (q, re, role = "service_role") => { const r = sql(q, role); assert.equal(r.ok, false, `expected a failure: ${q}`); assert.match(r.err, re, q); };
const UID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

test("needs migration 34; applies; re-applies", { skip: SKIP }, () => {
  let r = pg.psql(pg.M(55), { file: true });
  assert.equal(r.ok, false); assert.match(r.err, /needs migration 34/);
  must(pg.psql(pg.M(30), { file: true })); must(pg.psql(pg.M(34), { file: true }));
  must(pg.psql(pg.M(55), { file: true })); must(pg.psql(pg.M(55), { file: true }));
  must(pg.psql(`INSERT INTO operator_users (id, username, display_name, password_hash, status, role, houses) VALUES ('${UID(1)}','ann','Ann','scrypt:x','active','house_admin','{health,beauty}'), ('${UID(2)}','bob','Bob','scrypt:x','active','house_admin','{health}')`));
});

test("private: anon and signed-in API roles cannot touch it; the service role can read and write", { skip: SKIP }, () => {
  for (const role of ["anon", "authenticated"]) { fails("SELECT * FROM operator_table_columns", /permission denied/, role); fails(`INSERT INTO operator_table_columns VALUES ('${UID(1)}','health','products','{sku}')`, /permission denied/, role); }
  must(sql(`INSERT INTO operator_table_columns (user_id, house, list, columns) VALUES ('${UID(1)}','health','products','{sku,price}')`));
  assert.equal(must(sql("SELECT count(*) FROM operator_table_columns")), "1");
  assert.equal(must(pg.psql("SELECT relrowsecurity FROM pg_class WHERE oid = 'public.operator_table_columns'::regclass")), "t");
});

test("one row per person, house and list; the same person may have one per house and list", { skip: SKIP }, () => {
  fails(`INSERT INTO operator_table_columns (user_id, house, list, columns) VALUES ('${UID(1)}','health','products','{status}')`, /duplicate key/);
  must(sql(`INSERT INTO operator_table_columns (user_id, house, list, columns) VALUES ('${UID(1)}','beauty','products','{status}'), ('${UID(1)}','health','quotes','{status}'), ('${UID(2)}','health','products','{sku}')`));
  must(sql(`INSERT INTO operator_table_columns (user_id, house, list, columns) VALUES ('${UID(1)}','health','products','{updated}') ON CONFLICT (user_id, house, list) DO UPDATE SET columns = EXCLUDED.columns`));
  assert.equal(must(sql(`SELECT columns FROM operator_table_columns WHERE user_id = '${UID(1)}' AND house = 'health' AND list = 'products'`)), "{updated}");
});

test("the database itself enforces the shape: key characters, no repeats, 1–12 keys, known house and list", { skip: SKIP }, () => {
  const ins = (cols, house = "health", list = "quotes") => `INSERT INTO operator_table_columns (user_id, house, list, columns) VALUES ('${UID(2)}','${house}','${list}','${cols}')`;
  fails(ins("{Sku}"), /bad_key/); fails(ins("{a-b}"), /bad_key/); fails(ins('{"a b"}'), /bad_key/); fails(ins("{sku;drop}"), /bad_key/); fails(ins("{}"), /violates check|columns_check/);
  fails(ins("{sku,sku}"), /repeated/);
  fails(ins("{a,b,c,d,e,f,g,h,i,j,k,l,m}"), /violates check|columns_check/);
  must(sql(ins("{a,b,c,d,e,f,g,h,i,j,k,l}")));
  fails(ins("{sku}", "elsewhere"), /house_check|violates check/); fails(ins("{sku}", "health", "orders"), /list_check|violates check/);
});

test("owner, house and list never change; the row goes with the person", { skip: SKIP }, () => {
  fails(`UPDATE operator_table_columns SET user_id = '${UID(2)}' WHERE user_id = '${UID(1)}' AND house = 'beauty'`, /owner_is_fixed|duplicate/);
  fails(`UPDATE operator_table_columns SET list = 'quotes' WHERE user_id = '${UID(1)}' AND house = 'beauty'`, /owner_is_fixed/);
  must(sql(`UPDATE operator_table_columns SET columns = '{price}' WHERE user_id = '${UID(1)}' AND house = 'beauty'`));
  const gone = pg.psql(`DELETE FROM operator_users WHERE id = '${UID(2)}'`);
  if (gone.ok) assert.equal(must(sql(`SELECT count(*) FROM operator_table_columns WHERE user_id = '${UID(2)}'`)), "0", "removed with the person");
  else assert.match(gone.err, /never_deleted|cannot be deleted|account/i, "accounts are never deleted (migration 34): the rule holds");
});
