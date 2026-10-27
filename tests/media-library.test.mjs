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
  assert.equal(isAllowedFile("health", "product-images", "categories/x.png"), false, "a folder Health does not use");
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

test("a table or column the house does not have is skipped, a real failure is not", async () => {
  const db = setup(FILES); db.fail = (table) => (table === "categories" ? { code: "42P01", message: "x" } : null);
  assert.equal((await usageMap(db, "health")).ok, true);
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
