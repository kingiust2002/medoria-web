// The image library (lib/operator/mediaLibrary.js): lists this house's buckets only, shows where each file is used, removes only
// files nothing uses (checked again at the moment of removal), refuses anything outside the house's folders, and the approval
// executor does the same checks when a "needs approval" removal is approved.
import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryAdmin } from "./helpers/memoryAdmin.mjs";
import { listMedia, deleteMedia, isAllowedFile, pathOfRef, usageMap, makeMediaExecutors, MEDIA_MESSAGES } from "../lib/operator/mediaLibrary.js";

function setup(files, seed = {}) {
  const db = createMemoryAdmin({
    products: [{ id: 1, sku: "G-1", image_url: "products/a.webp", gallery_urls: ["products/b.webp", "https://x.supabase.co/storage/v1/object/public/product-images/products/c.webp?v=2"] }, { id: 2, sku: "G-2", image_url: null, gallery_urls: [] }],
    categories: [{ id: 5, slug: "gloves", image_url: null }],
    ...seed,
  });
  const removed = [];
  db.storage = {
    from: (bucket) => ({
      list: async (folder, opts) => ({ data: files.filter((f) => f.bucket === bucket && f.path.startsWith(`${folder}/`)).map((f) => ({ name: f.path.slice(folder.length + 1), id: f.id ?? `id-${f.path}`, created_at: f.at, metadata: { size: f.size ?? 1000 } })).slice(0, opts.limit), error: null }),
      getPublicUrl: (path) => ({ data: { publicUrl: `https://cdn/${bucket}/${path}` } }),
      remove: async (paths) => { removed.push(...paths.map((p) => `${bucket}/${p}`)); const gone = files.filter((f) => f.bucket === bucket && paths.includes(f.path)); return { data: gone.map((g) => ({ name: g.path })), error: null }; },
    }),
  };
  db.removed = removed;
  return db;
}
const FILES = [
  { bucket: "product-images", path: "products/a.webp", at: "2026-10-03T00:00:00Z" },
  { bucket: "product-images", path: "products/b.webp", at: "2026-10-02T00:00:00Z" },
  { bucket: "product-images", path: "products/c.webp", at: "2026-10-01T00:00:00Z" },
  { bucket: "product-images", path: "products/unused.webp", at: "2026-10-04T00:00:00Z" },
];

test("pathOfRef / isAllowedFile: paths and public URLs normalise; only the house's folders, no traversal", () => {
  assert.equal(pathOfRef("products/a.webp", "product-images"), "products/a.webp");
  assert.equal(pathOfRef("https://x/storage/v1/object/public/product-images/products/c%20d.webp?v=2", "product-images"), "products/c d.webp");
  assert.equal(pathOfRef("https://elsewhere.com/pic.jpg", "product-images"), null, "a foreign URL is not a stored file");
  assert.equal(pathOfRef(null, "product-images"), null);
  assert.equal(isAllowedFile("health", "product-images", "products/a.webp"), true);
  assert.equal(isAllowedFile("health", "beauty-product-images", "products/a.webp"), false, "another house's bucket");
  assert.equal(isAllowedFile("beauty", "beauty-product-images", "categories/x.png"), true);
  assert.equal(isAllowedFile("beauty", "beauty-brand-logos", "logos/x.png"), true);
  assert.equal(isAllowedFile("health", "product-images", "categories/x.png"), true, "Health category pictures (N7)");
  assert.equal(isAllowedFile("health", "product-images", "logos/x.png"), false, "a folder Health does not use");
  for (const bad of ["products/../secrets", "../products/a", "products/a/b.webp", "products/", "products", "", null, "products\\a.webp"]) assert.equal(isAllowedFile("health", "product-images", bad), false, String(bad));
});

test("the library lists the house's files with where each is used, newest first", async () => {
  const db = setup(FILES);
  const r = await listMedia(db, "health");
  assert.equal(r.ok, true);
  assert.deepEqual(r.items.map((i) => i.name), ["unused.webp", "a.webp", "b.webp", "c.webp"]);
  const by = Object.fromEntries(r.items.map((i) => [i.name, i.usedBy]));
  assert.deepEqual(by["unused.webp"], []);
  assert.deepEqual(by["a.webp"], [{ kind: "product", id: 1, label: "G-1" }]);
  assert.equal(by["c.webp"].length, 1, "a public URL with a query string still counts as used");
  assert.equal(r.items[0].url, "https://cdn/product-images/products/unused.webp");
  db.fail = (table) => (table === "products" ? { code: "XX000", message: "boom" } : null);
  assert.equal((await listMedia(db, "health")).error, MEDIA_MESSAGES.unavailable, "a failing usage read is not 'everything is unused'");
});

test("usage fails CLOSED: any unreadable table, unknown column, thrown error or unreadable proposal list means 'cannot say', and nothing is removed", async () => {
  for (const code of ["42P01", "42703", "PGRST204", "PGRST205", "57014"]) {
    const db = setup(FILES); db.fail = (table) => (table === "categories" ? { code, message: "x" } : null);
    assert.equal((await usageMap(db, "health")).ok, false, `error ${code} on categories must not be read as 'unused'`);
    assert.equal((await listMedia(db, "health")).error, MEDIA_MESSAGES.unavailable);
    assert.equal((await deleteMedia(db, "health", { bucket: "product-images", path: "products/unused.webp" })).error, MEDIA_MESSAGES.unavailable);
    assert.deepEqual(db.removed, []);
  }
  const throwing = setup(FILES); throwing.from = () => { throw new Error("boom"); };
  assert.equal((await usageMap(throwing, "health")).ok, false);
  // the list of pending proposals unreadable (not merely absent) → cannot say; absent (migration 35 not applied) → there can be none
  const bad = setup(FILES, { operator_change_requests: [] }); bad.fail = (table) => (table === "operator_change_requests" ? { code: "57014", message: "timeout" } : null);
  assert.equal((await usageMap(bad, "health")).ok, false);
  assert.equal((await usageMap(setup(FILES), "health")).ok, true, "no operator_change_requests table at all");
});

test("R6: a Beauty brand logo in use is never removed — the real schema has `name` (not name_en / name_fa) and a wrong column fails closed", async () => {
  const LOGO = "logos/official.png";
  const files = [{ bucket: "beauty-brand-logos", path: LOGO, at: "2026-10-01T00:00:00Z" }, { bucket: "beauty-brand-logos", path: "logos/orphan.png", at: "2026-10-01T00:00:00Z" }];
  const schema = { beauty_products: ["id", "sku", "name_en", "name_fa", "image_url", "gallery_urls"], beauty_categories: ["id", "slug", "name_en", "name_fa", "image_url"], beauty_brands: ["id", "slug", "name", "logo_url"], operator_change_requests: ["id", "house", "status", "entity", "subject", "proposed"] };
  const seed = { beauty_products: [], beauty_categories: [], beauty_brands: [{ id: 9, slug: "official", name: "Official Brand", logo_url: `https://x.supabase.co/storage/v1/object/public/beauty-brand-logos/${LOGO}` }], operator_change_requests: [] };
  const mk = () => { const d = setup(files, seed); const g = createMemoryAdmin(seed, { schema }); g.storage = d.storage; g.removed = d.removed; return g; };
  const db = mk();
  const used = await usageMap(db, "beauty");
  assert.equal(used.ok, true);
  assert.deepEqual(used.map.get(`beauty-brand-logos/${LOGO}`), [{ kind: "brand", id: 9, label: "official" }]);
  const refused = await deleteMedia(db, "beauty", { bucket: "beauty-brand-logos", path: LOGO });
  assert.equal(refused.ok, false); assert.equal(refused.inUse, true);
  assert.deepEqual(db.removed, [], "the logo in use stayed");
  assert.equal((await deleteMedia(db, "beauty", { bucket: "beauty-brand-logos", path: "logos/orphan.png" })).ok, true, "a real orphan can go");
  // the old bug: asking beauty_brands for name_en must fail (and so fail closed), not be skipped
  const wrong = createMemoryAdmin(seed, { schema });
  assert.equal((await wrong.from("beauty_brands").select("id,logo_url,slug,name_en,name_fa")).error.code, "42703");
});

test("usage covers EVERY row, not the first page the API returns", async () => {
  const many = Array.from({ length: 2500 }, (_, i) => ({ id: i + 1, sku: `S-${i}`, image_url: i === 2300 ? "products/deep.webp" : null, gallery_urls: [] }));
  const db = setup([{ bucket: "product-images", path: "products/deep.webp", at: "x" }, { bucket: "product-images", path: "products/orphan.webp", at: "x" }], { products: many });
  const used = await usageMap(db, "health");
  assert.equal(used.ok, true);
  assert.deepEqual(used.map.get("product-images/products/deep.webp").map((u) => u.id), [2301], "a reference past the first 1000 rows is found");
  assert.equal((await deleteMedia(db, "health", { bucket: "product-images", path: "products/deep.webp" })).inUse, true);
  assert.deepEqual(db.removed, []);
});

test("a PENDING change request that would reference a file keeps it; decided ones and other houses' do not", async () => {
  const requests = [
    { id: "r1", house: "health", status: "pending", entity: "products", subject: "G-9", proposed: { image_url: "products/queued.webp", price: 5, __ops: ["products.content"] } },
    { id: "r2", house: "health", status: "approved", entity: "products", subject: "G-8", proposed: { image_url: "products/decided.webp" } },
    { id: "r3", house: "beauty", status: "pending", entity: "beauty_products", subject: "B-1", proposed: { image_url: "products/other-house.webp" } },
    { id: "r4", house: "health", status: "pending", entity: "stock", subject: "x", proposed: { _bucket: "product-images", _path: "products/being-deleted.webp" } },
  ];
  const files = ["queued", "decided", "other-house", "being-deleted"].map((n) => ({ bucket: "product-images", path: `products/${n}.webp`, at: "x" }));
  const db = setup(files, { operator_change_requests: requests });
  const q = await deleteMedia(db, "health", { bucket: "product-images", path: "products/queued.webp" });
  assert.equal(q.inUse, true); assert.equal(q.usedBy[0].kind, "request");
  for (const n of ["decided", "other-house", "being-deleted"]) assert.equal((await deleteMedia(db, "health", { bucket: "product-images", path: `products/${n}.webp` })).ok, true, n);
});

test("removal: only an unused file; the usage is read again; foreign paths refused; a vanished file is reported", async () => {
  const db = setup(FILES);
  assert.deepEqual(await deleteMedia(db, "health", { bucket: "product-images", path: "products/unused.webp" }), { ok: true });
  assert.deepEqual(db.removed, ["product-images/products/unused.webp"]);
  const used = await deleteMedia(db, "health", { bucket: "product-images", path: "products/a.webp" });
  assert.equal(used.ok, false); assert.equal(used.inUse, true); assert.equal(used.usedBy[0].id, 1);
  assert.equal(db.removed.length, 1, "a used file is never removed");
  assert.equal((await deleteMedia(db, "health", { bucket: "beauty-product-images", path: "products/x.webp" })).error, MEDIA_MESSAGES.badFile);
  assert.equal((await deleteMedia(db, "health", { bucket: "product-images", path: "products/../x" })).error, MEDIA_MESSAGES.badFile);
  assert.equal((await deleteMedia(db, "health", { bucket: "product-images", path: "products/never-existed.webp" })).error, MEDIA_MESSAGES.gone);
  // used right now by a row changed after the screen was loaded
  db.tables.products[1].image_url = "products/unused2.webp";
  assert.equal((await deleteMedia(setup([{ bucket: "product-images", path: "products/unused2.webp", at: "x" }], { products: db.tables.products }), "health", { bucket: "product-images", path: "products/unused2.webp" })).inUse, true);
});

test("Beauty: its buckets (products, categories, brand logos) and its own tables", async () => {
  const db = setup([
    { bucket: "beauty-product-images", path: "products/p.webp", at: "2026-10-01T00:00:00Z" },
    { bucket: "beauty-product-images", path: "categories/c.webp", at: "2026-10-02T00:00:00Z" },
    { bucket: "beauty-brand-logos", path: "logos/l.png", at: "2026-10-03T00:00:00Z" },
    { bucket: "product-images", path: "products/health-only.webp", at: "2026-10-04T00:00:00Z" },
  ], { beauty_products: [{ id: 1, sku: "B-1", image_url: "products/p.webp", gallery_urls: [] }], beauty_categories: [{ id: 2, slug: "serums", image_url: "categories/c.webp" }], beauty_brands: [{ id: 3, slug: "acme", logo_url: "logos/l.png" }] });
  const r = await listMedia(db, "beauty");
  assert.deepEqual(r.items.map((i) => i.path).sort(), ["categories/c.webp", "logos/l.png", "products/p.webp"], "the Health bucket is not listed");
  assert.deepEqual(r.items.map((i) => i.usedBy.map((u) => u.kind)[0]).sort(), ["brand", "category", "product"]);
});

test("the approval executor removes the file only if it is still unused", async () => {
  const db = setup(FILES);
  const ex = makeMediaExecutors({ panel: "health" })["media.delete"];
  assert.equal((await ex({ admin: db, request: { proposed: { _bucket: "product-images", _path: "products/unused.webp" } } })).ok, true);
  assert.equal((await ex({ admin: db, request: { proposed: { _bucket: "product-images", _path: "products/a.webp" } } })).error, "stale");
  assert.equal((await ex({ admin: db, request: { proposed: { _bucket: "product-images", _path: "products/zzz.webp" } } })).error, "notFound");
  assert.equal((await ex({ admin: db, request: { proposed: { _bucket: "x", _path: "y" } } })).error, "failed");
});
