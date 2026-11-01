// N7 — category/brand images: the focal-point validator, its parity with migration 47's CHECK, and the media library now covering
// the Health category-image folder (upload path product-images/categories/*) so an in-use Health category image is never removed.
import test from "node:test";
import assert from "node:assert/strict";
import { focusPoint } from "../lib/operator/validation.js";
import { MEDIA_SOURCES, isAllowedFile, usageMap, deleteMedia } from "../lib/operator/mediaLibrary.js";
import { createMemoryAdmin } from "./helpers/memoryAdmin.mjs";

// The exact shape migration 47's CHECK enforces (keep in lock-step with the SQL).
const DB_CHECK = /^(0|[1-9][0-9]?|100)% (0|[1-9][0-9]?|100)%$/;

test("focusPoint normalises to an integer 'NN% MM%' and clamps to 0–100", () => {
  assert.equal(focusPoint("50% 50%"), "50% 50%");
  assert.equal(focusPoint("0% 0%"), "0% 0%");
  assert.equal(focusPoint("100% 100%"), "100% 100%");
  assert.equal(focusPoint("25% 75%"), "25% 75%");
  // loose / alternative forms
  assert.equal(focusPoint("25%,75%"), "25% 75%");
  assert.equal(focusPoint("25 75"), "25% 75%");
  assert.equal(focusPoint("33.6% 80.2%"), "34% 80%", "rounded to integers");
  assert.equal(focusPoint({ x: 10, y: 90 }), "10% 90%");
  assert.equal(focusPoint({ x: 200, y: -5 }), "100% 0%", "clamped");
  assert.equal(focusPoint("150% 50%"), "100% 50%", "an out-of-range first axis is clamped");
});

test("focusPoint rejects unusable input → null (the centre)", () => {
  for (const bad of [null, undefined, "", "center", "50%", "abc", {}, { x: 1 }, [], "nope nope"]) {
    assert.equal(focusPoint(bad), null, JSON.stringify(bad));
  }
});

test("every focusPoint output satisfies migration 47's CHECK (no validator/DB drift)", () => {
  const samples = ["50% 50%", "0 0", "100 100", "7% 93%", { x: 12.9, y: 0.4 }, "33.6 80.2", "250 -3", "1% 1%"];
  for (const s of samples) {
    const v = focusPoint(s);
    if (v == null) continue;
    assert.match(v, DB_CHECK, `"${v}" must match the DB CHECK`);
  }
  // and a value the validator would never emit is correctly rejected by the same regex
  for (const bad of ["50%50%", "050% 50%", "50% 50", "150% 0%", "50%  50%", "1.5% 2%"]) {
    assert.doesNotMatch(bad, DB_CHECK, bad);
  }
});

test("the Health media library now owns a categories/ folder (for uploaded category images)", () => {
  const health = MEDIA_SOURCES.health;
  const bucket = health.buckets.find((b) => b.bucket === "product-images");
  assert.ok(bucket.folders.includes("categories"), "product-images/categories is a Health folder");
  assert.ok(bucket.folders.includes("products"), "products stays");
  assert.ok(health.usage.some((u) => u.table === "categories" && u.cols.includes("image_url")), "categories.image_url is a tracked usage");
  // the folder allow-list (upload target + safe-delete guard) accepts it, still no traversal / foreign folder
  assert.equal(isAllowedFile("health", "product-images", "categories/cat-1.webp"), true);
  assert.equal(isAllowedFile("health", "product-images", "categories/../products/x"), false);
  assert.equal(isAllowedFile("health", "product-images", "logos/x.png"), false);
});

function storageFor(files) {
  const removed = [];
  return {
    removed,
    storage: {
      from: (bucket) => ({
        list: async (folder, opts) => ({ data: files.filter((f) => f.bucket === bucket && f.path.startsWith(`${folder}/`)).map((f) => ({ name: f.path.slice(folder.length + 1), id: `id-${f.path}`, created_at: f.at, metadata: { size: 1000 } })).slice(0, opts.limit), error: null }),
        getPublicUrl: (path) => ({ data: { publicUrl: `https://cdn/${bucket}/${path}` } }),
        remove: async (paths) => { removed.push(...paths.map((p) => `${bucket}/${p}`)); return { data: paths.map((p) => ({ name: p })), error: null }; },
      }),
    },
  };
}

test("a Health category image in use is listed as used and never removed; an orphan can go", async () => {
  const USED = "categories/used.webp";
  const ORPHAN = "categories/orphan.webp";
  const files = [{ bucket: "product-images", path: USED, at: "2026-11-01T00:00:00Z" }, { bucket: "product-images", path: ORPHAN, at: "2026-11-01T00:00:00Z" }];
  const db = createMemoryAdmin({
    products: [{ id: 1, sku: "G-1", image_url: null, gallery_urls: [] }],
    categories: [{ id: 5, slug: "gloves", name_en: "Gloves", name_fa: "دستکش", image_url: USED }],
  });
  const s = storageFor(files);
  db.storage = s.storage; db.removed = s.removed;

  const used = await usageMap(db, "health");
  assert.equal(used.ok, true);
  assert.deepEqual(used.map.get(`product-images/${USED}`), [{ kind: "category", id: 5, label: "gloves" }]);

  const refused = await deleteMedia(db, "health", { bucket: "product-images", path: USED });
  assert.equal(refused.ok, false);
  assert.equal(refused.inUse, true);
  assert.deepEqual(db.removed, [], "a category image still in use stayed");

  assert.equal((await deleteMedia(db, "health", { bucket: "product-images", path: ORPHAN })).ok, true, "an orphan category image can be removed");
  assert.deepEqual(db.removed, [`product-images/${ORPHAN}`]);
});
