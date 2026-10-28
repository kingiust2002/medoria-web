# Database migrations

Run these in the **Supabase SQL editor**, in order, **after** the repo's existing
`supabase-migration.sql` and `supabase-migration-phase2.sql`. Every file is
idempotent (safe to re-run) and **purely additive** — none delete or overwrite data.

| Order | File | Adds |
|-------|------|------|
| 1 | `01_categories_and_category_id.sql` | `categories.id` surrogate key, `products.category_id` FK + backfill from slug, index, de-emojified category icons |
| 2 | `02_quote_requests.sql` | `quote_requests` table with public-insert / auth-read RLS |
| 3 | `03_sort_and_price_fields.sql` | `products.created_at`, `products.views`, nullable `price`, `increment_product_views()` RPC |
| 4 | `04_operator_fields.sql` | `products.is_active/tags/seo_title/seo_description`, `categories.is_active/is_featured`, `set_updated_at()` trigger on products |
| 5 | `05_quote_requests_ops.sql` | `quote_requests.internal_notes/source_url/updated_at`, expanded status set, updated_at trigger |
| 6 | `06_storage_product_images.sql` | `product-images` storage bucket (public read) + read policy |
| 7 | `07_unique_product_sku_slug.sql` | UNIQUE indexes on `products.slug` and case-insensitive `products.sku` (empty SKU stays allowed). **Stops safely with a list of duplicates** if production data already has any — fix those by hand, nothing is changed automatically |
| 8 | `08_import_logs.sql` | `import_logs` history table (service-role only, RLS locked) |
| 9 | `09_security_hardening.sql` | Length/quantity CHECK constraints on `quote_requests` (new rows only), query indexes. Step 3 inside the file (commented out) drops the anon public-insert policy — run that step **only after** the release that submits quotes via the server action is live with `SUPABASE_SERVICE_ROLE_KEY` set |
| 10 | `10_beauty_catalog.sql` | The **entire Medoria Beauty catalog** in one file (Beauty starts fresh): `beauty_categories` (world-linked), `beauty_products`, `beauty_quote_requests` (born hardened — no anon insert), `beauty_import_logs`, unique slug/SKU indexes, active-only public-read RLS, `increment_beauty_product_views()` RPC, `beauty-product-images` storage bucket, starter category seed. Touches **nothing** in the Health tables |
| 27 | `27_security_policy_cleanup.sql` | Security cleanup applied to production on 2026-10-20 (runbook §23.3): drops `quote_requests_auth_read` and the leftover public-insert policies, and limits `products` public read to `is_active = true`. **Removes policies only; no data is touched.** Migrations 11–26 are not listed in this table (Beauty brands, Beauty/Health category trees) — see the files |
| 28 | `28_private_tables_and_active_products.sql` | One all-or-nothing transaction (runbook §23): drops **every** policy on the five private tables (`quote_requests`, `beauty_quote_requests`, `contact_inquiries`, `import_logs`, `beauty_import_logs`) and revokes all anon/authenticated/PUBLIC privileges on them, and makes `products_public_read … USING (is_active = true)` the **only** `products` policy regardless of policy names. Self-checks and aborts on any mismatch. **No data is touched.** Applied to production on 2026-10-24 (runbook §23.7) |
| 29 | `29_quote_status_archived.sql` | Adds the `archived` quote status (Archive tab of both operator panels) by replacing the status CHECK of `quote_requests` and `beauty_quote_requests`. One transaction, self-checking, idempotent; **no row is touched**. Until it runs, "archive" in the panel answers "run migration 29" and everything else works. **Applied to production on 2026-10-25** (owner's report; runbook §23.8) |
| 30 | `30_operator_security.sql` | Operator panel security (docs/OPERATOR_SECURITY.md): four **private** tables (`operator_audit_log`, `operator_sessions`, `operator_totp_state`, `operator_recovery_used`): row-level security on, no policy, service_role only. One transaction, idempotent, self-checking, **no existing table or row is touched**. Run it together with the deploy of the code that uses it; everyone logs in once more afterwards |
| 31 | `31_categories_active_only.sql` | Public read of `categories` (Health) is limited to `is_active = true` (it was `USING (true)`: a switched-off category was still readable through the API); `beauty_categories` and `beauty_brands` are re-asserted the same way. Policies only; no row, column or grant is touched. One transaction, idempotent, self-checking; tested on PostgreSQL 16 with a stray leftover policy, an old schema without `is_active` (aborts, nothing changed) and an empty database |
| 32 | `32_quote_management.sql` | Customer-request management (docs/QUOTE_MANAGEMENT.md) on `quote_requests` and `beauty_quote_requests`: `tracking_code` (unguessable, 48 random bits, assigned by an insert trigger; existing rows are back-filled without touching `updated_at`), `assigned_to`, `first_response_at` (set by trigger on the first real answer), `notify_status` / `notify_detail` (Telegram notice result). Adds columns, one unique index, two triggers and CHECKs; **no row is deleted or changed**, no grant or policy is touched. One transaction, idempotent, self-checking; tested on PostgreSQL 16 (service_role insert, anon/authenticated locked out, re-run, rollback). Until it runs, the forms and the panel keep working and the new fields stay empty |
| 33 | `33_quote_items.sql` | Several products in one customer request (docs/INQUIRY_LIST.md): nullable `items jsonb` on `quote_requests` and `beauty_quote_requests` (name and SKU written by the server from the products table, at most 30 entries) with a CHECK. One column and one constraint per table; no row, grant or policy is touched. One transaction, idempotent, self-checking. Until it runs, the form retries without the column and writes the list into the message text |
| 34 | `34_operator_users.sql` | Personal accounts for the operator panels (docs/OPERATOR_ACCOUNTS.md): private table `operator_users` (RLS on, no policy, service role only), `user_id` on `operator_sessions`, `user_id`/`result`/`request_id` on `operator_audit_log`; triggers: an account is never deleted, the last active owner cannot be disabled/demoted (row-locked), `version` moves on administered fields. **Needs migration 30**; aborts cleanly otherwise. One transaction, idempotent, self-checking, additive; tested on PostgreSQL 16 (re-run, privacy, last-owner race, rollback). Inert until `OPERATOR_USERS=on` |
| 35 | `35_operator_change_requests.sql` | The approval queue and a trustworthy activity log (docs/OPERATOR_ACCOUNTS.md): private `operator_change_requests` (pending → approved / rejected / cancelled / superseded, approved → failed; the asker is never the decider; a rejection needs a reason; decided rows frozen and never deleted; an identical pending request cannot be filed twice), `before` / `after` on `operator_audit_log`, and the activity log becomes **append-only** (no update or delete for anybody). **Needs 30 and 34.** One transaction, idempotent, self-checking; tested on PostgreSQL 16 (state machine, privacy, rollback). Inert until `OPERATOR_USERS=on` |
| 36 | `36_warehouse.sql` | The internal warehouse of each house (docs/WAREHOUSE.md), **generated** by `scripts/db/gen-warehouse-migration.mjs`: `health_/beauty_stock_locations`, `_balances`, `_movements` (append-only ledger with idempotency keys), `_reservations`, and the functions `_stock_post / _reverse / _reserve / _release` (SECURITY DEFINER, executable by service_role only). Private: RLS on, no policy, nothing for anon / authenticated, no direct writes to the ledger / balances / reservations even for service_role. **Needs 34** and the product tables. One transaction, idempotent, self-checking; tested on PostgreSQL 16 (negative stock, replay, races, reversals, privacy). Inert until the warehouse screens are deployed |
| 37 | `37_quote_followup.sql` | Follow-up of customer requests (Health + Beauty): `follow_up_at` (the promised day), `assigned_user_id` (the real person, `ON DELETE SET NULL`), `notify_attempts` / `notify_last_attempt_at` (Telegram "send again"). **Needs 32 and 34.** Columns only: no row or value changes; one transaction, idempotent, self-checking; tested on PostgreSQL 16. The panel works without it (the new fields stay empty and the screen says so) |
| 38 | `38_product_versions.sql` | Product change history: `product_versions` / `beauty_product_versions` (changed fields, old and new value, who, how, when; `reverts_id` for a revert). Append-only (no update/delete/truncate for anybody), private (RLS on, no policy, service_role may only read and append), no foreign key to the product tables. **Needs 34.** One transaction, idempotent, self-checking; tested on PostgreSQL 16. The panel works without it (no history; the screen says so) |
| 39 | `39_scheduled_publishing.sql` | `publish_at` / `unpublish_at` on `products` and `beauty_products` (docs/SCHEDULED_PUBLISHING.md). Columns only, partial indexes; no row, value or grant changes. One transaction, idempotent, self-checking; tested on PostgreSQL 16. Dates are applied by a host cron calling `/api/internal/scheduled-publishing` (needs `SCHEDULE_TOKEN`); without it they wait |
| 42 | `42_site_content.sql` | Site content of each house (docs/SITE_CONTENT.md): `site_content` (announcement banner and FAQ items; texts per language in `data`). Public read only of LIVE rows (row policy on published / publish_at / unpublish_at) and only the public columns (column grants); only service_role writes; `house` / `kind` fixed, `version` bumped on every update. Needs 34 |
| 41 | `41_warehouse_counts.sql` | Stock counts and minimum levels of the internal warehouse (docs/WAREHOUSE.md): per house `*_stock_levels`, `*_stock_counts` (one open count per warehouse; closed / cancelled counts and their lines are frozen, never deleted) and `*_stock_count_lines`. Private (RLS, no policy). Needs 36. Closing a count posts through the ledger functions of 36; nothing here changes a balance |
| 40 | `40_translation_meta.sql` | `translation_meta JSONB NOT NULL DEFAULT '{}'` on `products` and `beauty_products`: which texts were written by the automatic translator and not yet read by a person (docs/TRANSLATION_STATUS.md). Column + object/size CHECK only; existing texts count as human. One transaction, idempotent, self-checking; tested on PostgreSQL 16 |
| 43 | `43_panel_list_paging.sql` | Server-side paging of the panel lists (docs/PANEL_LIST_PAGING.md): computed column `gap_count()` on `products` / `beauty_products` (the completeness rule of the panel, executable by service_role only) so the "incomplete/complete" filter, sort and count run over the whole catalogue; generated `phone_key` on both request tables (the customer-file key) with indexes; list-order indexes. **Needs 01/10/32.** Adds two functions, two generated columns and indexes; no row or grant of an existing object changes. One transaction, idempotent, self-checking; tested on PostgreSQL 16 (SQL rule = `productGaps()` row by row, privacy, re-run). The panel works without it (the completeness filter and the full customer file say that migration 43 is missing) |
| 44 | `44_product_variants.sql` | Product variants (docs/PANEL_VARIANTS.md): `variant_of` (FK, ON DELETE RESTRICT), `variant_options`, `variant_sort` on `products` / `beauty_products`; a CHECK that keeps a variant well-formed (own SKU, at least one option, never its own parent); a guard trigger (one level only, the parent of a variant never changes, an existing product never becomes a variant); the single public read policy of each table now also requires `variant_of IS NULL`, so a variant is never a public product; SECURITY DEFINER functions `public_product_variants`, `public_beauty_product_variants` (the product page) and `public_variant_items` (the Health inquiry list), active variants of an active product only, public columns only. **Needs 01/04/10/27/28.** Additive; one transaction, idempotent, self-checking; tested on PostgreSQL 16 for both houses (shape, one level, SKU unique across parents and variants, restricted delete, public invisibility, function privileges, re-run). Until it is applied the panel hides the variants section and the public pages show products as before |
| 45 | `45_warehouse_lots.sql` | Warehouse lots (batches), expiry dates and quarantine (docs/PANEL_WAREHOUSE_LOTS.md), a layer on migration 36 for both houses: `*_stock_lots`, `*_stock_lot_balances`, `*_stock_movement_lots`, `*_stock_lot_events`, `*_stock_unusable()`, the lot-aware functions `*_stock_lot_post / _lot_reverse / _lot_update`, a guard trigger on the balances that keeps lot stock covered and **quarantined / rejected / expired stock out of every issue, transfer and reservation — also through the older functions of 36 and the count close of 41**, `stock_today()` (team calendar). **GENERATED** by `scripts/db/gen-warehouse-lots-migration.mjs` (edit the template; a test fails if the SQL drifts). **Needs 34/36 (41 for counts).** Internal only like 36; one transaction, idempotent, self-checking; tested on PostgreSQL 16 for both houses (usable stock, guards by every path, atomicity, replay, concurrent same-key sessions, privileges, re-run). Stock without a lot behaves exactly as before; until it is applied the panel shows no lot fields and says so on the lots tab |
| 46 | `46_publish_rules.sql` | Publish quality rules (docs/PANEL_PUBLISH_RULES.md): `publish_rules` — one row per house with the list of gap codes that BLOCK publishing a product (a CHECK accepts only the known codes), a `version` bumped by a guard trigger (the panel's optimistic lock), the house fixed, **rows never deleted**. Private: RLS on, no policy, nothing for `anon` / `authenticated`, `service_role` can read / insert / update only. **Needs 34.** One transaction, idempotent, self-checking; tested on PostgreSQL 16 (privacy, code check, version, immutability, agreement with the application's code list). Until it is applied there is no rule (publishing behaves as before) and the settings card says so |
| 47 | `47_category_image_focus.sql` | Focus point of a category picture (docs/PANEL_CATEGORY_IMAGES.md): `image_focus_x / image_focus_y SMALLINT` (nullable) on `categories` and `beauty_categories` with one CHECK per table — both NULL, or both whole numbers 0–100. **Needs the category tables of both houses.** Additive and idempotent; no policy or grant changes. Tested on PostgreSQL 16. Until it is applied the panel does not offer the focus picker and the public Beauty category query falls back to the columns it had |
| 48 | `48_product_documents.sql` | Product documents (docs/PANEL_PRODUCT_DOCUMENTS.md), both houses: private tables `product_documents` / `beauty_product_documents` (kind, title, language, valid-until, file path inside the house's image bucket under `documents/`, size, SHA-256, published flag, version; product / file / hash never change; `ON DELETE RESTRICT` on the product) and the public SECURITY DEFINER functions `public_product_documents` / `public_beauty_product_documents` (published, valid today in Asia/Dushanbe, active product, never a variant, public columns only). **GENERATED** by `scripts/db/gen-product-documents-migration.mjs` (a test fails if the SQL drifts). **Needs 34 and both product tables.** One transaction, idempotent, self-checking; tested on PostgreSQL 16. Until it is applied the panel says migration 48 is needed and the public pages show nothing new |
| 49 | `49_operator_saved_views.sql` | Saved list views (docs/PANEL_SAVED_VIEWS_BULK_SCOPE.md): private table `operator_saved_views` (a person's named filters of the product or request list of one house: user, house, list, name, small JSON object), unique name per person (case-insensitive), at most 20 per person/house/list, never edited, RLS on with no policy, `service_role` select / insert / delete only. Needs 34. One transaction, idempotent, self-checking. Not applied anywhere. |

## Operator panel — required migrations

The **operator panel** (`/operator`) needs **04** and **05** to be applied, and
**06** (or the dashboard equivalent) for image uploads. Until then:

- The **public site keeps working** — `lib/supabase.js` only applies the new
  `is_active` filter when the column exists and silently falls back otherwise.
- But **writes from the panel** (saving a product, toggling active, editing a
  quote) need the new columns to exist. If a save fails with an "unknown column"
  error, run migrations 04/05 first.

> The operator login uses **environment variables**, not a database table
> (`OPERATOR_PASSWORD_HASH` + `OPERATOR_SESSION_SECRET`). No `admin_users` table
> is created in Phase 1. Role-based DB users are a Phase 2 upgrade.

## Beauty operator panel — required setup

The **Beauty panel** (`/beauty/operator`) is fully separate from Health's and
needs **10** applied, plus its own credentials in the environment:

- `BEAUTY_OPERATOR_USERNAME` — Beauty panel login username.
- `BEAUTY_OPERATOR_PASSWORD_HASH` — generate with the same script:
  `node scripts/hash-operator-password.mjs 'YourStrongPassword'`.
- `BEAUTY_OPERATOR_SESSION_SECRET` — any random string ≥ 16 chars (must be
  DIFFERENT from `OPERATOR_SESSION_SECRET` so the two panels' sessions are
  cryptographically independent).
- `SUPABASE_SERVICE_ROLE_KEY` — shared with Health (same Supabase project).

Image uploads use the separate `beauty-product-images` bucket (created by 10,
or via Dashboard → Storage like Option B below, with that name).

## How to run

1. Open your Supabase project → **SQL Editor** → **New query**.
2. Paste the contents of `01_…`, run it, then verify the bottom comment query.
3. Repeat for `02_…`, `03_…`, `04_…`, `05_…`.

> ⚠️ Do **not** run these against production without an explicit go-ahead and a
> backup.

## Storage setup (bucket `product-images`)

**Option A — SQL (try first):** run `06_storage_product_images.sql`.

**Option B — Dashboard (if the SQL errors with "must be owner of table objects"):**

1. Supabase → **Storage** → **New bucket**.
2. Name: `product-images`. Toggle **Public bucket** ON. Create.
3. (Optional) **Storage → Policies** → the public bucket already allows public
   read. Do **not** add public write policies — the panel uploads server-side
   with the service-role key.

After the bucket exists, set `SUPABASE_SERVICE_ROLE_KEY` in your env (see
`.env.local.example`) so the panel can upload.

## After migrating

The app degrades gracefully if a migration has not run yet:

- `getProducts()` filters by `category_id` when available, falls back to the
  legacy `category` string, and applies `is_active = true` only when that column
  exists (one-time auto-detect, then cached).
- `recordProductView()` swallows the error if the RPC is missing.
- Null `price` renders as "Request price / استعلام قیمت" regardless.
