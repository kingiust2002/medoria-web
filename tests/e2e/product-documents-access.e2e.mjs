// Product documents (review R1) through the real running application: the files are in PRIVATE buckets, so the only way to a file is the download
// route. Anonymous visitors get a document only while it is public; staff get their own house's documents in any state through the panel route, and a
// person without a session gets nothing; the old public-bucket address of a document answers "no such bucket". (The fake database stands in for
// Supabase; the policy-level proof on real PostgreSQL is tests/private-product-documents-migration.test.mjs.)
import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { BASE, DB, launch, resetDb, login } from "./helpers.mjs";

let browser;
before(async () => { browser = await launch(); });
after(async () => { await browser?.close(); });
beforeEach(async () => { await resetDb(); });

const SERVICE = "service-test-key";
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");
async function insert(table, rows) {
  const res = await fetch(`${DB}/rest/v1/${table}`, { method: "POST", headers: { apikey: SERVICE, "content-type": "application/json", prefer: "return=representation" }, body: JSON.stringify(rows) });
  assert.equal(res.status, 201, await res.clone().text());
  return res.json();
}
async function upload(bucket, path) {
  const res = await fetch(`${DB}/storage/v1/object/${bucket}/${path}`, { method: "POST", headers: { apikey: SERVICE, "content-type": "application/pdf" }, body: PDF });
  assert.equal(res.status, 200);
}
const ts = "2026-10-01T10:00:00.000Z";
async function seed(house) {
  const P = house === "health" ? "products" : "beauty_products", T = house === "health" ? "product_documents" : "beauty_product_documents", bucket = house === "health" ? "product-documents" : "beauty-product-documents";
  await insert(P, [{ id: 9001, slug: `e2e-doc-${house}`, sku: `DOC-${house}`, name_en: "Doc product", name_fa: "Doc product", price: 5, in_stock: true, is_active: true, created_at: ts, updated_at: ts }]);
  const row = (id, title, o = {}) => ({ id, product_id: 9001, kind: "brochure", title, lang: null, valid_until: null, file_path: `documents/${title}.pdf`, file_size: PDF.length, sha256: String(id).padStart(64, "c"), is_published: true, sort_order: 0, version: 1, created_at: ts, updated_at: ts, ...o });
  await insert(T, [row(7001, "public-one"), row(7002, "draft-one", { is_published: false }), row(7003, "expired-one", { valid_until: "2000-01-01" })]);
  for (const t of ["public-one", "draft-one", "expired-one"]) await upload(bucket, `documents/${t}.pdf`);
  return { bucket };
}
const fetchDoc = (path, init) => fetch(BASE + path, { redirect: "manual", ...init });

for (const house of ["health", "beauty"]) {
  test(`${house}: an anonymous visitor gets a public document as a PDF, and the same 404 for a draft, an expired and a missing one`, async () => {
    const { bucket } = await seed(house);
    const ok = await fetchDoc(`/api/documents/${house}/7001`);
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get("content-type"), "application/pdf");
    assert.match(ok.headers.get("cache-control"), /no-store/);
    assert.equal(ok.headers.get("x-content-type-options"), "nosniff");
    assert.deepEqual(Buffer.from(await ok.arrayBuffer()), PDF);
    const answers = [];
    for (const id of [7002, 7003, 424242]) { const r = await fetchDoc(`/api/documents/${house}/${id}`); answers.push([r.status, await r.text()]); }
    assert.deepEqual(answers, [[404, "Not found"], [404, "Not found"], [404, "Not found"]]);
    // the old way (a public storage address) no longer exists for these files
    const direct = await fetch(`${DB}/storage/v1/object/public/${bucket}/documents/public-one.pdf`);
    assert.notEqual(direct.status, 200, "a private bucket has no public address");
  });

  test(`${house}: hiding a document closes its link at once; nothing wrong can be asked of the route`, async () => {
    await seed(house);
    const T = house === "health" ? "product_documents" : "beauty_product_documents";
    assert.equal((await fetchDoc(`/api/documents/${house}/7001`)).status, 200);
    const res = await fetch(`${DB}/rest/v1/${T}?id=eq.7001`, { method: "PATCH", headers: { apikey: SERVICE, "content-type": "application/json" }, body: JSON.stringify({ is_published: false }) });
    assert.ok(res.ok);
    assert.equal((await fetchDoc(`/api/documents/${house}/7001`)).status, 404);
    for (const bad of ["abc", "0", "-1", "1.5", "7001%20OR%201=1", "%2e%2e%2fsecret"]) assert.equal((await fetchDoc(`/api/documents/${house}/${bad}`)).status, 404, bad);
    assert.equal((await fetchDoc(`/api/documents/not-a-house/7001`)).status, 404);
  });

  test(`${house}: the panel route needs a session: nobody gets a draft; a signed-in person of THIS house opens it, the other house's route does not`, async () => {
    await seed(house);
    const route = house === "health" ? "/api/operator/documents" : "/api/beauty-operator/documents";
    const otherRoute = house === "health" ? "/api/beauty-operator/documents" : "/api/operator/documents";
    assert.equal((await fetchDoc(`${route}/7002`)).status, 404, "no session");
    const page = await (await browser.newContext()).newPage();
    await login(page, house);
    const cookies = (await page.context().cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
    const draft = await fetchDoc(`${route}/7002`, { headers: { cookie: cookies } });
    assert.equal(draft.status, 200);
    assert.equal(draft.headers.get("content-type"), "application/pdf");
    assert.deepEqual(Buffer.from(await draft.arrayBuffer()), PDF);
    assert.equal((await fetchDoc(`${otherRoute}/7002`, { headers: { cookie: cookies } })).status, 404, "this session means nothing in the other house's panel");
    await page.context().close();
  });
}
