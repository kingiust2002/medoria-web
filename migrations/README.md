# Database migrations

Run these in the **Supabase SQL editor**, in order, **after** the repo's existing
`supabase-migration.sql` and `supabase-migration-phase2.sql`. Every file is
idempotent (safe to re-run).

| Order | File | Adds |
|-------|------|------|
| 1 | `01_categories_and_category_id.sql` | `categories.id` surrogate key, `products.category_id` FK + backfill from slug, index, de-emojified category icons |
| 2 | `02_quote_requests.sql` | `quote_requests` table with public-insert / auth-read RLS |
| 3 | `03_sort_and_price_fields.sql` | `products.created_at`, `products.views`, nullable `price`, `increment_product_views()` RPC |

## How to run

1. Open your Supabase project → **SQL Editor** → **New query**.
2. Paste the contents of `01_…`, run it, then verify the bottom comment query
   (no `category_id IS NULL` rows; fix any product whose `category` slug has no
   matching `categories.slug`).
3. Repeat for `02_…` and `03_…`.

> ⚠️ Do **not** run these against production without an explicit go-ahead and a
> backup. They were authored against the schema created by the two original
> `supabase-migration*.sql` files.

## After migrating

The app degrades gracefully if a migration has not run yet:

- `getProducts()` filters by `category_id` when available and falls back to the
  legacy `category` string otherwise.
- `recordProductView()` swallows the error if the `increment_product_views` RPC
  is missing.
- Null `price` renders as "Request price / استعلام قیمت" regardless.
