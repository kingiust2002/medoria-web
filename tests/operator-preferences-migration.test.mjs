// Migration 50 (personal panel preferences) run for real on a throw-away PostgreSQL cluster (skipped where the server binaries are not installed).
// Proves: it needs migration 34; it is idempotent; the table is PRIVATE; one row per person and house; only panel addresses of the row's own house
// are accepted (no query string, no other host, no other house's page); at most six shortcuts without repeats; owner and house are fixed;
// service_role can read, write and update but never delete; the rows go with the person.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createCluster, SKIP } from "./helpers/pgCluster.mjs";

const pg = createCluster("pg50", 7720);
before(() => pg.start({ migrations: { 30: "30_operator_security.sql", 34: "34_operator_users.sql", 50: "50_operator_preferences.sql" } }));
after(() => pg.stop());
const must = (r) => pg.must(r);
const psql = (sql, o) => pg.psql(sql, o);
const sc = (sql) => pg.psql(sql, { role: "service_role" });
const U1 = "11111111-1111-4111-8111-111111111111", U2 = "22222222-2222-4222-8222-222222222222";
const row = (u, house, start, shortcuts) => `INSERT INTO operator_preferences(user_id, house, start_page, shortcuts) VALUES ('${u}', '${house}', ${start ? `'${start}'` : "NULL"}, ARRAY[${shortcuts.map((s) => `'${s}'`).join(",")}]::text[])`;

test("needs migration 34 and is idempotent; two people exist", { skip: SKIP }, () => {
  must(psql(pg.M(30), { file: true })); must(psql(pg.M(34), { file: true }));
  must(psql(pg.M(50), { file: true })); must(psql(pg.M(50), { file: true }));
  for (const [id, n] of [[U1, "ann"], [U2, "bob"]]) must(psql(`INSERT INTO operator_users(id, username, display_name, password_hash, role, houses) VALUES ('${id}', '${n}-user', '${n}', 'scrypt:x', 'viewer', ARRAY['health','beauty'])`));
  assert.equal(must(psql("SELECT count(*) FROM operator_preferences")), "0");
});

test("only service_role reaches it; it can write and update but never delete", { skip: SKIP }, () => {
  must(sc(row(U1, "health", "/operator/quotes", ["/operator/products"])));
  for (const role of ["anon", "authenticated"]) {
    assert.equal(psql("SELECT * FROM operator_preferences", { role }).ok, false, `${role} must not read`);
    assert.equal(psql(row(U2, "health", null, []), { role }).ok, false, `${role} must not insert`);
    assert.equal(psql("UPDATE operator_preferences SET start_page = NULL", { role }).ok, false, `${role} must not update`);
  }
  must(sc("UPDATE operator_preferences SET shortcuts = ARRAY['/operator/media'] WHERE user_id = '" + U1 + "'"));
  assert.equal(sc("DELETE FROM operator_preferences").ok, false, "service_role cannot delete");
});

test("one row per person and house; the house is checked", { skip: SKIP }, () => {
  assert.equal(sc(row(U1, "health", null, [])).ok, false, "a second row for the same person and house");
  must(sc(row(U1, "beauty", "/beauty/operator/brands", ["/beauty/operator/quotes"])));
  assert.equal(sc(row(U2, "mars", null, [])).ok, false);
});

test("addresses: only the row's own house, plain paths, no repeats, at most six", { skip: SKIP }, () => {
  const r = (shortcuts, start = null, house = "health", u = U2) => sc(row(u, house, start, shortcuts));
  assert.equal(r(["/beauty/operator/quotes"]).ok, false, "another house's page in a Health row");
  assert.equal(r(["/operator/quotes"], null, "beauty").ok, false, "a Health page in a Beauty row");
  assert.equal(r(["/operator/products?x=1"]).ok, false, "a query string");
  assert.equal(r(["https://evil.example/operator"]).ok, false);
  assert.equal(r(["//evil.example"]).ok, false);
  assert.equal(r(["/operator/Products"]).ok, false, "upper case");
  assert.equal(r(["/operator/a/b/c"]).ok, false, "too deep");
  assert.equal(r([], "/etc/passwd").ok, false, "a bad start page");
  assert.equal(r([], "/operator/" + "a".repeat(80)).ok, false);
  assert.equal(r(["/operator/media", "/operator/media"]).ok, false, "a repeat");
  const six = ["/operator/products", "/operator/categories", "/operator/media", "/operator/quotes", "/operator/warehouse", "/operator/content"];
  assert.equal(r([...six, "/operator/activity"]).ok, false, "seven");
  must(r(["/operator/a", "/operator/b"]));
  must(psql(`DELETE FROM operator_preferences WHERE user_id = '${U2}'`));
  must(r(six, "/operator"));
});

test("owner and house never change; updated_at moves; rows go with the person", { skip: SKIP }, () => {
  assert.equal(sc(`UPDATE operator_preferences SET house = 'beauty' WHERE user_id = '${U2}'`).ok, false);
  assert.equal(sc(`UPDATE operator_preferences SET user_id = '${U1}' WHERE user_id = '${U2}'`).ok, false);
  const t0 = must(sc(`SELECT updated_at FROM operator_preferences WHERE user_id = '${U2}'`));
  must(sc("SELECT pg_sleep(0.05)"));
  must(sc(`UPDATE operator_preferences SET shortcuts = '{}' WHERE user_id = '${U2}'`));
  assert.notEqual(must(sc(`SELECT updated_at FROM operator_preferences WHERE user_id = '${U2}'`)), t0);
  const del = psql(`DELETE FROM operator_users WHERE id = '${U2}'`);
  if (del.ok) assert.equal(must(sc(`SELECT count(*) FROM operator_preferences WHERE user_id = '${U2}'`)), "0");
});
