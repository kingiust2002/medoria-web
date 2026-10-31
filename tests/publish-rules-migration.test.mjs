// Migration 46 (publish quality rules) run for real on a throw-away PostgreSQL cluster (skipped where the server binaries are not installed).
// Proves: it needs migration 34; it is idempotent; the rules are PRIVATE (nothing for anon / authenticated, even with a policy-less RLS table);
// only the known gap codes are accepted; the version bumps on every update; the house never changes; rows are never deleted — not even by
// service_role.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createCluster, SKIP } from "./helpers/pgCluster.mjs";

const pg = createCluster("pg46", 7700);
before(() => pg.start({ migrations: { 30: "30_operator_security.sql", 34: "34_operator_users.sql", 46: "46_publish_rules.sql" } }));
after(() => pg.stop());
const must = (r) => pg.must(r);
const psql = (sql, o) => pg.psql(sql, o);
const sc = (sql) => pg.psql(sql, { role: "service_role" });

test("needs migration 34 and is idempotent", { skip: SKIP }, () => {
  // a database without operator_users refuses (a second, empty cluster is not needed: the check runs before anything is created)
  must(psql(pg.M(30), { file: true })); must(psql(pg.M(34), { file: true }));
  must(psql(pg.M(46), { file: true }));
  must(psql(pg.M(46), { file: true }));
  assert.equal(must(psql("SELECT count(*) FROM publish_rules")), "0");
});

test("only service_role reaches it; anon and authenticated see and change nothing", { skip: SKIP }, () => {
  must(sc("INSERT INTO publish_rules(house, blocking) VALUES ('health', ARRAY['image','sku'])"));
  for (const role of ["anon", "authenticated"]) {
    assert.equal(psql("SELECT * FROM publish_rules", { role }).ok, false, `${role} must not read`);
    assert.equal(psql("INSERT INTO publish_rules(house) VALUES ('beauty')", { role }).ok, false, `${role} must not insert`);
    assert.equal(psql("UPDATE publish_rules SET blocking = '{}'", { role }).ok, false, `${role} must not update`);
  }
  assert.equal(must(sc("SELECT blocking FROM publish_rules WHERE house = 'health'")), "{image,sku}");
});

test("only the known gap codes, at most one row per house, never another house", { skip: SKIP }, () => {
  assert.equal(sc("INSERT INTO publish_rules(house, blocking) VALUES ('beauty', ARRAY['image','bogus'])").ok, false);
  assert.equal(sc("INSERT INTO publish_rules(house, blocking) VALUES ('mars', '{}')").ok, false);
  assert.equal(sc("INSERT INTO publish_rules(house, blocking) VALUES ('health', '{}')").ok, false, "one row per house");
  must(sc("INSERT INTO publish_rules(house, blocking) VALUES ('beauty', ARRAY['name_tg','description_tg','specs'])"));
  must(sc("UPDATE publish_rules SET blocking = ARRAY['image','sku','category','name_fa','name_en','name_ru','name_tg','description_fa','description_en','description_ru','description_tg','specs'] WHERE house = 'beauty'"));
  assert.equal(sc("UPDATE publish_rules SET blocking = ARRAY['price'] WHERE house = 'beauty'").ok, false, "a code that is not a gap");
});

test("every update bumps the version, the house is fixed, rows are never deleted", { skip: SKIP }, () => {
  const v0 = Number(must(sc("SELECT version FROM publish_rules WHERE house = 'health'")));
  must(sc("UPDATE publish_rules SET blocking = ARRAY['image'] WHERE house = 'health'"));
  must(sc("UPDATE publish_rules SET blocking = ARRAY['image','sku'] WHERE house = 'health'"));
  assert.equal(Number(must(sc("SELECT version FROM publish_rules WHERE house = 'health'"))), v0 + 2);
  const r = sc("UPDATE publish_rules SET house = 'beauty' WHERE house = 'health'");
  assert.equal(r.ok, false);
  const d = sc("DELETE FROM publish_rules WHERE house = 'health'");
  assert.equal(d.ok, false);
  assert.equal(must(psql("SELECT count(*) FROM publish_rules")), "2");
  assert.equal(psql("DELETE FROM publish_rules WHERE house = 'health'").ok, false, "not even the database owner, because of the trigger");
});

test("the completeness module and the table agree on the codes", { skip: SKIP }, async () => {
  const { ALL_GAP_CODES } = await import("../lib/operator/publishRules.js");
  const table = must(psql("SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.publish_rules'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%image%'"));
  for (const code of ALL_GAP_CODES) assert.ok(table.includes(`'${code}'`), `${code} is in the table's check`);
  assert.equal([...table.matchAll(/'([a-z_]+)'::text/g)].length >= ALL_GAP_CODES.length, true);
});
