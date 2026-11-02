// Media safety and category pictures (N7). Uses the REAL image library (sharp) on tiny generated pictures: what is uploaded is checked by its bytes,
// stripped of hidden metadata (GPS, camera), orientation-fixed, size-capped and re-encoded; the focus point is cleaned and stored only when the column
// exists; a picture that is a category's stays "used" in the media library (also with a focus point); every upload action goes through the one safe path.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { createMemoryAdmin } from "./helpers/memoryAdmin.mjs";
import { prepareImageUpload, IMAGE_LIMITS, IMAGE_MESSAGES } from "../lib/operator/imageSafety.js";
import { storeImage } from "../lib/operator/imageUpload.js";
import { cleanFocus, rowFocus, focusStyle, FOCUS_CENTER } from "../lib/imageFocus.js";
import { focusReady, withFocus, resetFocusScope } from "../lib/operator/focusScope.js";
import { usageMap, deleteMedia, MEDIA_MESSAGES } from "../lib/operator/mediaLibrary.js";
import { cropRect } from "../lib/imageCrop.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const asFile = (buf, type, name = "x.jpg") => ({ name, type, size: buf.length, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length) });
const solid = (w, h, c = { r: 200, g: 30, b: 30 }, ch = 3) => sharp({ create: { width: w, height: h, channels: ch, background: ch === 4 ? { ...c, alpha: 0.5 } : c } });

// ── what is uploaded is checked by its bytes ────────────────────────────────────────────────────────────────────────────
test("a photo leaves WITHOUT its hidden metadata (position, camera, comments) and with the orientation applied", async () => {
  const withExif = await solid(40, 20).withMetadata({ orientation: 6 }).withExif({ IFD0: { Copyright: "secret-owner", Make: "PhoneCo" }, GPS: { GPSLatitudeRef: "N", GPSLatitude: "38/1 33/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "68/1 47/1 0/1" } }).jpeg().toBuffer();
  const before = await sharp(withExif).metadata();
  assert.ok(before.exif, "the test picture carries EXIF");
  assert.ok(withExif.includes(Buffer.from("secret-owner")) && withExif.includes(Buffer.from("PhoneCo")));
  const r = await prepareImageUpload(asFile(withExif, "image/jpeg"));
  assert.equal(r.ok, true);
  assert.equal(r.contentType, "image/jpeg");
  const after = await sharp(r.buffer).metadata();
  assert.equal(after.exif, undefined, "no EXIF at all after the upload");
  assert.ok(!r.buffer.includes(Buffer.from("secret-owner")) && !r.buffer.includes(Buffer.from("PhoneCo")) && !r.buffer.includes(Buffer.from("GPS")));
  assert.deepEqual([r.width, r.height], [20, 40], "orientation 6 (rotated 90°) was applied, then dropped");
});

test("PNG keeps its transparency, WEBP and AVIF are re-encoded in their own format, the stored type is the REAL type", async () => {
  const png = await solid(30, 30, { r: 10, g: 200, b: 10 }, 4).png().toBuffer();
  const rp = await prepareImageUpload(asFile(png, "image/png", "a.png"));
  assert.deepEqual([rp.ok, rp.contentType], [true, "image/png"]);
  assert.equal((await sharp(rp.buffer).metadata()).hasAlpha, true);
  const webp = await solid(30, 30).webp().toBuffer();
  assert.equal((await prepareImageUpload(asFile(webp, "image/webp", "a.webp"))).contentType, "image/webp");
  const avif = await solid(32, 32).avif().toBuffer();
  assert.equal((await prepareImageUpload(asFile(avif, "image/avif", "a.avif"))).contentType, "image/avif");
  // the client says JPEG, the bytes say PNG: the bytes win
  assert.equal((await prepareImageUpload(asFile(png, "image/jpeg", "liar.jpg"))).contentType, "image/png");
});

test("what is refused: not an image, a disguised file, a wrong type, too heavy, too wide, too many pixels, animated, no image library", async () => {
  const html = Buffer.from("<html><script>alert(1)</script></html>".padEnd(64, " "));
  assert.equal((await prepareImageUpload(asFile(html, "image/png"))).error, IMAGE_MESSAGES.notImage, "HTML dressed as a PNG");
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
  assert.equal((await prepareImageUpload(asFile(svg, "image/svg+xml", "a.svg"))).error, IMAGE_MESSAGES.type, "SVG is never accepted");
  assert.equal((await prepareImageUpload(asFile(Buffer.from("GIF89a" + "0".repeat(30)), "image/gif", "a.gif"))).error, IMAGE_MESSAGES.type);
  const truncated = (await solid(40, 40).png().toBuffer()).subarray(0, 50);
  assert.equal((await prepareImageUpload(asFile(truncated, "image/png"))).error, IMAGE_MESSAGES.notImage, "a damaged file");
  const header = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("not really a png at all, just a header".padEnd(60, "x"))]);
  assert.equal((await prepareImageUpload(asFile(header, "image/png"))).error, IMAGE_MESSAGES.notImage, "the right first bytes are not enough");
  const ok = await solid(100, 80).jpeg().toBuffer();
  assert.equal((await prepareImageUpload({ ...asFile(ok, "image/jpeg"), size: IMAGE_LIMITS.maxBytes + 1 })).error, IMAGE_MESSAGES.tooBig);
  assert.equal((await prepareImageUpload(asFile(ok, "image/jpeg"), { limits: { ...IMAGE_LIMITS, maxSide: 90 } })).error, IMAGE_MESSAGES.dimensions, "a side over the limit");
  assert.equal((await prepareImageUpload(asFile(ok, "image/jpeg"), { limits: { ...IMAGE_LIMITS, maxPixels: 5000 } })).error, IMAGE_MESSAGES.dimensions, "a decompression bomb is refused before it is decoded");
  assert.equal((await prepareImageUpload(asFile(ok, "image/jpeg"), { sharp: null })).error, IMAGE_MESSAGES.unavailable, "no image library → nothing is uploaded");
  assert.equal((await prepareImageUpload(null)).error, IMAGE_MESSAGES.none);
  assert.equal((await prepareImageUpload("a string")).error, IMAGE_MESSAGES.none);
  // an animated picture (two frames) is refused
  const frames = await Promise.all([solid(20, 20), solid(20, 20, { r: 0, g: 0, b: 200 })].map((s) => s.png().toBuffer()));
  const animated = await sharp(frames, { join: { animated: true } }).webp({ loop: 0 }).toBuffer().catch(() => null);
  if (animated) assert.equal((await prepareImageUpload(asFile(animated, "image/webp"))).error, IMAGE_MESSAGES.animated);
});

test("a very large picture is scaled down; the result still fits the size limit", async () => {
  const big = await solid(600, 400).jpeg().toBuffer();
  const r = await prepareImageUpload(asFile(big, "image/jpeg"), { limits: { ...IMAGE_LIMITS, maxOut: 300 } });
  assert.deepEqual([r.ok, r.resized, r.width, r.height], [true, true, 300, 200]);
  const tight = await prepareImageUpload(asFile(big, "image/jpeg"), { limits: { ...IMAGE_LIMITS, maxBytes: 900 } });
  assert.equal(tight.ok, false);
});

// ── storing ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
function storageAdmin({ fail = null } = {}) {
  const uploads = [];
  return {
    uploads,
    storage: { from: (bucket) => ({
      upload: async (p, body, opts) => { if (fail) return { error: fail }; uploads.push({ bucket, p, body, opts }); return { error: null }; },
      getPublicUrl: (p) => ({ data: { publicUrl: `https://cdn/${bucket}/${p}` } }),
    }) },
  };
}

test("storeImage uploads the CLEANED bytes (never the original file) with the real type; refusals upload nothing", async () => {
  const adm = storageAdmin();
  const withExif = await solid(40, 20).withExif({ IFD0: { Copyright: "secret-owner" } }).jpeg().toBuffer();
  const r = await storeImage(adm, { bucket: "product-images", folder: "categories", file: asFile(withExif, "image/jpeg", "My Photo.JPG") });
  assert.equal(r.ok, true);
  assert.match(r.path, /^categories\/\d+-[a-z0-9]+-/);
  assert.equal(adm.uploads.length, 1);
  assert.ok(Buffer.isBuffer(adm.uploads[0].body) && !adm.uploads[0].body.includes(Buffer.from("secret-owner")));
  assert.deepEqual([adm.uploads[0].opts.contentType, adm.uploads[0].opts.upsert, adm.uploads[0].bucket], ["image/jpeg", false, "product-images"]);
  assert.equal(r.url, `https://cdn/product-images/${r.path}`);
  const bad = await storeImage(adm, { bucket: "product-images", folder: "products", file: asFile(Buffer.from("<html></html>".padEnd(40)), "image/png") });
  assert.deepEqual([bad.ok, bad.error], [false, IMAGE_MESSAGES.notImage]);
  assert.equal(adm.uploads.length, 1, "nothing more was uploaded");
  const noBucket = await storeImage(storageAdmin({ fail: { message: "Bucket not found" } }), { bucket: "b", folder: "f", file: asFile(withExif, "image/jpeg"), bucketMissing: "MISSING" });
  assert.equal(noBucket.error, "MISSING");
  assert.match((await storeImage(storageAdmin({ fail: { message: "boom" } }), { bucket: "b", folder: "f", file: asFile(withExif, "image/jpeg"), bucketMissing: "MISSING" })).error, /آپلود ناموفق/);
});

test("every upload action of both panels goes through the one safe path; no module uploads a raw file to a public bucket", () => {
  for (const [f, bucket, folder] of [["lib/operator/actions.js", "product-images", "products"], ["lib/operator/actions.js", "product-images", "categories"], ["lib/beauty/operator/actions.js", "beauty-product-images", "products"], ["lib/beauty/operator/actions.js", "beauty-product-images", "categories"], ["lib/beauty/operator/actions.js", "beauty-brand-logos", "logos"]]) {
    assert.match(read(f), new RegExp(`storeImage\\(a\\.admin, \\{ bucket: "${bucket}", folder: "${folder}", file: formData\\?\\.get\\?\\.\\("file"\\)`), `${f} ${bucket}/${folder}`);
  }
  const offenders = [];
  const walk = (d) => { for (const e of fs.readdirSync(path.join(root, d), { withFileTypes: true })) { const rel = path.join(d, e.name); if (e.isDirectory()) walk(rel); else if (/\.(js|mjs)$/.test(e.name) && /\.upload\(/.test(read(rel)) && !["lib/operator/imageUpload.js", "lib/operator/documentsCore.js"].includes(rel.replace(/\\/g, "/"))) offenders.push(rel); } };
  walk("lib"); walk("app");
  assert.deepEqual(offenders, [], "only lib/operator/imageUpload.js (images) and documentsCore.js (PDFs: scanned, hashed, served as application/pdf) may call storage.upload");
  // the permission check comes first in each action
  for (const f of ["lib/operator/actions.js", "lib/beauty/operator/actions.js"]) for (const fn of ["uploadProductImage", "uploadCategoryImage"]) {
    const src = read(f); const i = src.indexOf(`export async function ${fn}(`); const body = src.slice(i, src.indexOf("\n}\n", i));
    assert.ok(body.indexOf("await authed(") >= 0 && body.indexOf("await authed(") < body.indexOf("storeImage("), `${f}:${fn}`);
  }
});

// ── the focus point ──────────────────────────────────────────────────────────────────────────────────────────────────────
test("cleanFocus / rowFocus / focusStyle: whole numbers 0–100, both or none; the centre by default", () => {
  assert.deepEqual(cleanFocus(30, 70), { ok: true, focus: { x: 30, y: 70 } });
  assert.deepEqual(cleanFocus("0", "100"), { ok: true, focus: { x: 0, y: 100 } });
  assert.deepEqual(cleanFocus("", ""), { ok: true, focus: null });
  assert.deepEqual(cleanFocus(null, undefined), { ok: true, focus: null });
  for (const [x, y] of [[30, ""], ["", 30], [-1, 5], [5, 101], [101, 0], [1.5, 2], ["abc", 5], ["5%", 5], [NaN, 1], [{}, 1]]) assert.equal(cleanFocus(x, y).ok, false, `${x},${y}`);
  assert.deepEqual(rowFocus({ image_focus_x: 20, image_focus_y: 40 }), { x: 20, y: 40 });
  assert.equal(rowFocus({}), null); assert.equal(rowFocus(null), null);
  assert.equal(focusStyle({ image_focus_x: 20, image_focus_y: 40 }), "20% 40%");
  assert.equal(focusStyle({}), "50% 50%"); assert.deepEqual(FOCUS_CENTER, { x: 50, y: 50 });
});

test("the focus is written only when the form sent one AND the columns exist (migration 47); an invalid point is an error, never stored", async () => {
  resetFocusScope();
  const ready = createMemoryAdmin({ categories: [{ id: 1, image_focus_x: null, image_focus_y: null }] });
  assert.equal(await focusReady(ready, "categories"), true);
  assert.deepEqual(await withFocus(ready, "categories", { a: 1 }, { image_focus_x: 30, image_focus_y: 70 }), { ok: true, row: { a: 1, image_focus_x: 30, image_focus_y: 70 } });
  assert.deepEqual(await withFocus(ready, "categories", { a: 1 }, { image_focus_x: "", image_focus_y: "" }), { ok: true, row: { a: 1, image_focus_x: null, image_focus_y: null } }, "empty = clear it");
  assert.deepEqual(await withFocus(ready, "categories", { a: 1 }, { name: "no focus keys" }), { ok: true, row: { a: 1 } }, "a form without the field leaves the stored point alone");
  assert.deepEqual(await withFocus(ready, "categories", { a: 1 }, { image_focus_x: 30 }), { ok: false });
  assert.deepEqual(await withFocus(ready, "categories", { a: 1 }, { image_focus_x: 300, image_focus_y: 1 }), { ok: false });
  // before the migration: the column is missing → not offered, not written, saving still works
  resetFocusScope();
  const before = createMemoryAdmin({ categories: [{ id: 1 }] }, { schema: { categories: ["id"] } });
  before.fail = (t, op) => (t === "categories" ? { code: "42703", message: "column categories.image_focus_x does not exist" } : null);
  assert.equal(await focusReady(before, "categories"), false);
  assert.deepEqual(await withFocus(before, "categories", { a: 1 }, { image_focus_x: 30, image_focus_y: 70 }), { ok: true, row: { a: 1 } });
  assert.equal(await focusReady(null, "categories"), false);
});

test("the crop rectangle: the largest frame of the ratio that fits, zoomed, moved inside the picture and never outside it", () => {
  const sq = cropRect(400, 300, 1, 1, 50, 50);
  assert.deepEqual([sq.cw, sq.ch, sq.left, sq.top], [300, 300, 50, 0]);
  const wide = cropRect(400, 300, 16 / 9, 1, 0, 0);
  assert.deepEqual([wide.cw, Math.round(wide.ch), wide.left, wide.top], [400, 225, 0, 0]);
  const zoomed = cropRect(400, 300, 4 / 3, 2, 100, 100);
  assert.deepEqual([zoomed.cw, zoomed.ch, zoomed.left, zoomed.top], [200, 150, 200, 150]);
  for (const [z, x, y] of [[1, 0, 0], [4, 100, 100], [2.5, 37, 81]]) {
    const c = cropRect(1234, 987, 4 / 3, z, x, y);
    assert.ok(c.left >= -1e-9 && c.top >= -1e-9 && c.left + c.cw <= 1234 + 1e-9 && c.top + c.ch <= 987 + 1e-9, `${z},${x},${y} stays inside`);
  }
});

// ── safe deletion ───────────────────────────────────────────────────────────────────────────────────────────────────────
function mediaAdmin(seed) {
  const db = createMemoryAdmin(seed);
  const removed = [];
  db.storage = { from: (bucket) => ({ remove: async (paths) => { removed.push(...paths); return { data: paths.map((name) => ({ name })), error: null }; } }) };
  db.removed = removed;
  return db;
}

test("a category's picture is 'used' (also with a focus point and as a full address); replacing it frees the old file; removing the picture never deletes the file", async () => {
  const db = mediaAdmin({
    products: [], categories: [{ id: 5, slug: "gloves", name_en: "Gloves", name_fa: "", image_url: "categories/a.webp", image_focus_x: 20, image_focus_y: 40 }, { id: 6, slug: "masks", name_en: "Masks", name_fa: "", image_url: "https://x.supabase.co/storage/v1/object/public/product-images/categories/b.webp?v=2" }],
    operator_change_requests: [],
  });
  const used = await usageMap(db, "health");
  assert.deepEqual(used.map.get("product-images/categories/a.webp").map((u) => [u.kind, u.id]), [["category", 5]]);
  assert.deepEqual(used.map.get("product-images/categories/b.webp").map((u) => [u.kind, u.id]), [["category", 6]]);
  const refused = await deleteMedia(db, "health", { bucket: "product-images", path: "categories/a.webp" });
  assert.deepEqual([refused.ok, refused.inUse, refused.error], [false, true, MEDIA_MESSAGES.inUse]);
  assert.deepEqual(db.removed, []);
  // the category gets another picture: the old file is unused now and may be removed (by someone with the right)
  db.tables.categories[0].image_url = "categories/new.webp";
  assert.equal((await deleteMedia(db, "health", { bucket: "product-images", path: "categories/a.webp" })).ok, true);
  assert.deepEqual(db.removed, ["categories/a.webp"]);
  // and the picture of a PENDING request counts as used as well
  db.tables.operator_change_requests.push({ id: "r1", house: "health", status: "pending", entity: "categories", subject: "x", proposed: { image_url: "categories/later.webp" } });
  assert.equal((await deleteMedia(db, "health", { bucket: "product-images", path: "categories/later.webp" })).inUse, true);
});

// ── the screens ──────────────────────────────────────────────────────────────────────────────────────────────────────────
test("both category forms use the shared picture field with their own upload action; the focus picker is offered only when migration 47 is applied", () => {
  const health = read("components/operator/HealthCategoryTree.jsx"), beauty = read("components/beauty/operator/CategoryTree.jsx");
  assert.match(health, /upload=\{uploadHealthCategoryImage\}/); assert.match(health, /srcOf=\{\(v\) => imageUrl\(v\)\}/);
  assert.match(beauty, /upload=\{uploadCategoryImage\}/); assert.match(beauty, /srcOf=\{\(v\) => beautyImageUrl\(v\)\}/);
  for (const f of [health, beauty]) { assert.match(f, /focusAvailable=\{focusAvailable\}/); assert.match(f, /<CategoryImageField/); }
  assert.match(read("app/operator/(panel)/categories/page.jsx"), /focusReady\(getAdminClient\(\), "categories"\)/);
  assert.match(read("app/beauty/operator/(panel)/categories/page.jsx"), /focusReady\(getAdminClient\(\), "beauty_categories"\)/);
  assert.match(read("components/operator/CategoryImageField.jsx"), /\{src && focusAvailable && /);
  assert.match(read("components/beauty/operator/BrandsManager.jsx"), /<ImageCropDialog file=\{pendingLogo\}/);
  // the crop happens on the person's device, in a portal (not inside another dialog's animated card)
  assert.match(read("components/operator/ImageCropDialog.jsx"), /createPortal\(/);
});

test("the public pages show the picture where the focus point says; the Beauty query falls back when migration 47 is missing", () => {
  assert.match(read("components/health/CategoryTreeGrid.jsx"), /objectPosition: focusStyle\(node\)/);
  assert.match(read("components/home/CategoryGrid.jsx"), /objectPosition: focusStyle\(category\)/);
  assert.match(read("components/beauty/WorldGrid.jsx"), /objectPosition: focusStyle\(node\)/);
  assert.match(read("components/beauty/home/CategoryGrid.jsx"), /objectPosition: focusStyle\(dept\)/);
  const cat = read("lib/beauty/catalog.js");
  assert.match(cat, /FOCUS_COLUMNS = ",image_focus_x,image_focus_y"/); assert.match(cat, /query\(CATEGORY_COLUMNS\)/);
  assert.match(cat, /error\.code === "42703" \|\| error\.code === "PGRST204"/);
  // a static fallback photo (no uploaded picture) is not moved by a focus point
  assert.match(read("components/beauty/WorldGrid.jsx"), /node\.image_url \? \{ objectPosition/);
});
