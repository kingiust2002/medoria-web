// Migration 48 (product documents) run for real on a throw-away PostgreSQL cluster, for BOTH houses (skipped where the server binaries are not
// installed). Proves: it needs migration 34 and the product tables; it is idempotent; the tables are private; the constraints (kind, title, language,
// file path inside documents/, size, SHA-256, one file one document, one document per product and hash); the guard (version bump; product, file and
// hash never change); a product with documents cannot be deleted; and the PUBLIC function shows only published, still valid documents of an ACTIVE
// product that is not a variant, with public columns only. The template and the committed file agree.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createCluster, SKIP, root } from "./helpers/pgCluster.mjs";

const pg = createCluster("pg48", 7900);
before(() => pg.start({ migrations: { 30: "30_operator_security.sql", 34: "34_operator_users.sql", 48: "48_product_documents.sql" } }));
after(() => pg.stop());
const must = (r) => pg.must(r);
const psql = (sql, o) => pg.psql(sql, o);
const sc = (sql) => pg.psql(sql, { role: "service_role" });
const q = (v) => (v == null ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const HASH = (n) => String(n).padStart(64, "0").replace(/0/g, "a").slice(0, 63) + String(n % 10);
let seq = 0;
const doc = (h, product, o = {}) => {
  const n = ++seq;
  const T = h === "health" ? "product_documents" : "beauty_product_documents";
  return sc(`INSERT INTO ${T} (product_id, kind, title, lang, valid_until, file_path, file_size, sha256, is_published, sort_order) VALUES (${product}, ${q(o.kind ?? "brochure")}, ${q(o.title ?? `Doc ${n}`)}, ${q(o.lang ?? null)}, ${o.valid_until ? `'${o.valid_until}'` : "NULL"}, ${q(o.path ?? `documents/f${n}.pdf`)}, ${o.size ?? 1000}, ${q(o.hash ?? `${n.toString(16).padStart(2, "0")}${"b".repeat(62)}`)}, ${o.published ? "TRUE" : "FALSE"}, ${o.sort ?? 0}) RETURNING id`);
};
const FN = { health: "public_product_documents", beauty: "public_beauty_product_documents" };
const publicDocs = (h, product) => must(psql(`SELECT coalesce(string_agg(title, '|' ORDER BY ord), '') FROM (SELECT title, row_number() OVER () ord FROM ${FN[h]}(${product})) s`, { role: "anon" }));

test("the committed migration is exactly the template's output", () => {
  const r = spawnSync(process.execPath, [path.join(root, "scripts/db/gen-product-documents-migration.mjs"), "--check"], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
});

test("needs migration 34 and the product tables; idempotent", { skip: SKIP }, () => {
  let r = psql(pg.M(48), { file: true });
  assert.equal(r.ok, false); assert.match(r.err, /needs migration 34/);
  must(psql(pg.M(30), { file: true })); must(psql(pg.M(34), { file: true }));
  r = psql(pg.M(48), { file: true });
  assert.equal(r.ok, false); assert.match(r.err, /needs the product tables/);
  must(psql(`CREATE TABLE public.products (id BIGINT PRIMARY KEY, slug TEXT, is_active BOOLEAN DEFAULT TRUE, variant_of BIGINT);
    CREATE TABLE public.beauty_products (id BIGINT PRIMARY KEY, slug TEXT, is_active BOOLEAN DEFAULT TRUE);
    INSERT INTO products VALUES (1,'a',TRUE,NULL),(2,'b',FALSE,NULL),(3,'c',TRUE,1);
    INSERT INTO beauty_products VALUES (1,'x',TRUE),(2,'y',TRUE);`));
  must(psql(pg.M(48), { file: true })); must(psql(pg.M(48), { file: true }));
});

test("the tables are private: nothing for anon / authenticated, service_role reads and writes", { skip: SKIP }, () => {
  for (const T of ["product_documents", "beauty_product_documents"]) {
    for (const role of ["anon", "authenticated"]) {
      assert.equal(psql(`SELECT * FROM ${T}`, { role }).ok, false, `${role} must not read ${T}`);
      assert.equal(psql(`INSERT INTO ${T}(product_id, kind, title, file_path, file_size, sha256) VALUES (1,'other','x','documents/z.pdf',1,'${"c".repeat(64)}')`, { role }).ok, false);
    }
  }
  must(doc("health", 1, { title: "Health one", published: true })); must(doc("beauty", 1, { title: "Beauty one", published: true }));
  assert.equal(must(sc("SELECT count(*) FROM product_documents")), "1");
  assert.equal(must(sc("SELECT count(*) FROM beauty_product_documents")), "1");
});

test("constraints: kind, title, language, file path, size, SHA-256, one file one document, one document per product and hash", { skip: SKIP }, () => {
  for (const h of ["health", "beauty"]) {
    assert.equal(doc(h, 1, { kind: "invoice" }).ok, false, "unknown kind");
    for (const kind of ["brochure", "datasheet", "certificate", "manual", "other"]) must(doc(h, 2, { kind }));
    assert.equal(doc(h, 1, { title: "   " }).ok, false, "blank title");
    assert.equal(doc(h, 1, { title: "x".repeat(161) }).ok, false);
    assert.equal(doc(h, 1, { lang: "de" }).ok, false);
    for (const lang of ["fa", "tg", "ru", "en"]) must(doc(h, 2, { lang }));
    for (const bad of ["products/x.pdf", "documents/../x.pdf", "documents/a/b.pdf", "/documents/x.pdf", "documents/", "documents/x y.pdf", "documents/x;rm.pdf"]) assert.equal(doc(h, 1, { path: bad }).ok, false, bad);
    assert.equal(doc(h, 1, { size: 0 }).ok, false); assert.equal(doc(h, 1, { size: 20971521 }).ok, false);
    assert.equal(doc(h, 1, { hash: "XYZ" }).ok, false); assert.equal(doc(h, 1, { hash: "A".repeat(64) }).ok, false, "lower-case hex only");
    must(doc(h, 1, { path: "documents/same.pdf" }));
    assert.equal(doc(h, 2, { path: "documents/same.pdf" }).ok, false, "one file, one document");
    must(doc(h, 1, { hash: "d".repeat(64) }));
    assert.equal(doc(h, 1, { hash: "d".repeat(64) }).ok, false, "the same content twice on one product");
    must(doc(h, 2, { hash: "d".repeat(64) }));
    assert.equal(doc(h, 999).ok, false, "a product that does not exist");
  }
});

test("the guard: every update bumps the version; product, file and hash never change; a product with documents cannot be deleted", { skip: SKIP }, () => {
  const id = must(doc("health", 1, { title: "Lock me" })).split("\n")[0];
  const v0 = Number(must(sc(`SELECT version FROM product_documents WHERE id = ${id}`)));
  must(sc(`UPDATE product_documents SET title = 'Renamed' WHERE id = ${id}`));
  must(sc(`UPDATE product_documents SET is_published = TRUE WHERE id = ${id}`));
  assert.equal(Number(must(sc(`SELECT version FROM product_documents WHERE id = ${id}`))), v0 + 2);
  for (const set of ["product_id = 2", "file_path = 'documents/other.pdf'", `sha256 = '${"e".repeat(64)}'`, "id = 999999"]) {
    const r = sc(`UPDATE product_documents SET ${set} WHERE id = ${id}`);
    assert.equal(r.ok, false, set); assert.match(r.err, /fixed/, set);
  }
  assert.equal(sc("DELETE FROM products WHERE id = 1").ok, false, "documents hold the product (RESTRICT)");
  must(sc(`DELETE FROM product_documents WHERE id = ${id}`));
});

test("the public function: published + still valid + active product + not a variant; public columns only; both houses separate", { skip: SKIP }, () => {
  must(sc("DELETE FROM product_documents; DELETE FROM beauty_product_documents;"));
  const today = must(psql("SELECT (NOW() AT TIME ZONE 'Asia/Dushanbe')::date::text"));
  const day = (n) => must(psql(`SELECT ('${today}'::date + ${n})::text`));
  must(doc("health", 1, { title: "B draft", published: false }));
  must(doc("health", 1, { title: "C second", published: true, sort: 2 }));
  must(doc("health", 1, { title: "A first", published: true, sort: 1, kind: "certificate", valid_until: day(0) }));       // valid through today
  must(doc("health", 1, { title: "Z lapsed", published: true, valid_until: day(-1) }));
  must(doc("health", 1, { title: "Y future", published: true, valid_until: day(30) , sort: 3 }));
  must(doc("health", 2, { title: "On an inactive product", published: true }));
  must(doc("health", 3, { title: "On a variant", published: true }));
  must(doc("beauty", 1, { title: "Beauty doc", published: true }));
  assert.equal(publicDocs("health", 1), "A first|C second|Y future");
  assert.equal(publicDocs("health", 2), "", "an inactive product shows nothing");
  assert.equal(publicDocs("health", 3), "", "a variant is not a page of its own");
  assert.equal(publicDocs("health", 999), "");
  assert.equal(publicDocs("beauty", 1), "Beauty doc");
  assert.equal(publicDocs("beauty", 2), "");
  // only the public columns
  const row = must(psql(`SELECT to_jsonb(d) FROM public_product_documents(1) d LIMIT 1`, { role: "anon" }));
  const keys = Object.keys(JSON.parse(row)).sort();
  assert.deepEqual(keys, ["file_path", "file_size", "id", "kind", "lang", "title", "valid_until"], "no hash, no author, no publication flag");
  // the function is the only way in for the public
  assert.equal(psql("SELECT * FROM product_documents", { role: "anon" }).ok, false);
  assert.equal(psql(`SELECT * FROM ${FN.health}(1)`, { role: "authenticated" }).ok, true);
});
