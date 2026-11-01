// Migration 47 (category tile focal point) run for real on a throw-away PostgreSQL cluster (skipped where the server binaries are
// not installed). Proves: it needs public.categories and public.beauty_categories; it adds image_focus to both; the format CHECK
// accepts a valid "NN% MM%" and rejects anything else; it is idempotent (ADD COLUMN IF NOT EXISTS, guarded CHECK).
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createCluster, SKIP, SETUP } from "./helpers/pgCluster.mjs";

// The migration only needs the two tables to EXIST (it adds a column + CHECK). Stub them in the setup so the test is self-contained,
// exactly as the migration will behave against the real base schema + migration 10.
const STUBS = `${SETUP}
CREATE TABLE public.categories (id serial PRIMARY KEY, slug text);
CREATE TABLE public.beauty_categories (id serial PRIMARY KEY, slug text);`;

const pg = createCluster("pg47", 7720);
before(() => pg.start({ migrations: { 47: "47_category_image_focus.sql" }, setup: STUBS }));
after(() => pg.stop());
const must = (r) => pg.must(r);
// The stub tables carry no service_role grant (the real base schema does); the CHECK applies to every role, so exercise it as the owner.
const ins = (sql) => pg.psql(sql);

test("needs the base tables and is idempotent", { skip: SKIP }, () => {
  must(pg.psql(pg.M(47), { file: true }));
  must(pg.psql(pg.M(47), { file: true }));   // re-run: ADD COLUMN IF NOT EXISTS + guarded CHECK
  assert.equal(must(pg.psql("SELECT count(*) FROM information_schema.columns WHERE table_schema='public' AND column_name='image_focus' AND table_name IN ('categories','beauty_categories')")), "2");
});

test("missing prerequisite table is refused", { skip: SKIP }, () => {
  const sep = createCluster("pg47b", 7740);
  sep.start({ migrations: { 47: "47_category_image_focus.sql" }, setup: SETUP });   // no categories / beauty_categories tables
  try {
    const r = sep.psql(sep.M(47), { file: true });
    assert.equal(r.ok, false);
    assert.match(r.err, /migration 47 needs/);
  } finally { sep.stop(); }
});

test("the format CHECK accepts a valid focal point and rejects everything else, on both tables", { skip: SKIP }, () => {
  for (const table of ["categories", "beauty_categories"]) {
    must(ins(`INSERT INTO ${table}(slug, image_focus) VALUES ('ok-center', '50% 50%')`));
    must(ins(`INSERT INTO ${table}(slug, image_focus) VALUES ('ok-edge', '0% 100%')`));
    must(ins(`INSERT INTO ${table}(slug, image_focus) VALUES ('ok-max', '100% 100%')`));
    must(ins(`INSERT INTO ${table}(slug, image_focus) VALUES ('ok-null', NULL)`));
    for (const bad of ["50%50%", "50% 50", "150% 0%", "050% 50%", "50%  50%", "abc", "1.5% 2%", "50%,50%"]) {
      assert.equal(ins(`INSERT INTO ${table}(slug, image_focus) VALUES ('bad', '${bad}')`).ok, false, `${table} must reject "${bad}"`);
    }
  }
});
