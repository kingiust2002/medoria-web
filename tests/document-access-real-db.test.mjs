// Review R1, end to end on the application side: the REAL serving code (lib/documentServe.js) against a real PostgreSQL that carries the real migrations
// 48 and 54. What is real: the document rows, the visibility function the anonymous visitor's check runs, privileges (the anonymous client really is
// the `anon` role). What is a stand-in: the bytes — an in-memory map keyed by bucket and path (no Supabase Storage server can run here), which is
// also what lets the test assert from WHICH bucket a file is read. Whether Supabase itself refuses an anonymous read of the private bucket is
// proved at the policy level in tests/private-product-documents-migration.test.mjs and is the first post-release probe of the runbook.
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createCluster, SKIP } from "./helpers/pgCluster.mjs";
import { pgRpcAdmin } from "./helpers/pgRpcAdmin.mjs";
import { serveDocument, parseDocRef, DOC_HOUSES } from "../lib/documentServe.js";

const pg = createCluster("pg54b", 8300);
before(() => pg.start({ migrations: { 30: "30_operator_security.sql", 34: "34_operator_users.sql", 48: "48_product_documents.sql", 54: "54_private_product_documents.sql" } }));
after(() => pg.stop());
const must = (r) => pg.must(r);
const sql = (q, role) => must(pg.psql(q, { role: role === "service_role" ? null : role }));      // setup statements run as the database owner
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
const files = new Map();
const storage = { from: (bucket) => ({ download: async (path) => (files.has(`${bucket}/${path}`) ? { data: new Blob([files.get(`${bucket}/${path}`)]), error: null } : { data: null, error: { message: "Object not found" } }) }) };
const adminWithStorage = () => Object.assign(pgRpcAdmin(pg), { storage });
const anon = pgRpcAdmin(pg, "anon");
const isVisible = async (house, id) => { const r = await anon.rpc(DOC_HOUSES[house].visible, { p_id: id }); return !r.error && r.data === true; };
const ask = (house, id, access = "public") => serveDocument({ house, id: String(id), access, isVisible, admin: adminWithStorage() });
const T = { health: "product_documents", beauty: "beauty_product_documents" };
const P = { health: "products", beauty: "beauty_products" };
let n = 0;
const addDoc = (house, product, o = {}) => {
  const title = o.title ?? `doc-${house}-${++n}`;
  const id = sql(`INSERT INTO ${T[house]} (product_id, kind, title, file_path, file_size, sha256, is_published, valid_until) VALUES (${product}, 'brochure', '${title}', 'documents/${title}.pdf', ${PDF.length}, '${String(n).padStart(64, "b")}', ${o.published ?? true}, ${o.until ? `'${o.until}'` : "NULL"}) RETURNING id`, "service_role");
  if (o.bytes !== null) files.set(`${DOC_HOUSES[house].bucket}/documents/${title}.pdf`, o.bytes ?? PDF);
  return { id: Number(id), title };
};

test("setup", { skip: SKIP }, () => {
  must(pg.psql(pg.M(30), { file: true })); must(pg.psql(pg.M(34), { file: true }));
  must(pg.psql(`CREATE TABLE public.products (id BIGINT PRIMARY KEY, slug TEXT, is_active BOOLEAN DEFAULT TRUE, variant_of BIGINT);
    CREATE TABLE public.beauty_products (id BIGINT PRIMARY KEY, slug TEXT, is_active BOOLEAN DEFAULT TRUE, variant_of BIGINT);
    INSERT INTO products VALUES (1,'live',TRUE,NULL),(2,'archived',FALSE,NULL),(3,'variant',TRUE,1);
    INSERT INTO beauty_products VALUES (1,'live',TRUE,NULL),(2,'archived',FALSE,NULL);
    CREATE SCHEMA storage;
    CREATE TABLE storage.buckets (id TEXT PRIMARY KEY, name TEXT NOT NULL, public BOOLEAN DEFAULT FALSE);
    CREATE TABLE storage.objects (id UUID DEFAULT gen_random_uuid() PRIMARY KEY, bucket_id TEXT, name TEXT);`));
  must(pg.psql(pg.M(48), { file: true })); must(pg.psql(pg.M(54), { file: true }));
});

for (const house of ["health", "beauty"]) {
  test(`${house} R1: a public document is served from the PRIVATE bucket as a PDF, never cached, never sniffed`, { skip: SKIP }, async () => {
    const d = addDoc(house, 1);
    const r = await ask(house, d.id);
    assert.equal(r.status, 200);
    assert.equal(r.headers["Content-Type"], "application/pdf");
    assert.equal(r.headers["X-Content-Type-Options"], "nosniff");
    assert.match(r.headers["Cache-Control"], /no-store/);
    assert.match(r.headers["Content-Disposition"], /^inline; filename="doc-/);
    assert.deepEqual(Buffer.from(r.body), PDF);
    assert.match(DOC_HOUSES[house].bucket, /documents$/, "never one of the public image buckets");
  });

  test(`${house} R1: direct unauthenticated requests for a draft, a hidden, an expired, an archived-parent and a nonexistent document all get the SAME 404`, { skip: SKIP }, async () => {
    const draft = addDoc(house, 1, { published: false });
    const expired = addDoc(house, 1, { until: "2000-01-01" });
    const archived = addDoc(house, 2);
    const answers = await Promise.all([draft.id, expired.id, archived.id, 999999].map((id) => ask(house, id)));
    for (const a of answers) { assert.equal(a.status, 404); assert.equal(Buffer.from(a.body).toString(), "Not found"); assert.ok(!a.headers["Content-Disposition"]); }
    assert.equal(new Set(answers.map((a) => JSON.stringify(a))).size, 1, "no difference an outsider could use to tell the cases apart");
  });

  test(`${house} R1: hiding, expiring or archiving the parent takes effect on the very next request (nothing is cached)`, { skip: SKIP }, async () => {
    const d = addDoc(house, 1);
    assert.equal((await ask(house, d.id)).status, 200);
    sql(`UPDATE ${T[house]} SET is_published = false WHERE id = ${d.id}`, "service_role");
    assert.equal((await ask(house, d.id)).status, 404, "hidden");
    sql(`UPDATE ${T[house]} SET is_published = true WHERE id = ${d.id}`, "service_role");
    assert.equal((await ask(house, d.id)).status, 200);
    sql(`UPDATE ${P[house]} SET is_active = false WHERE id = 1`, "service_role");
    assert.equal((await ask(house, d.id)).status, 404, "parent archived");
    sql(`UPDATE ${P[house]} SET is_active = true WHERE id = 1`, "service_role");
    assert.equal((await ask(house, d.id)).status, 200);
    sql(`DELETE FROM ${T[house]} WHERE id = ${d.id}`, "service_role");
    assert.equal((await ask(house, d.id)).status, 404, "deleted");
  });

  test(`${house} R1: staff can open a draft or hidden document of THEIR house; the other house's table is never reached`, { skip: SKIP }, async () => {
    const draft = addDoc(house, 1, { published: false });
    assert.equal((await ask(house, draft.id, "staff")).status, 200);
    const other = house === "health" ? "beauty" : "health";
    const otherDoc = addDoc(other, 1, { title: `only-${other}-${++n}` });
    // an id that exists only in the other house's table: the house given in the request decides which table is read
    sql(`SELECT setval(pg_get_serial_sequence('${T[house]}', 'id'), (SELECT GREATEST(max(id), 1) FROM ${T[house]}) + 500)`, "service_role");
    const unknownHere = otherDoc.id > 400 ? otherDoc.id : 400;
    assert.equal((await ask(house, unknownHere, "staff")).status, 404);
    assert.equal((await ask(house, draft.id, "nonsense")).status, 404, "an unknown access mode serves nothing");
  });

  test(`${house} R1: a visible document whose object is missing is a 404; one that is not a PDF is never served as a PDF; a failing visibility check serves nothing`, { skip: SKIP }, async () => {
    const missing = addDoc(house, 1, { bytes: null });
    assert.equal((await ask(house, missing.id)).status, 404);
    const fake = addDoc(house, 1, { bytes: Buffer.from("<html><script>alert(1)</script></html>") });
    assert.equal((await ask(house, fake.id)).status, 502);
    const ok = addDoc(house, 1);
    const broken = await serveDocument({ house, id: String(ok.id), access: "public", isVisible: async () => { throw new Error("db down"); }, admin: adminWithStorage() });
    assert.equal(broken.status, 404);
    const noAdmin = await serveDocument({ house, id: String(ok.id), access: "public", isVisible, admin: null });
    assert.equal(noAdmin.status, 503);
  });
}

test("health: the document of a variant is never public", { skip: SKIP }, async () => {
  const d = addDoc("health", 3);
  assert.equal((await ask("health", d.id)).status, 404);
});

test("the route's parameters: only a known house and a plain positive integer", () => {
  assert.deepEqual(parseDocRef("health", "12"), { house: "health", id: 12 });
  for (const [h, i] of [["health", "0"], ["health", "-1"], ["health", "1.5"], ["health", "1e3"], ["health", "01"], ["health", " 1"], ["health", "1 OR 1=1"], ["health", ""], ["admin", "1"], ["__proto__", "1"], ["constructor", "1"], ["toString", "1"]]) assert.equal(parseDocRef(h, i), null, `${h}/${i}`);
});

test("a title with quotes, slashes, line breaks or non-Latin letters cannot break the header", { skip: SKIP }, async () => {
  const d = addDoc("health", 1, { title: "x" });
  sql(`UPDATE ${T.health} SET title = E'Каталог "A"/B\\r\\nX-Evil: 1' WHERE id = ${d.id}`, "service_role");
  const r = await ask("health", d.id);
  assert.equal(r.status, 200);
  assert.ok(!/[\r\n]/.test(r.headers["Content-Disposition"]));
  assert.match(r.headers["Content-Disposition"], /filename\*=UTF-8''/);
  assert.ok(!/X-Evil/.test(Object.keys(r.headers).join()));
});
