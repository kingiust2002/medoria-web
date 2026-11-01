# Category images and focal point (N7)

**Status: complete in code and tests for both houses; migration 47 is written, tested on a throw-away PostgreSQL 16 and NOT applied anywhere. Not deployed. Tajik / English texts are machine-prepared and need a human read.**

## What it is

Before N7 the Beauty panel could upload a category tile image and a brand logo, but the **Health** category image was only a bare URL field with no upload, and neither house could choose **which part** of a tile image stays visible when it is cropped to a fixed box. N7 adds, in **both** panels:

1. **A real category-image upload for Health** (the gap the platform plan named: "Health category image is only a URL field"). It reuses the existing `product-images` bucket under a new `categories/` folder, with the same discipline as product images — size and type limits and an authoritative magic-byte sniff (the client-declared type is never trusted). The uploaded image is shown as the category's thumbnail in the panel tree.
2. **A focal point ("smart crop") for category tile images**, in both houses. A category tile is shown cropped to a fixed box (`object-fit: cover`); the operator picks the focal point and that part of the image stays inside the box everywhere the tile is drawn. The value is a plain CSS `object-position` string `"NN% MM%"` (two integers 0–100; `NULL` = centre). **The image itself is never cut or re-encoded** — the project has no server-side image pipeline, so the focal point is a non-destructive framing choice (the industry-standard focal-point crop), not a destructive pixel crop.
3. **Safe deletion coverage** for the new Health `categories/` folder: the image library (`/operator/media`) now lists it and refuses to remove a file an active category (or a pending change request) still points at — exactly as it already does for Beauty category images and brand logos.

## Where the focal point applies

| Surface | Uses the focal point |
| --- | --- |
| Beauty department / category tiles on the public site (`components/beauty/home/CategoryGrid.jsx`, `components/beauty/WorldGrid.jsx`) | yes — only for the operator-uploaded image; the composited fallback tiles (`lib/beauty/categoryImages.js`) are already centred |
| The category thumbnail in both panel trees | yes |
| The live preview in the edit form | yes |

Brand logos are rendered with `object-fit: contain` (the whole mark, letterboxed), so a focal point does not apply to them; brand-logo upload (already present) and its safe deletion are unchanged.

## The picker

`components/panel/FocusPointPicker.jsx` — a dependency-free, shared control (both panels). Click or drag inside the frame, or focus it and use the arrow keys (±5, Shift = ±1, Home = centre). It is keyboard-reachable, works at phone width, and emits a normalised `"NN% MM%"`. `lib/operator/validation.js` `focusPoint()` normalises and clamps the value on the server (rounds to integers, clamps 0–100, anything unusable → `null`); its output always satisfies migration 47's DB CHECK (a test pins the two together).

## Migration 47

`migrations/47_category_image_focus.sql` — `image_focus TEXT` on `categories` and `beauty_categories`, with a strict format CHECK (`^(0|[1-9][0-9]?|100)% (0|[1-9][0-9]?|100)%$`). Public-readable like the other display columns (the value is only a framing hint rendered into a `style`, never an href/src). Additive (`ADD COLUMN IF NOT EXISTS`), one transaction, idempotent, self-checking. Needs the base schema (`categories`) and migration 10 (`beauty_categories`).

**Before migration 47** the panel still works: a category save that cannot write `image_focus` retries without it (the image is saved, the focal point simply is not stored), the public Beauty catalogue falls back to the column list without `image_focus` instead of collapsing to empty, and the tiles use the centre as before. The focal-point control only stores a value once the column exists.

**Rollback** (only after the deployed code no longer reads it):
`ALTER TABLE public.categories DROP COLUMN IF EXISTS image_focus; ALTER TABLE public.beauty_categories DROP COLUMN IF EXISTS image_focus;`

## Permissions

Nothing new. Uploading or editing a category image uses `categories.edit` (the Health upload action `uploadHealthCategoryImage` checks it, exactly like Beauty's `uploadCategoryImage`); removing a file from the library uses the existing `media.delete` (approval-aware). A category save files/updates its row under the normal category rules.

## Tests

* `tests/category-brand-images.test.mjs` (unit): `focusPoint()` normalisation and clamping; validator ↔ DB-CHECK parity (no drift); the Health media library now owns a `categories/` folder (upload target + safe-delete guard, no traversal); a Health category image in use is listed as used and never removed, an orphan can go.
* `tests/category-brand-images-migration.test.mjs` (real PostgreSQL 16): needs the base tables; adds `image_focus` to both; the format CHECK accepts a valid focal point and rejects everything else, on both tables; idempotent re-run.
* `tests/e2e/category-brand-images.e2e.mjs` (real browser, fake DB + storage): Health — a category gains a real uploaded image (stored under `product-images/categories/`) and a keyboard-set focal point, and the image library lists it as used by that category and offers no delete; Beauty — its own category image carries its own focal point; the edit modal with the picker fits a 320 px phone.
* `tests/media-library.test.mjs` updated: Health's allowed folders now include `categories/`.

## Stated limits

* **Focal point, not destructive crop.** The stored value frames the existing image inside the tile box; the file is never cut or re-encoded (there is no image pipeline). This is deliberate and documented.
* **Health category images are managed and tracked, not yet shown on a public Health page.** Health has no public category-tile grid today; the uploaded image appears in the panel tree and the image library, and the `image_url`/`image_focus` columns are ready for a future public Health category surface (which needs a public-design decision, out of scope for a panel PR).
* Brand logos take no focal point (they render `object-contain`); their upload and safe deletion are unchanged.
* The focal point applies to the operator-uploaded image only; the Beauty fallback tile set is pre-framed and centred.
