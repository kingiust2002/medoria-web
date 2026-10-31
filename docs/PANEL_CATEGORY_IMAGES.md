# Category pictures, crop, focus point and upload safety (N7)

**Status: complete in code and tests for both houses. Migration 47 (the focus point) is written, tested on a throw-away PostgreSQL 16 and NOT applied anywhere; without it everything else works and the focus picker says it needs the migration. Not deployed. Tajik / English texts are machine-prepared and need a human read.**

## What changed

| Area | Before | Now |
| --- | --- | --- |
| Health category picture | none in the panel (the tree form had no picture field); the public site showed only an icon | upload a picture in the category form; the public category tiles (home, categories page) show it instead of the icon |
| Beauty category picture | upload only | the same shared field (crop + focus) |
| Brand logo (Beauty) | upload only | the crop dialog first — **the original can be sent unchanged** (an official logo is not altered unless the person chooses to crop) |
| Crop | none | `ImageCropDialog`: on the person's own device, aspect 4:3 / 16:9 / 1:1 / 3:4, zoom + two position sliders (no dragging needed, keyboard and touch friendly), the preview is exactly the uploaded frame |
| Focus point | none | `FocusPicker`: tap the part of the picture that must stay visible (or use two sliders / arrow keys); two live tile previews; stored as `image_focus_x / image_focus_y` (0–100 %) and applied by the public tiles as CSS `object-position`. A static fallback photo (no uploaded picture) is never moved by a focus point |
| Upload safety | magic-byte type check and the 5 MB limit | **one safe path for every upload** (`lib/operator/imageSafety.js` + `imageUpload.js`, used by product, category and logo uploads of both houses): real type from the bytes, only JPEG / PNG / WEBP / AVIF (never SVG / GIF / HTML), must decode, not animated, at most 8000 px on a side and 36 megapixels (refused *before* decoding), **re-encoded so all hidden metadata (GPS position, camera, comments, ICC) is dropped and the orientation is applied**, scaled down above 4096 px, the result must still fit 5 MB. If the image library cannot load, **nothing is uploaded** (fail closed) |
| Deleting pictures | the media library refuses to delete a file that is used (checked again at the moment of removal) | unchanged and now proven for category pictures too: the Health `categories/` folder is part of the library; a category picture counts as used with or without a focus point, as a path or a full address, and when it only appears in a **pending request**. **Removing a picture from a category never deletes the file** — it becomes unused and is removed from «تصاویر» by someone with the right |

## Migration 47

`migrations/47_category_image_focus.sql`: `image_focus_x / image_focus_y SMALLINT` (nullable) on `categories` and `beauty_categories`, one CHECK per table — **both NULL, or both whole numbers 0–100** (a half-set point is refused; the first draft of the CHECK let `x = 30, y = NULL` through because a CHECK passes on NULL — found by the real-PostgreSQL test and fixed). Additive, idempotent, one transaction, self-checking; no policy or grant changes (the public read policies are row level). **Rollback** (only after the deployed code no longer uses it): the `DROP CONSTRAINT / DROP COLUMN` statements in the file header.

**Before the migration**: the panel does not offer the focus picker (`focusReady` probe, rechecked every 30 s, like the variants probe), a form that sends a focus is saved without it, and the public Beauty category query retries without the two columns (rechecked every 5 minutes) — saving and showing categories works in both states. Applying it needs no restart.

## Tests

* `tests/category-image-focus-migration.test.mjs` (4, real PostgreSQL): needs both tables; additive / idempotent, existing rows untouched; both-or-none and 0–100 for both houses; public role still reads the table.
* `tests/image-media.test.mjs` (12, the real image library): metadata (EXIF GPS, camera, copyright) removed and orientation applied; PNG alpha kept, WEBP / AVIF re-encoded, stored type = real type; refusals (HTML dressed as PNG, SVG, GIF, damaged file, header-only file, too heavy, too wide, too many pixels, animated, no library); scaling; `storeImage` uploads the cleaned bytes, never the original, refusals upload nothing; **every upload action of both houses goes through the one path and no other module calls `storage.upload`**; focus cleaning and probe; crop geometry never leaves the picture; category picture usage / deletion rules; screen and public-page pins.
* `tests/e2e/category-images.e2e.mjs` (4, real browser): choose → crop → upload → tap a focus point → save, the row has the path and the point, the public tile uses it; the point can be cleared and the picture removed without deleting the file; a disguised file is refused in words and nothing is stored, a wrong kind of file never leaves the browser; the crop dialog and focus picker fit 320 px; Beauty department picture + focus, brand logo through the crop step. (The test rig's fake storage now keeps and serves the uploaded bytes.)
* Screenshots were looked at (desktop and 320 px): `health-crop-4x3`, `health-focus`, `health-crop-320`, `health-public-categories`.

## Stated limits

* The public category list is cached by the site for up to about two minutes, so a changed picture or focus point appears after that (existing behaviour of the public data layer).
* The focus point is for **category** pictures. Product pictures and brand logos are only cropped (logos not focused: they are shown "contain").
* The crop is done in the browser; a browser that cannot draw to a canvas gets the message to upload the original (which the server cleans anyway).
* Existing pictures already in storage are **not** re-processed; only new uploads are cleaned.
* Product images in the product form keep their own uploader (no crop dialog there yet); they do get the server-side safety path.
