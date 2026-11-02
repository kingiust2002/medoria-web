// Migration 56 (rows per page and dashboard blocks on the personal preferences) run for real on a throw-away PostgreSQL cluster: needs migration 50; additive
// and idempotent (rows of migration 50 survive untouched); the table stays private; the database enforces the three page sizes and the four block names
// (1–4, no repeats); the older columns keep their own rules.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createCluster, SKIP } from "./helpers/pgCluster.mjs";

const pg = createCluster("pg56", 8700);
before(() => pg.start({ migrations: { 30: "30_operator_security.sql", 34: "34_operator_users.sql", 50: "50_operator_preferences.sql", 56: "56_preferences_extras.sql" } }));
after(() => pg.stop());
const must = (r) => pg.must(r);
const sql = (q, role = "service_role") => pg.psql(q, { role });
const fails = (q, re, role = "service_role") => { const r = sql(q, role); assert.equal(r.ok, false, `expected a failure: ${q}`); assert.match(r.err, re, q); };
const UID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const up = (cols, vals, house = "health", user = 1) => `INSERT INTO operator_preferences (user_id, house, ${cols}) VALUES ('${UID(user)}', '${house}', ${vals}) ON CONFLICT (user_id, house) DO UPDATE SET ${cols.split(",").map((c) => `${c.trim()} = EXCLUDED.${c.trim()}`).join(", ")}`;

test("needs migration 50; adds the columns without touching existing rows; re-applies", { skip: SKIP }, () => {
  let r = pg.psql(pg.M(56), { file: true });
  assert.equal(r.ok, false); assert.match(r.err, /needs migration 34|needs migration 50|operator_preferences/);
  must(pg.psql(pg.M(30), { file: true })); must(pg.psql(pg.M(34), { file: true }));
  r = pg.psql(pg.M(56), { file: true });
  assert.equal(r.ok, false); assert.match(r.err, /needs migration 50/);
  must(pg.psql(pg.M(50), { file: true }));
  must(pg.psql(`INSERT INTO operator_users (id, username, display_name, password_hash, status, role, houses) VALUES ('${UID(1)}','ann','Ann','scrypt:x','active','house_admin','{health,beauty}')`));
  must(sql(up("start_page, shortcuts", "'/operator/products', ARRAY['/operator/quotes']")));
  must(pg.psql(pg.M(56), { file: true })); must(pg.psql(pg.M(56), { file: true }));
  assert.equal(must(sql("SELECT start_page || '|' || shortcuts[1] || '|' || coalesce(page_size_products::text, 'null') || '|' || coalesce(dashboard::text, 'null') FROM operator_preferences")), "/operator/products|/operator/quotes|null|null");
});

test("still private", { skip: SKIP }, () => {
  for (const role of ["anon", "authenticated"]) fails("SELECT page_size_products, dashboard FROM operator_preferences", /permission denied/, role);
});

test("page sizes: 25, 50 or 100 only", { skip: SKIP }, () => {
  must(sql(up("page_size_products, page_size_quotes", "50, 100")));
  must(sql(up("page_size_products, page_size_quotes", "25, NULL")));
  for (const bad of ["7", "0", "-25", "500"]) fails(up("page_size_products", bad), /page_sizes_check|violates check/);
  fails(up("page_size_quotes", "26"), /page_sizes_check|violates check/);
});

test("dashboard: only the four known blocks, 1–4 of them, no repeats; NULL means the default", { skip: SKIP }, () => {
  must(sql(up("dashboard", "ARRAY['quotes','stats']")));
  assert.equal(must(sql("SELECT dashboard FROM operator_preferences WHERE house = 'health'")), "{quotes,stats}");
  must(sql(up("dashboard", "ARRAY['stats','actions','quotes','products']")));
  must(sql(up("dashboard", "NULL")));
  fails(up("dashboard", "ARRAY[]::text[]"), /dashboard_check|violates check/);
  fails(up("dashboard", "ARRAY['stats','evil']"), /dashboard_check|violates check/);
  fails(up("dashboard", "ARRAY['stats','stats']"), /repeated_block/);
  fails(up("dashboard", "ARRAY['stats','actions','quotes','products','stats']"), /dashboard_check|violates check|repeated_block/);
});

test("the older rules still hold: the start page and shortcuts are checked as before", { skip: SKIP }, () => {
  fails(up("start_page", "'/operator/../x'"), /bad_address/);
  fails(up("start_page", "'/beauty/operator/products'"), /bad_address/);
  must(sql(up("start_page", "'/operator/products'")));
});
