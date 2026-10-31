// Migration 47 (focus point of a category image) run for real on a throw-away PostgreSQL cluster (skipped where the server binaries are not
// installed): needs both category tables; additive and idempotent; existing rows are untouched (NULL = no choice); a focus is either both
// coordinates or none, whole numbers 0–100; the public roles keep reading the other columns exactly as before.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createCluster, SKIP } from "./helpers/pgCluster.mjs";

const pg = createCluster("pg47", 7800);
before(() => pg.start({ migrations: { 47: "47_category_image_focus.sql" } }));
after(() => pg.stop());
const must = (r) => pg.must(r);
const psql = (sql, o) => pg.psql(sql, o);

test("needs both category tables", { skip: SKIP }, () => {
  const r = psql(pg.M(47), { file: true });
  assert.equal(r.ok, false); assert.match(r.err, /needs the category tables/);
  must(psql(`CREATE TABLE public.categories (id BIGSERIAL PRIMARY KEY, slug TEXT, image_url TEXT, is_active BOOLEAN DEFAULT TRUE);
    CREATE TABLE public.beauty_categories (id BIGSERIAL PRIMARY KEY, slug TEXT, image_url TEXT, is_active BOOLEAN DEFAULT TRUE);
    ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY; ALTER TABLE public.beauty_categories ENABLE ROW LEVEL SECURITY;
    CREATE POLICY pub ON public.categories FOR SELECT TO anon USING (is_active); CREATE POLICY pub ON public.beauty_categories FOR SELECT TO anon USING (is_active);
    GRANT SELECT ON public.categories, public.beauty_categories TO anon;
    INSERT INTO public.categories (slug, image_url) VALUES ('gloves', 'products/a.png'); INSERT INTO public.beauty_categories (slug, image_url) VALUES ('serum', 'categories/b.png');`));
});

test("additive and idempotent; existing rows get no focus (NULL) and keep everything else", { skip: SKIP }, () => {
  must(psql(pg.M(47), { file: true }));
  must(psql(pg.M(47), { file: true }));
  for (const t of ["categories", "beauty_categories"]) {
    assert.equal(must(psql(`SELECT image_focus_x IS NULL AND image_focus_y IS NULL FROM ${t} LIMIT 1`)), "t");
    assert.equal(must(psql(`SELECT count(*) FROM information_schema.columns WHERE table_name = '${t}' AND column_name LIKE 'image_focus_%'`)), "2");
  }
  assert.equal(must(psql("SELECT image_url FROM categories")), "products/a.png");
});

test("a focus is both coordinates or none, whole numbers 0–100 — for both houses", { skip: SKIP }, () => {
  for (const t of ["categories", "beauty_categories"]) {
    must(psql(`UPDATE ${t} SET image_focus_x = 30, image_focus_y = 70`));
    must(psql(`UPDATE ${t} SET image_focus_x = 0, image_focus_y = 100`));
    must(psql(`UPDATE ${t} SET image_focus_x = NULL, image_focus_y = NULL`));
    for (const bad of ["image_focus_x = 30", "image_focus_y = 30", "image_focus_x = -1, image_focus_y = 5", "image_focus_x = 5, image_focus_y = 101", "image_focus_x = 101, image_focus_y = 0"]) {
      assert.equal(psql(`UPDATE ${t} SET ${bad}`).ok, false, `${t}: ${bad}`);
    }
  }
});

test("the public role still reads the table like before, including the new columns, for active rows only", { skip: SKIP }, () => {
  must(psql("UPDATE categories SET image_focus_x = 20, image_focus_y = 40"));
  assert.equal(must(psql("SELECT image_focus_x || ',' || image_focus_y FROM categories", { role: "anon" })), "20,40");
  must(psql("UPDATE categories SET is_active = FALSE"));
  assert.equal(must(psql("SELECT count(*) FROM categories", { role: "anon" })), "0");
});
