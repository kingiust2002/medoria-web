// Migration 54 (private product documents; review R1) run for real on a throw-away PostgreSQL cluster, for both houses, with a stand-in `storage`
// schema that carries the REAL policy text of migrations 06 / 10 (public read of the image buckets, restricted by bucket_id) and row-level security
// on storage.objects like Supabase. Proves: the document buckets are private and an anonymous or signed-in API caller cannot see one object in
// them while the image buckets stay readable; the public list no longer returns a storage path; the visibility function says yes only for a
// published, unexpired document of an active parent that is not a variant, per house; a policy that would expose the buckets stops the migration.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createCluster, SKIP } from "./helpers/pgCluster.mjs";

const pg = createCluster("pg54", 8100);
before(() => pg.start({ migrations: { 30: "30_operator_security.sql", 34: "34_operator_users.sql", 48: "48_product_documents.sql", 54: "54_private_product_documents.sql" } }));
after(() => pg.stop());
const must = (r) => pg.must(r);
const psql = (sql, o) => pg.psql(sql, o);
const val = (sql, role = "service_role") => must(psql(sql, { role }));
const HASH = (n) => String(n).padStart(64, "a");

const STORAGE = `
CREATE SCHEMA storage;
CREATE TABLE storage.buckets (id TEXT PRIMARY KEY, name TEXT NOT NULL, public BOOLEAN DEFAULT FALSE, file_size_limit BIGINT, allowed_mime_types TEXT[]);
CREATE TABLE storage.objects (id UUID DEFAULT gen_random_uuid() PRIMARY KEY, bucket_id TEXT REFERENCES storage.buckets(id), name TEXT);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
GRANT SELECT ON storage.objects, storage.buckets TO anon, authenticated; GRANT ALL ON storage.objects, storage.buckets TO service_role;
INSERT INTO storage.buckets (id, name, public) VALUES ('product-images','product-images',true), ('beauty-product-images','beauty-product-images',true);
CREATE POLICY "product_images_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'product-images');
CREATE POLICY "beauty_product_images_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'beauty-product-images');`;

test("needs migration 48 and the storage schema; applies and re-applies", { skip: SKIP }, () => {
  must(psql(pg.M(30), { file: true })); must(psql(pg.M(34), { file: true }));
  must(psql(`CREATE TABLE public.products (id BIGINT PRIMARY KEY, slug TEXT, is_active BOOLEAN DEFAULT TRUE, variant_of BIGINT);
    CREATE TABLE public.beauty_products (id BIGINT PRIMARY KEY, slug TEXT, is_active BOOLEAN DEFAULT TRUE, variant_of BIGINT);
    INSERT INTO products VALUES (1,'a',TRUE,NULL),(2,'archived',FALSE,NULL),(3,'variant',TRUE,1);
    INSERT INTO beauty_products VALUES (1,'x',TRUE,NULL),(2,'y',FALSE,NULL);`));
  let r = psql(pg.M(54), { file: true });
  assert.equal(r.ok, false); assert.match(r.err, /needs migration 48/);
  must(psql(pg.M(48), { file: true }));
  r = psql(pg.M(54), { file: true });
  assert.equal(r.ok, false); assert.match(r.err, /needs the storage schema/);
  must(pg.script("storage.sql", STORAGE));
  must(psql(pg.M(54), { file: true })); must(psql(pg.M(54), { file: true }));
  assert.equal(val("SELECT count(*) FROM storage.buckets WHERE id IN ('product-documents','beauty-product-documents') AND NOT public"), "2");
  assert.equal(val("SELECT file_size_limit || '/' || allowed_mime_types[1] FROM storage.buckets WHERE id = 'product-documents'"), "15728640/application/pdf");
});

test("R1: an object in a document bucket is invisible to anon and authenticated (while image-bucket objects stay public)", { skip: SKIP }, () => {
  must(psql(`INSERT INTO storage.objects (bucket_id, name) VALUES ('product-images','products/a.webp'), ('product-documents','documents/secret-draft.pdf'), ('beauty-product-documents','documents/secret-draft.pdf')`));
  for (const role of ["anon", "authenticated"]) {
    assert.equal(val("SELECT count(*) FROM storage.objects WHERE bucket_id = 'product-images'", role), "1", `${role}: images stay public`);
    assert.equal(val("SELECT count(*) FROM storage.objects WHERE bucket_id IN ('product-documents','beauty-product-documents')", role), "0", `${role} must not see a document object`);
    assert.equal(val("SELECT count(*) FROM storage.objects WHERE name LIKE 'documents/%'", role), "0");
  }
  assert.equal(val("SELECT count(*) FROM storage.objects WHERE bucket_id IN ('product-documents','beauty-product-documents')"), "2", "the service role (the application) can");
});

const FN = { health: ["public_product_documents", "public_product_document_visible", "product_documents"], beauty: ["public_beauty_product_documents", "public_beauty_product_document_visible", "beauty_product_documents"] };
const ins = (h, product, title, o = {}) => val(`INSERT INTO ${FN[h][2]} (product_id, kind, title, file_path, file_size, sha256, is_published, valid_until) VALUES (${product}, 'brochure', '${title}', 'documents/${title}.pdf', 1000, '${HASH(Math.floor(Math.random() * 1e9))}', ${o.published ?? true}, ${o.until ? `'${o.until}'` : "NULL"}) RETURNING id`);

for (const h of ["health", "beauty"]) {
  test(`${h}: the public list has no storage path; "visible" is yes only for published, unexpired documents of an active parent that is not a variant`, { skip: SKIP }, () => {
    const cols = val(`SELECT pg_get_function_result('public.${FN[h][0]}(bigint)'::regprocedure)`);
    assert.doesNotMatch(cols, /file_path/, "no storage path is returned to anybody");
    assert.match(cols, /title/);
    const ok = ins(h, 1, `${h}-ok`);
    const draft = ins(h, 1, `${h}-draft`, { published: false });
    const expired = ins(h, 1, `${h}-expired`, { until: "2000-01-01" });
    const future = ins(h, 1, `${h}-future`, { until: "2999-01-01" });
    const archived = ins(h, 2, `${h}-archived-parent`);
    const visible = (id, role = "anon") => val(`SELECT ${FN[h][1]}(${id})`, role);
    assert.deepEqual([ok, future].map((id) => visible(id)), ["t", "t"]);
    assert.deepEqual([draft, expired, archived].map((id) => visible(id)), ["f", "f", "f"]);
    assert.equal(visible(999999), "f");
    assert.equal(visible(ok, "authenticated"), "t");
    // hiding takes effect at once; so does archiving the parent
    val(`UPDATE ${FN[h][2]} SET is_published = false WHERE id = ${ok}`);
    assert.equal(visible(ok), "f");
    val(`UPDATE ${FN[h][2]} SET is_published = true WHERE id = ${ok}`);
    assert.equal(visible(ok), "t");
    assert.equal(val(`SELECT count(*) FROM ${FN[h][0]}(1)`, "anon"), "2", "the list shows the same two");
    if (h === "health") {
      const onVariant = ins(h, 3, "variant-doc");
      assert.equal(visible(onVariant), "f", "a variant's document is never public");
    }
  });
}

test("the document tables stay private for the public API roles", { skip: SKIP }, () => {
  for (const T of ["product_documents", "beauty_product_documents"]) for (const role of ["anon", "authenticated"]) assert.equal(psql(`SELECT * FROM ${T}`, { role }).ok, false, `${role} ${T}`);
});

test("a policy that would expose the private buckets stops the migration (self-check)", { skip: SKIP }, () => {
  must(psql(`CREATE POLICY "oops_all" ON storage.objects FOR SELECT USING (true)`));
  let r = psql(pg.M(54), { file: true });
  assert.equal(r.ok, false); assert.match(r.err, /could expose the private document buckets/);
  must(psql(`DROP POLICY "oops_all" ON storage.objects; CREATE POLICY "oops_docs" ON storage.objects FOR SELECT USING (bucket_id = 'product-documents')`));
  r = psql(pg.M(54), { file: true });
  assert.equal(r.ok, false); assert.match(r.err, /could expose/);
  must(psql(`DROP POLICY "oops_docs" ON storage.objects`));
  must(psql(pg.M(54), { file: true }));
});

test("a re-run turns a bucket that someone made public back to private, and warns about files left in the old public bucket", { skip: SKIP }, () => {
  must(psql(`UPDATE storage.buckets SET public = true WHERE id = 'product-documents'`));
  const r = psql(pg.M(54), { file: true });
  assert.ok(r.ok, r.err);
  assert.equal(val("SELECT public FROM storage.buckets WHERE id = 'product-documents'"), "f");
  assert.match(r.err, /document row\(s\) already exist/, "existing rows → the owner is told to move their files");
});
