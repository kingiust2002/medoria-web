// Product documents (N8): what may be uploaded (PDFs only, looked at before they are stored), what a form may say, the actions of both houses with
// their rights and the approval path for publishing and deleting, the approval executors, and the public page. Uses an in-memory database and a fake
// storage; the real-PostgreSQL rules are in tests/product-documents-migration.test.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createMemoryAdmin } from "./helpers/memoryAdmin.mjs";
import { cleanDocumentInput, scanPdf, documentPath, isPdfFile, DOC_MESSAGES, DOC_LIMITS, DOC_KINDS } from "../lib/operator/documents.js";
import { addDocument, updateDocument, setDocumentPublished, deleteDocument, listDocuments, makeDocumentExecutors } from "../lib/operator/documentsCore.js";
import { publicDocumentItems, docCopy, DOC_COPY } from "../lib/productDocuments.js";
import { decide, canReview, OPERATIONS, isApprovable } from "../lib/operator/authz.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

// a small but complete PDF
const pdf = (extra = "") => Buffer.from(`%PDF-1.4\n1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n2 0 obj << /Type /Pages /Kids [] /Count 0 >> endobj\n${extra}\ntrailer << /Root 1 0 R >>\n%%EOF\n`, "latin1");
const file = (buf = pdf(), name = "Brochure 2026.pdf", type = "application/pdf") => ({ name, type, size: buf.length, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) });
const form = (o) => ({ get: (k) => o[k] });

// ── what may be uploaded ──────────────────────────────────────────────────────────────────────────────────────────────────
test("a PDF is looked at before it is stored: complete, no script / attached file / form submission / launch / encryption — also when the names are disguised", () => {
  assert.deepEqual(scanPdf(pdf()), { ok: true, compressed: false });
  assert.equal(scanPdf(pdf("3 0 obj << /Type /ObjStm >> endobj")).compressed, true, "compressed object streams cannot be read: accepted but flagged");
  const refused = (extra, why) => assert.deepEqual([scanPdf(pdf(extra)).ok, scanPdf(pdf(extra)).error], [false, DOC_MESSAGES.active], why);
  refused("<< /S /JavaScript /JS (app.alert(1)) >>", "script");
  refused("<< /OpenAction << /S /JS /JS (x) >> >>", "short name");
  refused("<< /S /Launch /F (cmd.exe) >>", "launch");
  refused("<< /Type /EmbeddedFile >>", "attachment");
  refused("<< /Type /RichMedia >>", "rich media"); refused("<< /XFA [] >>", "xfa"); refused("<< /S /SubmitForm >>", "submit form"); refused("<< /S /GoToR >>", "remote goto");
  refused("/Encrypt 5 0 R", "encryption cannot be inspected");
  refused("<< /S /J#61vaScript >>", "a name written with #xx escapes is decoded first");
  assert.equal(scanPdf(pdf("<< /Type /Annot /Subtype /Link /A << /S /URI /URI (https://example.com) >> >>")).ok, true, "an ordinary link is fine");
  assert.equal(scanPdf(pdf("/JSON (not an action) /JSX")).ok, true, "a longer name that merely starts like JS is not JS");
  assert.equal(scanPdf(Buffer.from("<html>hello</html>".padEnd(40))).error, DOC_MESSAGES.notPdf);
  assert.equal(scanPdf(Buffer.from("%PDF-1.4 truncated, no end marker ".repeat(3))).error, DOC_MESSAGES.damaged);
  assert.equal(scanPdf(Buffer.alloc(5)).error, DOC_MESSAGES.damaged); assert.equal(scanPdf(null).error, DOC_MESSAGES.damaged);
  assert.equal(scanPdf(Buffer.concat([Buffer.from("junk"), pdf()])).error, DOC_MESSAGES.notPdf, "the header must be first");
});

test("the form: a title, a known kind and language, a real date; only what was sent when updating", () => {
  assert.deepEqual(cleanDocumentInput({ title: "  Datasheet  ", kind: "datasheet", lang: "en", valid_until: "2027-03-01" }), { ok: true, value: { title: "Datasheet", kind: "datasheet", lang: "en", valid_until: "2027-03-01" } });
  assert.deepEqual(cleanDocumentInput({ title: "x", kind: "other", lang: "", valid_until: "" }).value, { title: "x", kind: "other", lang: null, valid_until: null });
  assert.equal(cleanDocumentInput({ title: "", kind: "other" }).error, DOC_MESSAGES.badTitle);
  assert.equal(cleanDocumentInput({ title: "   ", kind: "other" }).error, DOC_MESSAGES.badTitle);
  assert.equal(cleanDocumentInput({ title: "x".repeat(500), kind: "other" }).value.title.length, DOC_LIMITS.titleMax);
  assert.equal(cleanDocumentInput({ title: "x", kind: "invoice" }).error, DOC_MESSAGES.badKind);
  assert.equal(cleanDocumentInput({ title: "x", kind: "other", lang: "de" }).error, DOC_MESSAGES.badLang);
  for (const bad of ["2027-02-30", "2027-13-01", "01/03/2027", "soon", "2027-3-1"]) assert.equal(cleanDocumentInput({ title: "x", kind: "other", valid_until: bad }).error, DOC_MESSAGES.badDate, bad);
  assert.deepEqual(cleanDocumentInput({ title: "New" }, { partial: true }).value, { title: "New" }, "an update sends only what changed");
  assert.deepEqual(cleanDocumentInput({}, { partial: true }), { ok: true, value: {} });
  assert.deepEqual(cleanDocumentInput({ sort_order: "7" }, { partial: true }).value, { sort_order: 7 });
  assert.deepEqual(DOC_KINDS, ["brochure", "datasheet", "certificate", "manual", "other"]);
  assert.equal(isPdfFile({ type: "application/pdf", name: "a" }), true); assert.equal(isPdfFile({ type: "", name: "a.PDF" }), true);
  assert.equal(isPdfFile({ type: "image/png", name: "a.png" }), false); assert.equal(isPdfFile("x"), false);
  assert.match(documentPath("My Brochure (final).PDF", 123, "abc"), /^documents\/123-abc-my-brochure-final\.pdf$/);
  assert.match(documentPath("../../etc/passwd", 1, "x"), /^documents\/1-x-passwd\.pdf$/);
  assert.match(documentPath("", 1, "x"), /^documents\/1-x-document\.pdf$/);
  for (const n of ["ä ö ü.pdf", "日本語.pdf", "a;b|c.pdf", "x".repeat(200) + ".pdf"]) assert.match(documentPath(n), /^documents\/[A-Za-z0-9._-]+$/, n);
});

// ── the actions ──────────────────────────────────────────────────────────────────────────────────────────────────────────
function world(house = "health", extra = {}) {
  const PT = house === "health" ? "products" : "beauty_products", T = house === "health" ? "product_documents" : "beauty_product_documents";
  let id = 0;
  const db = createMemoryAdmin({
    [PT]: [{ id: 1, slug: "gloves", is_active: true, variant_of: null }, { id: 2, slug: "gloves-m", is_active: true, variant_of: 1 }],
    [T]: [], ...extra,
  }, { defaults: { [T]: () => ({ id: ++id, version: 1, updated_at: `2026-10-0${id}T10:00:00.000Z`, created_at: "2026-10-01T00:00:00.000Z" }) }, beforeUpdate: { [T]: (old, next) => { next.version = old.version + 1; next.updated_at = `2026-11-0${next.version}T10:00:00.000Z`; return null; } } });
  const stored = new Map(), removed = [];
  db.storage = { from: (bucket) => ({ upload: async (p, body, opts) => { if (db.failUpload) return { error: { message: "boom" } }; stored.set(`${bucket}/${p}`, { body, opts }); return { error: null }; }, remove: async (paths) => { removed.push(...paths.map((p) => `${bucket}/${p}`)); return { data: [], error: null }; } }) };
  db.stored = stored; db.removed = removed;
  return db;
}
function ctxFor(db, panel, { allow = ["documents.create", "documents.edit", "documents.publish", "documents.delete"], approval = [] } = {}) {
  const logged = [], filed = [];
  return {
    logged, filed, revalidated: [],
    ctx: {
      admin: db, panel, session: { user: { id: "u1", username: "sara" } }, audit: async (...x) => logged.push(x), revalidate: () => filed.push("revalidate"),
      require: async (ops) => ([].concat(ops).every((o) => allow.includes(o)) ? null : { ok: false, denied: true, error: "no" }),
      evaluate: async (ops) => { const o = [].concat(ops)[0]; if (!allow.includes(o)) return { mode: "denied", refusal: { ok: false, denied: true, error: "no" } }; return { mode: approval.includes(o) ? "approval" : "direct" }; },
      file: async (spec) => { filed.push(spec); return { ok: true, pending: true, message: "filed" }; },
    },
  };
}
const add = (c, o = {}) => addDocument(c.ctx, o.product ?? 1, form({ file: o.file ?? file(), title: "Brochure", kind: "brochure", lang: "en", valid_until: "", ...o.fields }));

for (const house of ["health", "beauty"]) {
  const T = house === "health" ? "product_documents" : "beauty_product_documents", BUCKET = house === "health" ? "product-images" : "beauty-product-images";

  test(`${house}: a document is added as a DRAFT — the file goes to the house's own bucket (folder documents/), the row carries its size and SHA-256, the log has the product`, async () => {
    const db = world(house), c = ctxFor(db, house);
    const buf = pdf("% unique");
    const r = await add(c, { file: file(buf) });
    assert.equal(r.ok, true);
    const row = db.tables[T][0];
    assert.deepEqual([row.product_id, row.kind, row.title, row.lang, row.is_published, row.file_size, row.sha256], [1, "brochure", "Brochure", "en", false, buf.length, createHash("sha256").update(buf).digest("hex")]);
    assert.match(row.file_path, /^documents\/\d+-[a-z0-9]+-brochure-2026\.pdf$/);
    const [[key, put]] = [...db.stored];
    assert.equal(key, `${BUCKET}/${row.file_path}`);
    assert.deepEqual([put.opts.contentType, put.opts.upsert, Buffer.isBuffer(put.body)], ["application/pdf", false, true]);
    assert.equal(row.updated_label, "sara"); assert.equal(row.created_by, "u1");
    assert.deepEqual(c.logged.map(([a, m]) => [a, m.result, m.ids, m.detail]), [["document.create", "success", [row.id], { product: 1, kind: "brochure" }]]);
    assert.equal(c.logged[0][1].entity, T);
  });

  test(`${house}: refusals — right, product, file kind, size, damaged / active PDF, duplicates, count, missing table; a refused upload stores nothing and a failed insert removes the file`, async () => {
    const db = world(house);
    assert.deepEqual(await add(ctxFor(db, house, { allow: [] })), { ok: false, denied: true, error: "no" });
    const c = ctxFor(db, house);
    assert.equal((await add(c, { product: 999 })).error, DOC_MESSAGES.noProduct);
    assert.equal((await add(c, { product: 2 })).error, DOC_MESSAGES.noProduct, "a variant has no documents of its own");
    assert.equal((await add(c, { product: "abc" })).error, DOC_MESSAGES.noProduct);
    assert.equal((await add(c, { file: file(Buffer.from("x"), "a.png", "image/png") })).error, DOC_MESSAGES.notPdf);
    assert.equal((await add(c, { file: { ...file(), size: DOC_LIMITS.maxBytes + 1 } })).error, DOC_MESSAGES.tooBig);
    assert.equal((await add(c, { file: file(pdf("<< /S /JavaScript >>")) })).error, DOC_MESSAGES.active);
    assert.equal((await add(c, { file: file(Buffer.from("<html>".padEnd(40)), "fake.pdf") })).error, DOC_MESSAGES.notPdf);
    assert.equal((await addDocument(c.ctx, 1, form({ title: "x", kind: "other" }))).error, DOC_MESSAGES.none);
    assert.equal((await add(c, { fields: { title: "" } })).error, DOC_MESSAGES.badTitle);
    assert.equal(db.stored.size, 0, "nothing was stored by any refusal");
    assert.equal((await add(c, { file: file(pdf("% a")) })).ok, true);
    assert.equal((await add(c, { file: file(pdf("% a"), "again.pdf") })).error, DOC_MESSAGES.duplicate, "the same content twice on one product");
    db.failUpload = true;
    assert.equal((await add(c, { file: file(pdf("% b")) })).error, DOC_MESSAGES.uploadFailed);
    db.failUpload = false;
    const failing = world(house); failing.fail = (t, op) => (t === T && op === "insert" ? { code: "XX000", message: "boom" } : null);
    const fc = ctxFor(failing, house);
    assert.equal((await add(fc)).error, DOC_MESSAGES.generic);
    assert.equal(failing.removed.length, 1, "the file is removed again when the row could not be written");
    assert.deepEqual(fc.logged.map(([a, m]) => [a, m.result]), [["document.create", "failure"]]);
    // a full product
    const full = world(house, { [T]: Array.from({ length: DOC_LIMITS.maxPerProduct }, (_, i) => ({ id: i + 1, product_id: 1, sha256: `h${i}`, version: 1 })) });
    assert.equal((await add(ctxFor(full, house))).error, DOC_MESSAGES.tooMany);
    // before migration 48
    const old = createMemoryAdmin({ [house === "health" ? "products" : "beauty_products"]: [{ id: 1, variant_of: null }] }); old.storage = db.storage;
    assert.equal((await add(ctxFor(old, house))).error, DOC_MESSAGES.unavailable);
    assert.deepEqual(await listDocuments(old, house, 1), { ok: true, unavailable: true, rows: [] });
  });

  test(`${house}: edit needs documents.edit and the current version; publishing needs documents.publish and goes through approval when the policy says so; hiding is a plain edit`, async () => {
    const db = world(house), c = ctxFor(db, house);
    await add(c);
    const row = () => db.tables[T][0];
    // edit
    assert.deepEqual(await updateDocument(ctxFor(db, house, { allow: ["documents.create"] }).ctx, 1, { title: "X" }, 1), { ok: false, denied: true, error: "no" });
    const up = await updateDocument(c.ctx, 1, { title: "Renamed", kind: "certificate", valid_until: "2030-01-01" }, 1);
    assert.equal(up.ok, true); assert.deepEqual([row().title, row().kind, row().valid_until, row().version], ["Renamed", "certificate", "2030-01-01", 2]);
    assert.equal((await updateDocument(c.ctx, 1, { title: "Stale" }, 1)).conflict, true, "the screen showed version 1");
    assert.equal((await updateDocument(c.ctx, 1, { kind: "invoice" }, 2)).error, DOC_MESSAGES.badKind);
    assert.equal((await updateDocument(c.ctx, 99, { title: "x" }, 1)).error, DOC_MESSAGES.unknown);
    assert.ok(c.logged.some(([a, m]) => a === "document.update" && m.detail.fields.includes("title")));
    // publish: direct
    const pub = await setDocumentPublished(c.ctx, 1, true, 2);
    assert.equal(pub.ok, true); assert.equal(row().is_published, true);
    assert.ok(c.logged.some(([a]) => a === "document.publish")); assert.ok(c.filed.includes("revalidate"), "the public pages are refreshed");
    // hide: needs only documents.edit, and never filed
    const hideCtx = ctxFor(db, house, { allow: ["documents.edit"], approval: ["documents.publish"] });
    assert.equal((await setDocumentPublished(hideCtx.ctx, 1, false, 3)).ok, true);
    assert.equal(row().is_published, false);
    // publish needing approval: filed, the live row unchanged
    const appr = ctxFor(db, house, { approval: ["documents.publish"] });
    const filed = await setDocumentPublished(appr.ctx, 1, true, 4);
    assert.deepEqual([filed.ok, filed.pending], [true, true]);
    assert.equal(row().is_published, false, "nothing changed yet");
    const spec = appr.filed[0];
    assert.deepEqual([spec.operation, spec.entity, spec.entityId, spec.proposed, spec.before, spec.baseUpdatedAt], ["documents.publish", T, 1, { is_published: true }, { is_published: false }, row().updated_at]);
    // without the right to publish: refused, even if the right to edit exists
    assert.deepEqual(await setDocumentPublished(ctxFor(db, house, { allow: ["documents.edit"] }).ctx, 1, true, 4), { ok: false, denied: true, error: "no" });
    assert.equal((await setDocumentPublished(c.ctx, 1, true, 1)).conflict, true);
  });

  test(`${house}: delete needs documents.delete, removes the row AND the file together, or is filed for approval; a changed document is a conflict`, async () => {
    const db = world(house), c = ctxFor(db, house);
    await add(c);
    const path1 = db.tables[T][0].file_path;
    assert.deepEqual(await deleteDocument(ctxFor(db, house, { allow: ["documents.edit"] }).ctx, 1, 1), { ok: false, denied: true, error: "no" });
    assert.equal(db.tables[T].length, 1);
    assert.equal((await deleteDocument(c.ctx, 1, 7)).conflict, true);
    const ap = ctxFor(db, house, { approval: ["documents.delete"] });
    const filed = await deleteDocument(ap.ctx, 1, 1);
    assert.deepEqual([filed.ok, filed.pending, ap.filed[0].operation, ap.filed[0].baseUpdatedAt], [true, true, "documents.delete", db.tables[T][0].updated_at]);
    assert.equal(db.tables[T].length, 1, "an approval request deletes nothing");
    const r = await deleteDocument(c.ctx, 1, 1);
    assert.equal(r.ok, true);
    assert.equal(db.tables[T].length, 0); assert.deepEqual(db.removed, [`${BUCKET}/${path1}`]);
    assert.deepEqual(c.logged.map(([a]) => a).filter((a) => a.startsWith("document.delete")), ["document.delete_attempt", "document.delete"]);
    assert.equal((await deleteDocument(c.ctx, 1, 1)).error, DOC_MESSAGES.unknown);
  });

  test(`${house}: the approval executors apply a request only to the version it was filed against; the file goes with the row`, async () => {
    const db = world(house), c = ctxFor(db, house);
    await add(c);
    const ex = makeDocumentExecutors({ panel: house });
    const base = db.tables[T][0].updated_at;
    const req = (op) => ({ id: "r", operation: op, entity_id: 1, base_updated_at: base });
    assert.deepEqual(await ex["documents.publish"]({ admin: db, request: { ...req("documents.publish"), base_updated_at: null } }), { ok: false, error: "stale" });
    await updateDocument(c.ctx, 1, { title: "Changed meanwhile" }, 1);
    assert.deepEqual(await ex["documents.publish"]({ admin: db, request: req("documents.publish") }), { ok: false, error: "stale" }, "the document changed after the request was filed");
    assert.equal(db.tables[T][0].is_published, false);
    const fresh = { ...req("documents.publish"), base_updated_at: db.tables[T][0].updated_at };
    assert.deepEqual(await ex["documents.publish"]({ admin: db, request: fresh }), { ok: true });
    assert.equal(db.tables[T][0].is_published, true);
    assert.deepEqual(await ex["documents.publish"]({ admin: db, request: { ...req("documents.publish"), entity_id: 55 } }), { ok: false, error: "notFound" });
    assert.deepEqual(await ex["documents.delete"]({ admin: db, request: req("documents.delete") }), { ok: false, error: "stale" });
    assert.deepEqual(await ex["documents.delete"]({ admin: db, request: { ...req("documents.delete"), base_updated_at: db.tables[T][0].updated_at } }), { ok: true });
    assert.equal(db.tables[T].length, 0); assert.equal(db.removed.length, 1);
    assert.deepEqual(await ex["documents.delete"]({ admin: db, request: { ...req("documents.delete"), base_updated_at: base } }), { ok: false, error: "notFound" });
  });
}

// ── rights and house separation ──────────────────────────────────────────────────────────────────────────────────────────
test("the operations: creating needs documents.create; publishing and deleting can be approved; who may decide; Beauty never touches Health's table", () => {
  assert.equal(OPERATIONS["documents.create"], "documents.create");
  assert.equal(isApprovable("documents.publish"), true); assert.equal(isApprovable("documents.delete"), true); assert.equal(isApprovable("documents.edit"), false);
  const u = (role, houses = ["health"], approval = {}) => ({ id: "x", status: "active", role, houses, allow: [], deny: [], approval });
  assert.equal(decide(u("house_admin"), "health", "documents.publish").mode, "direct");
  assert.equal(decide(u("product_manager"), "health", "documents.publish").mode, "approval", "a product manager may publish, after approval (like products)");
  assert.equal(decide(u("product_manager"), "health", "documents.delete").mode, "approval");
  assert.equal(decide(u("product_manager"), "health", "documents.create").mode, "direct");
  assert.equal(decide(u("viewer"), "health", "documents.create").mode, "denied");
  assert.equal(decide(u("house_admin", ["beauty"]), "health", "documents.create").mode, "denied");
  assert.equal(canReview(u("house_admin"), "someone", "health", "documents"), true);
  assert.equal(canReview(u("product_manager"), "someone", "health", "documents"), false, "a product manager cannot approve documents");
  for (const [f, house] of [["lib/operator/documentActions.js", "health"], ["lib/beauty/operator/documentActions.js", "beauty"]]) {
    const src = read(f);
    assert.ok(src.includes(`warehouseCtx("${house}"`), f);
    assert.ok(src.includes(house === "health" ? "@/lib/operator/auth" : "@/lib/beauty/operator/auth"), `${f}: this house's own session`);
    for (const fn of ["addProductDocument", "updateProductDocument", "setProductDocumentPublished", "deleteProductDocument"]) assert.match(src, new RegExp(`export async function ${fn}\\(`));
  }
  assert.ok(!/documentActions/.test(read("components/beauty/operator/ProductForm.jsx")));
  const core = read("lib/operator/documentsCore.js");
  assert.match(core, /DOC_TABLES\[ctx\.panel\]/); assert.ok(!/from\("product_documents"\)|from\("beauty_product_documents"\)/.test(core), "the table always comes from the house in the context");
  assert.match(read("lib/operator/approvalActions.js"), /makeDocumentExecutors\(\{ panel: "health" \}\)/);
  assert.match(read("lib/beauty/operator/approvalActions.js"), /makeDocumentExecutors\(\{ panel: "beauty" \}\)/);
});

// ── the public page ──────────────────────────────────────────────────────────────────────────────────────────────────────
test("the public list: titles, kinds and details in the visitor's language; links go to the house's bucket; unknown rows are dropped", () => {
  const rows = [
    { id: 1, kind: "certificate", title: "ISO certificate", lang: "en", valid_until: "2030-05-01", file_path: "documents/a.pdf", file_size: 2_621_440 },
    { id: 2, kind: "brochure", title: "Брошюра", lang: null, valid_until: null, file_path: "documents/b.pdf", file_size: 900 },
    { id: 3, kind: "weird", title: "Odd", file_path: "documents/c.pdf", file_size: 0 },
    { id: 4, kind: "manual", title: "", file_path: "documents/d.pdf" }, { id: 5, kind: "manual", title: "No file" }, null,
  ];
  const urlOf = (p) => `https://cdn/x/${p}`;
  const en = publicDocumentItems(rows, "en", urlOf);
  assert.deepEqual(en.map((d) => [d.id, d.href, d.kindLabel, d.meta]), [[1, "https://cdn/x/documents/a.pdf", "Certificate", "English · valid until 2030-05-01 · 2.5 MB"], [2, "https://cdn/x/documents/b.pdf", "Brochure", "1 KB"], [3, "https://cdn/x/documents/c.pdf", "Document", ""]]);
  assert.equal(publicDocumentItems(rows, "tg", urlOf)[0].kindLabel, "Шаҳодатнома");
  assert.equal(publicDocumentItems(rows, "fa", urlOf)[0].meta.startsWith("انگلیسی · اعتبار تا"), true);
  assert.equal(publicDocumentItems(rows, "xx", urlOf)[0].kindLabel, "Certificate", "an unknown language falls back to English");
  assert.deepEqual(publicDocumentItems(null, "en", urlOf), []);
  for (const l of ["tg", "ru", "en", "fa"]) { assert.deepEqual(Object.keys(DOC_COPY[l].kinds).sort(), [...DOC_KINDS].sort()); assert.deepEqual(Object.keys(DOC_COPY[l].langs).sort(), ["en", "fa", "ru", "tg"]); assert.ok(docCopy(l).heading); }
});

test("both public product pages ask the database function only (never the table), show the list, and stay safe before migration 48", () => {
  assert.match(read("lib/supabase.js"), /rpc\("public_product_documents", \{ p_product: id \}, \{ get: true \}\)/);
  assert.match(read("lib/beauty/catalog.js"), /rpc\("public_beauty_product_documents", \{ p_product: id \}, \{ get: true \}\)/);
  for (const f of ["lib/supabase.js", "lib/beauty/catalog.js", "lib/productDocuments.js", "components/product/ProductDocuments.jsx"]) assert.ok(!/from\("(beauty_)?product_documents"\)/.test(read(f)), `${f} must not read the private table`);
  assert.match(read("app/health/[lang]/catalog/[slug]/page.jsx"), /publicDocumentItems\(await getProductDocuments\(product\.id\), lang, imageUrl\)/);
  assert.match(read("app/beauty/[lang]/catalog/[slug]/page.jsx"), /publicDocumentItems\(docRows, lang, beautyImageUrl\)/);
  assert.match(read("app/health/[lang]/catalog/[slug]/ProductDetailClient.jsx"), /<ProductDocuments items=\{documents\} lang=\{lang\} \/>/);
  assert.match(read("components/beauty/BeautyProductView.jsx"), /<ProductDocuments items=\{documents\} lang=\{lang\} \/>/);
  assert.match(read("lib/supabase.js"), /error\.code !== "PGRST202" && error\.code !== "42883"/, "a missing function (migration not applied) is silent");
  // the private preview of a draft passes no documents: an unsaved page has none to show
  assert.ok(!/documents/.test(read("app/beauty/[lang]/preview/[id]/page.jsx")));
  // links open in a new tab without handing the page to the document
  assert.match(read("components/product/ProductDocuments.jsx"), /target="_blank" rel="noopener noreferrer"/);
});

test("deleting a product that still has documents says why (the database holds it); the screens are on both edit pages with the house's own actions", () => {
  assert.match(read("lib/operator/productDelete.js"), /PRODUCT_DELETE_MESSAGES\.hasDocuments/);
  assert.match(read("lib/operator/productDelete.js"), /table === "beauty_products" \? "beauty_product_documents" : "product_documents"/);
  for (const [f, house, acts] of [["app/operator/(panel)/products/[id]/edit/page.jsx", "health", "@/lib/operator/documentActions"], ["app/beauty/operator/(panel)/products/[id]/edit/page.jsx", "beauty", "@/lib/beauty/operator/documentActions"]]) {
    const src = read(f);
    assert.ok(src.includes(`from "${acts}"`), f);
    assert.match(src, new RegExp(`<DocumentsManager house="${house}"`)); assert.match(src, new RegExp(`listDocuments\\(getAdminClient\\(\\), "${house}"`));
  }
  assert.match(read("components/operator/DocumentsManager.jsx"), /data-testid="documents-unavailable"/);
});
