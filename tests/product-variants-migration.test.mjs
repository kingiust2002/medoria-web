// Migration 44 (product variants) run for real on a throw-away PostgreSQL cluster, for both houses: the rules that keep a variant a
// well-formed child of an ordinary product, the SKU that stays unique across parents and variants, the public site that never sees a
// variant as a product of its own and reads the variants of an active product only through the function, privacy of the guards, re-run.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createCluster, SKIP } from "./helpers/pgCluster.mjs";

const pg = createCluster("pg44", 7300);
before(() => pg.start({ migrations: { 44: "44_product_variants.sql" } }));
after(() => pg.stop());

const HOUSES = [{ t: "products", fn: "public_product_variants", cur: true }, { t: "beauty_products", fn: "public_beauty_product_variants", cur: false }];
const must = (r) => pg.must(r);
const sql = (q, role) => pg.psql(q, { role });
const val = (q, role = "service_role") => must(sql(q, role));
const fails = (q, re, role = "service_role") => { const r = sql(q, role); assert.equal(r.ok, false, `expected a failure: ${q}`); assert.match(r.err, re, q); };

test("needs the product tables and changes nothing without them", { skip: SKIP }, () => {
  const r = pg.psql(pg.M(44), { file: true });
  assert.equal(r.ok, false); assert.match(r.err, /migration 44 needs the table/);
  for (const h of HOUSES) {
    must(sql(`CREATE TABLE public.${h.t} (id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY, slug TEXT, sku TEXT, name_en TEXT, name_ru TEXT, name_tg TEXT, name_fa TEXT,
      min_order_qty INT DEFAULT 1, brand TEXT, category TEXT, is_active BOOLEAN NOT NULL DEFAULT TRUE,
      price NUMERIC, ${h.cur ? "currency TEXT," : ""} unit TEXT, in_stock BOOLEAN NOT NULL DEFAULT TRUE, image_url TEXT);
      CREATE UNIQUE INDEX ${h.t}_sku_uq ON public.${h.t} (lower(sku)) WHERE sku IS NOT NULL AND sku <> '';
      ALTER TABLE public.${h.t} ENABLE ROW LEVEL SECURITY;
      CREATE POLICY "${h.t}_public_read" ON public.${h.t} FOR SELECT USING (is_active = true);
      CREATE POLICY "leftover" ON public.${h.t} FOR SELECT USING (true);
      GRANT SELECT ON public.${h.t} TO anon, authenticated; GRANT ALL ON public.${h.t} TO service_role;`));
    must(sql(`INSERT INTO ${h.t}(slug, sku, name_en, price) VALUES ('p-one', 'P-1', 'One', 10), ('p-two', 'P-2', 'Two', NULL)`));
  }
  must(sql("GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role"));
});

test("applies, is idempotent, keeps rows, leaves exactly one public policy per table and hides nothing that was public", { skip: SKIP }, () => {
  must(pg.psql(pg.M(44), { file: true })); must(pg.psql(pg.M(44), { file: true }));
  for (const h of HOUSES) {
    assert.equal(val(`SELECT count(*) FROM ${h.t}`), "2");
    assert.equal(val(`SELECT count(*) FROM pg_policies WHERE tablename = '${h.t}'`), "1", "the stray policy is gone, one remains");
    assert.equal(val(`SELECT count(*) FROM ${h.t}`, "anon"), "2", "ordinary active products are still public");
    assert.equal(val(`SELECT variant_of IS NULL AND variant_options = '{}'::jsonb AND variant_sort = 0 FROM ${h.t} WHERE sku = 'P-1'`), "t");
  }
});

test("a variant is a well-formed child: shape, one level, parent fixed, never an existing product, restricted delete", { skip: SKIP }, () => {
  for (const h of HOUSES) {
    const parent = val(`SELECT id FROM ${h.t} WHERE sku = 'P-1'`);
    const ins = (sku, opts, extra = "") => `INSERT INTO ${h.t}(slug, sku, name_en, variant_of, variant_options${extra ? ", " + extra.split("=")[0] : ""}) VALUES ('v-${sku}', ${sku ? `'${sku}'` : "NULL"}, 'V', ${parent}, '${opts}'${extra ? ", " + extra.split("=")[1] : ""})`;
    must(sql(ins("P-1-M", '{"size":"M"}')));
    fails(ins("", '{"size":"S"}'), /variant_shape/);                                                    // a variant needs a SKU
    fails(ins("P-1-X", "{}"), /variant_shape/);                                                          // …and at least one option
    fails(ins("P-1-Y", '"text"'), /variant_shape/);
    fails(ins("p-1-m", '{"size":"L"}'), /duplicate key|_sku_uq/);                                       // SKU is unique across parents AND variants, case-insensitively
    fails(`INSERT INTO ${h.t}(slug, sku, name_en, variant_options) VALUES ('o', 'O-1', 'O', '{"a":"b"}')`, /variant_shape/);   // an ordinary product has no options
    const child = val(`SELECT id FROM ${h.t} WHERE sku = 'P-1-M'`);
    fails(`INSERT INTO ${h.t}(slug, sku, name_en, variant_of, variant_options) VALUES ('g', 'G-1', 'G', ${child}, '{"a":"b"}')`, /variant:parent_is_variant/);   // one level only
    fails(`INSERT INTO ${h.t}(slug, sku, name_en, variant_of, variant_options) VALUES ('m', 'M-1', 'M', 999999, '{"a":"b"}')`, /foreign key|parent_missing/);
    fails(`UPDATE ${h.t} SET variant_of = ${parent}, variant_options = '{"a":"b"}' WHERE sku = 'P-2'`, /cannot_become_variant/);        // an existing product is never turned into a variant
    fails(`UPDATE ${h.t} SET variant_of = (SELECT id FROM ${h.t} WHERE sku = 'P-2') WHERE id = ${child}`, /parent_is_fixed/);
    fails(`UPDATE ${h.t} SET variant_of = NULL, variant_options = '{}' WHERE id = ${child}`, /parent_is_fixed/);
    fails(`DELETE FROM ${h.t} WHERE id = ${parent}`, /foreign key|violates/);                          // the parent stays while it has variants
    must(sql(`UPDATE ${h.t} SET price = 12, in_stock = false, variant_sort = 3 WHERE id = ${child}`));         // ordinary edits of a variant are fine
    must(sql(`DELETE FROM ${h.t} WHERE id = ${child}`));
    must(sql(`DELETE FROM ${h.t} WHERE id = ${parent} AND false`));
  }
});

test("the public site never sees a variant as a product; the product page reads the variants of an ACTIVE product through the function", { skip: SKIP }, () => {
  for (const h of HOUSES) {
    const parent = val(`SELECT id FROM ${h.t} WHERE sku = 'P-1'`);
    must(sql(`INSERT INTO ${h.t}(slug, sku, name_en, price, unit, in_stock, variant_of, variant_options, variant_sort) VALUES
      ('v-b', 'P-1-B', 'V', 5, 'box', TRUE, ${parent}, '{"size":"B"}', 2), ('v-a', 'P-1-A', 'V', NULL, 'box', FALSE, ${parent}, '{"size":"A"}', 1)`));
    must(sql(`INSERT INTO ${h.t}(slug, sku, name_en, is_active, variant_of, variant_options) VALUES ('v-off', 'P-1-OFF', 'V', FALSE, ${parent}, '{"size":"Z"}')`));
    // the table: variants are invisible to the public roles, whatever the filter
    for (const role of ["anon", "authenticated"]) {
      assert.equal(val(`SELECT count(*) FROM ${h.t}`, role), "2", role);
      assert.equal(val(`SELECT count(*) FROM ${h.t} WHERE variant_of IS NOT NULL`, role), "0", role);
      assert.equal(val(`SELECT count(*) FROM ${h.t} WHERE sku LIKE 'P-1-%'`, role), "0", role);
    }
    // the function: active variants of an active parent, in order, public columns only
    const rows = val(`SELECT sku || ':' || options::text || ':' || coalesce(price::text, 'null') || ':' || in_stock FROM public.${h.fn}(${parent})`, "anon").split("\n");
    assert.deepEqual(rows, ['P-1-A:{"size": "A"}:null:false', 'P-1-B:{"size": "B"}:5:true']);
    assert.equal(val(`SELECT count(*) FROM public.${h.fn}(${parent})`, "authenticated"), "2");
    // an archived parent shows none; an unknown or a variant id shows none
    must(sql(`UPDATE ${h.t} SET is_active = FALSE WHERE id = ${parent}`));
    assert.equal(val(`SELECT count(*) FROM public.${h.fn}(${parent})`, "anon"), "0");
    must(sql(`UPDATE ${h.t} SET is_active = TRUE WHERE id = ${parent}`));
    assert.equal(val(`SELECT count(*) FROM public.${h.fn}(999999)`, "anon"), "0");
    assert.equal(val(`SELECT count(*) FROM public.${h.fn}((SELECT id FROM ${h.t} WHERE sku = 'P-1-A'))`, "anon"), "0", "a variant has no variants");
  }
});

test("the guards cannot be run by a public role and a public role cannot write", { skip: SKIP }, () => {
  for (const h of HOUSES) {
    for (const role of ["anon", "authenticated"]) {
      fails(`SELECT public.${h.t}_variant_guard()`, /permission denied/, role);
      fails(`UPDATE ${h.t} SET price = 1`, /permission denied/, role);
    }
  }
});

test("the inquiry list reaches variants through public_variant_items: active variants of an active product only, at most 30 ids, parent address included", { skip: SKIP }, () => {
  const parent = val("SELECT id FROM products WHERE sku = 'P-1'");
  must(sql(`INSERT INTO products(slug, sku, name_en, price, unit, variant_of, variant_options, image_url) VALUES ('iv-1', 'P-1-I1', 'One — I1', 7, 'box', ${parent}, '{"size":"I1"}', NULL)`));
  must(sql(`UPDATE products SET image_url = 'parent.png' WHERE id = ${parent}`));
  const ids = val("SELECT string_agg(id::text, ',') FROM products WHERE sku IN ('P-1-I1', 'P-1-A', 'P-1-B', 'P-1-OFF', 'P-2')");
  const rows = val(`SELECT sku || '|' || parent_slug || '|' || image_url FROM public.public_variant_items(ARRAY[${ids}]::bigint[]) ORDER BY sku`, "anon").split("\n");
  assert.deepEqual(rows, ["P-1-A|p-one|parent.png", "P-1-B|p-one|parent.png", "P-1-I1|p-one|parent.png"], "inactive variants and ordinary products are not returned; the parent's picture fills in");
  must(sql(`UPDATE products SET is_active = FALSE WHERE id = ${parent}`));
  assert.equal(val(`SELECT count(*) FROM public.public_variant_items(ARRAY[${ids}]::bigint[])`, "anon"), "0");
  must(sql(`UPDATE products SET is_active = TRUE WHERE id = ${parent}`));
  const many = Array.from({ length: 40 }, (_, i) => i + 1).join(",");
  assert.ok(Number(val(`SELECT count(*) FROM public.public_variant_items(ARRAY[${many}]::bigint[])`, "anon")) <= 30);
});
