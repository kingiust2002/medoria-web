// Migration 43 (server-side paging helpers) run for real on a throw-away PostgreSQL cluster. Proves: it needs the tables, the SQL
// gap_count() agrees with lib/operator/completeness.js row by row (so the server-side "incomplete" filter is the same rule the badge uses),
// only service_role may run it, phone_key agrees with phoneKey() of quoteOps, the request tables stay private, and it is idempotent.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createCluster, SKIP } from "./helpers/pgCluster.mjs";
import { productGaps } from "../lib/operator/completeness.js";
import { phoneKey } from "../lib/operator/quoteOps.js";

const pg = createCluster("pg43", 7100);
before(() => pg.start({ migrations: { 43: "43_panel_list_paging.sql" } }));
after(() => pg.stop());

const PRODUCT_COLS = `id BIGSERIAL PRIMARY KEY, image_url TEXT, sku TEXT, category TEXT, category_id BIGINT, specs JSONB, name_fa TEXT, name_en TEXT, name_ru TEXT, name_tg TEXT,
  description_fa TEXT, description_en TEXT, description_ru TEXT, description_tg TEXT, updated_at TIMESTAMPTZ DEFAULT NOW(), is_active BOOLEAN DEFAULT TRUE`;
const q = (v) => (v === null || v === undefined ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);

test("needs the tables and changes nothing without them", { skip: SKIP }, () => {
  const r = pg.psql(pg.M(43), { file: true });
  assert.equal(r.ok, false); assert.match(r.err, /needs the table/);
  pg.must(pg.psql(`CREATE TABLE public.products (${PRODUCT_COLS}); CREATE TABLE public.beauty_products (${PRODUCT_COLS});
    CREATE TABLE public.quote_requests (id BIGSERIAL PRIMARY KEY, phone TEXT, status TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
    CREATE TABLE public.beauty_quote_requests (id BIGSERIAL PRIMARY KEY, phone TEXT, status TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
    ALTER TABLE public.quote_requests ENABLE ROW LEVEL SECURITY; ALTER TABLE public.beauty_quote_requests ENABLE ROW LEVEL SECURITY;
    GRANT SELECT ON products, beauty_products TO anon, authenticated; GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;`));
});

test("applies, is idempotent, keeps rows and leaves the request tables private", { skip: SKIP }, () => {
  pg.must(pg.psql("INSERT INTO quote_requests(phone, status) VALUES ('+992 900 12 34 56', 'new')"));
  pg.must(pg.psql(pg.M(43), { file: true })); pg.must(pg.psql(pg.M(43), { file: true }));
  assert.equal(pg.must(pg.psql("SELECT count(*) FROM quote_requests")), "1");
  assert.equal(pg.must(pg.psql("SELECT has_table_privilege('anon','quote_requests','SELECT') OR has_table_privilege('authenticated','beauty_quote_requests','SELECT')")), "f");
});

test("gap_count() equals the number of gaps of lib/operator/completeness.js for every kind of row, in both tables", { skip: SKIP }, () => {
  const blankish = [null, "", "   ", "\t\n", "x", " x "];
  const specsVals = [null, "{}", '{"a":1}', "[]", '[1]', '"s"', "3"];
  const rows = [];
  let n = 0;
  for (const img of blankish) for (const sku of blankish) for (const nameFa of [null, "  ", "نام"]) for (const desc of [null, "", "d"]) for (const specs of specsVals) {
    const cat = n % 3 === 0 ? null : "slug"; const catId = n % 5 === 0 ? 7 : null; n++;
    rows.push({ image_url: img, sku, name_fa: nameFa, name_en: n % 2 ? null : "n", name_ru: "r", name_tg: "   ", description_fa: desc, description_en: "d", description_ru: null, description_tg: desc, specs, category: cat, category_id: catId });
  }
  assert.ok(rows.length > 500);
  for (const t of ["products", "beauty_products"]) {
    const values = rows.map((r) => `(${[r.image_url, r.sku, r.category, r.category_id, r.specs, r.name_fa, r.name_en, r.name_ru, r.name_tg, r.description_fa, r.description_en, r.description_ru, r.description_tg].map((v, i) => (i === 3 ? (v ?? "NULL") : i === 4 && v !== null ? `${q(v)}::jsonb` : q(v))).join(",")})`).join(",\n");
    pg.must(pg.script(`ins-${t}.sql`, `INSERT INTO ${t}(image_url, sku, category, category_id, specs, name_fa, name_en, name_ru, name_tg, description_fa, description_en, description_ru, description_tg) VALUES ${values};`));
    const out = pg.must(pg.psql(`SELECT id || ':' || gap_count(${t}) FROM ${t} ORDER BY id`, { role: "service_role" })).split("\n").map((l) => l.split(":").map(Number));
    assert.equal(out.length, rows.length);
    out.forEach(([id, sqlGaps], i) => {
      const r = rows[i];
      const js = productGaps({ ...r, specs: r.specs === null ? null : JSON.parse(r.specs) }).length;
      assert.equal(sqlGaps, js, `${t} row ${id} ${JSON.stringify(r)}`);
    });
  }
});

test("a computed column can be filtered and counted by service_role; a public role cannot run it", { skip: SKIP }, () => {
  assert.match(pg.must(pg.psql("SELECT count(*) FROM products WHERE gap_count(products) = 0", { role: "service_role" })), /^\d+$/);
  for (const role of ["anon", "authenticated"]) {
    const r = pg.psql("SELECT gap_count(products) FROM products LIMIT 1", { role });
    assert.equal(r.ok, false, role); assert.match(r.err, /permission denied/);
    const b = pg.psql("SELECT gap_count(beauty_products) FROM beauty_products LIMIT 1", { role });
    assert.equal(b.ok, false, role);
  }
});

test("phone_key matches phoneKey() of the panel for many formats and is NULL under 7 digits", { skip: SKIP }, () => {
  const phones = ["+992 900 12 34 56", "992900123456", "(0372) 21-00-11", "123456", "1234567", "", null, "  ", "tel: 987654321", "+7 (999) 123-45-67", "abc"];
  for (const t of ["quote_requests", "beauty_quote_requests"]) {
    pg.must(pg.script(`ph-${t}.sql`, `DELETE FROM ${t}; ${phones.map((p) => `INSERT INTO ${t}(phone, status) VALUES (${q(p)}, 'new');`).join("\n")}`));
    const rows = pg.must(pg.psql(`SELECT coalesce(phone, '<null>') || '|' || coalesce(phone_key, '<null>') FROM ${t} ORDER BY id`, { role: "service_role" })).split("\n");
    rows.forEach((line, i) => {
      const key = line.slice(line.lastIndexOf("|") + 1);
      assert.equal(key === "<null>" ? null : key, phoneKey(phones[i]), `${t} ${JSON.stringify(phones[i])}`);
    });
  }
  const direct = pg.psql("UPDATE quote_requests SET phone_key = 'x'", { role: "service_role" });
  assert.equal(direct.ok, false, "a generated column cannot be written");
});
