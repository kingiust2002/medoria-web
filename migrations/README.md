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
