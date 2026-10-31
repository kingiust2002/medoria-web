# Product variants (N3)

**Status: complete in code and tests for both houses; migration 44 is written, tested on a throw-away PostgreSQL 16 and NOT applied anywhere. Not deployed. The Tajik / English texts are machine-prepared and still need a human review (see "Owner confirmation").**

## What it is

A product can have variants — a size, a colour, a pack, a volume — each with its **own SKU, price (or "price on request"), stock flag, active flag and picture**, and **clearly linked to the product it belongs to**. A customer chooses the variant on the product's page and everything about buying follows the choice: price, SKU, stock, picture, and the request they send (quotation form, WhatsApp / Telegram message, inquiry list).

No variant is invented: existing products have none until somebody adds them, and no old data (products, requests, approvals, history, warehouse) is touched.

## Design: a variant is a product row

| | |
| --- | --- |
| Storage | the same table as products (`products`, `beauty_products`) with three new columns: `variant_of` (the parent, `ON DELETE RESTRICT`), `variant_options` (the choices, e.g. `{"Size": "M"}`), `variant_sort` |
| Why a row | the **warehouse, customer requests, inquiry list, price, images, history and approvals already work per product row** — a variant reuses all of it without a second code path. Stock lots and movements of a variant are the variant's own (`product_id` = the variant) |
| Derived names | a variant's stored names are `<product name> — <option values>` in every language the product has a name in, so every list, the warehouse and a customer request show something meaningful. Re-saving a variant re-derives them; a later rename of the product does **not** rewrite its variants' stored names (stated limit, below) |
| Inherited | brand, category, unit and minimum order from the product unless the variant sets its own unit |
| Not inherited | `is_featured` (a variant is never featured), gallery, specs, tags, SEO fields — the page shows the product's |
| Limits | at most 3 options per variant (name ≤ 30, value ≤ 60 characters), 100 variants per product, one level only (a variant has no variants) |

### Database rules (migration 44, enforced for everybody including the service role)

* a variant has a non-empty SKU and at least one option; an ordinary product has no options; a variant is never its own parent;
* **one level only**, the parent of a variant never changes, an **existing product never becomes a variant** (so no history, request or stock of an ordinary product can be re-interpreted);
* **SKU is unique across products and variants** (the existing case-insensitive unique index covers both rows);
* a parent cannot be deleted while it has variants (`ON DELETE RESTRICT`); the panel says so in words and the activity log records `has_variants`;
* **public site**: the single public read policy of each table is now `is_active = true AND variant_of IS NULL`, so a variant is **never a public product** — not in the catalogue, search, sitemap, compare or wish list, and never a page of its own. The product page reads the *active variants of an active product* through `SECURITY DEFINER` functions (`public_product_variants`, `public_beauty_product_variants`) that return public columns only; the Health inquiry list resolves variant ids through `public_variant_items`. Customer requests are written by the server with the service role, which sees variants.

## What the owner / staff see

* **Product edit page (both panels)**: a "Product variants" section under the form: list (options, SKU, price, stock, active), add / edit, archive / activate, and delete (only an archived variant, by typing its SKU — the same dialog and rules as deleting a product). A variant's own edit address opens its product's page.
* **Product list**: shows products only, with a "N variants" tag; a **search also finds variants** (by SKU or name) and tags them "variant". The dashboard numbers, the counts per category / brand, the brand roster and the CSV export count/list products, not variants.
* **Import**: a spreadsheet row whose SKU or slug belongs to a variant is reported as an error ("edit it from the product's page"), never rewritten as a product.
* **Duplicate product**: copies the product, never its variants; duplicating a variant is refused with a pointer to the product's page.
* **Without migration 44** the variants section is not shown at all and the lists are unfiltered (a cached probe is asked again every 30 s), so the deployed panel works before and after the migration.

## Rights and approval — the same as a product

| Action | Needs | Approval |
| --- | --- | --- |
| add a variant | `products.create` (+ `products.publish` when it is created active) | a person whose policy says "needs approval" files a request that carries the **whole new row**; nothing is created until a reviewer approves |
| edit a variant | `products.content`, plus `products.price` / `products.stock_flag` / `products.publish` / `products.archive` for what really changes | the request carries only the changed fields with their old values, prepared against the version seen (`base_updated_at`); a newer change makes the approval `stale` |
| archive / activate | `products.archive` / `products.publish` | same |
| delete | `products.delete` (archived only, typed SKU) | same as a product (attempt then outcome in the activity log) |

The executors are the existing product executors (`products.create` / `products.content` …): an approved request inserts / updates the variant row exactly as proposed; a SKU taken in the meantime fails the request as `stale`. An optimistic lock protects the edit screen (a stale screen is a conflict, nothing is written). Every change is in the product history (`product_versions`) and the activity log (`product.variant.create` / `product.variant.update`).

## Public pages

* **Health** product page: a picker (buttons per option); the price card, SKU, unit, stock pill, picture, quotation modal, WhatsApp / Telegram message, inquiry list and sticky panel follow the chosen variant. A combination that does not exist moves to the nearest variant that has the chosen value. Compare, wish list and "recently viewed" stay on the product. JSON-LD becomes a `ProductGroup` with a `Product` and an `Offer` per variant (no price is invented for a "price on request" variant).
* **Beauty** product page: the same in an island (`BeautyVariantBuy`); a product without variants keeps its server-rendered card.
* The picker shows the owner's option names and values as written; its only fixed text is a screen-reader heading in the four site languages.

## Migration 44

* **File**: `migrations/44_product_variants.sql`. **Needs** 01 / 04 / 10 / 27 / 28 (the product tables, `is_active`, the single public policy). **Order**: any time after 43; the code that uses it is already tolerant.
* **Compatibility**: additive. Existing rows get `variant_of = NULL`, `variant_options = '{}'`, `variant_sort = 0`; no value, grant or index of an existing object changes. The public read policy of each table is replaced by the same policy plus `variant_of IS NULL`, so what was public stays public. The migration's self-check aborts and rolls back if the result is not exactly one hiding policy, the guard trigger or the function privileges are wrong. Idempotent.
* **Rollback** (only after the deployed code no longer uses variants, and only if the variant rows may be removed): the exact statements are in the header of the file (delete variant rows, drop the functions, trigger and columns, restore the old policy). Do **not** edit the file after it has been applied; add a migration 45 instead.
* **Tested**: `tests/product-variants-migration.test.mjs` runs the file on PostgreSQL 16 for both houses (precondition failure changes nothing, re-run, shape, one level, parent fixed, existing product never a variant, restricted delete, unique SKU across both kinds, public invisibility, function results and privileges, 30-id limit of the inquiry function, guard privacy).
* `scripts/check-rls.mjs` probes that an anonymous visitor cannot read variants (inconclusive — not green — before the migration, because the column does not exist).

## Tests

* `tests/product-variants-migration.test.mjs` (6 tests, real PostgreSQL) and `tests/product-variants.test.mjs` (20 tests): option cleaning, derived names, the visitor's choice, schema.org, the shared save logic (rights, approval of creation / edit, publish rule, duplicate SKU in any case, same options, parent checks, limit of 100, optimistic lock, history, audit, "migration missing" in words), what an approved request does and stale handling, the panel lists with and without the migration, import protection, the public readers' wiring, house separation (Health's action never touches the Beauty table).
* `tests/e2e/product-variants.e2e.mjs` (real browser): add variants in both panels, panel list / search / redirect, public page choice (SKU, price follow), JSON-LD, a variant is not a page or in the catalogue / sitemap, duplicate SKU refusals, archive then delete by SKU, 320 px with a 48-character unbroken option.
* Existing security / approval / list tests were kept; source pins were extended (activity-log coverage, dashboard guard, chunked reads).

## Stated limits

* Renaming a product does **not** rewrite the stored names of its variants (they are re-derived the next time a variant is saved). Customer requests keep the name they were written with either way.
* A variant has **one picture**; the gallery, specs, tags and SEO fields are the product's.
* A variant's category / brand are copied from the product when the variant is saved; moving the product to another category does not move existing variants.
* Variants appear in the warehouse and in customer requests as their own products (by design); there is no combined "all stock of this product" view yet.
* Bulk edits and import operate on products; they do not edit variants.

## Owner confirmation

* Tajik and English texts of the new screens are prepared by machine and have **not** been read by a human translator.
* Whether a variant's price should ever fall back to the product's price (today: no — a variant without a price is "price on request", which is the honest default).
