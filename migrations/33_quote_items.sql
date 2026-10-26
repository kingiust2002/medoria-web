-- ════════════════════════════════════════════════════════════════════════════
-- Medoria — Migration 33: several products in one customer request (Health + Beauty)
--
-- Adds `items jsonb` to quote_requests and beauty_quote_requests: an array of
--   { "product_id": 12, "sku": "ABC-1", "name": "…", "quantity": 50 }
-- written by the server action only, with name and SKU read from the products table
-- (never taken from the browser). NULL = a single-product / general request, as before.
--
-- • Adds one nullable column and one CHECK per table (array, at most 30 entries, at most 20000
--   characters). No row is read, changed or deleted; no grant or policy is touched, so the
--   private-table lock-down of migrations 27/28 is unchanged.
-- • One transaction, idempotent, tables that do not exist are skipped, self-checking.
-- • Until this runs the forms keep working: the server action retries without the column and
--   puts the product list into the message text instead.
--
-- Rollback (loses the structured list only; the product_name summary and message stay):
--   ALTER TABLE quote_requests DROP CONSTRAINT IF EXISTS quote_requests_items_check;
--   ALTER TABLE quote_requests DROP COLUMN IF EXISTS items;
--   (same for beauty_quote_requests)
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $do$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['quote_requests', 'beauty_quote_requests'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'skipping %: table does not exist', t;
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS items jsonb', t);
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS %I', t, t || '_items_check');
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (items IS NULL OR (jsonb_typeof(items) = ''array'' AND jsonb_array_length(items) <= 30 AND length(items::text) <= 20000))',
      t, t || '_items_check');
  END LOOP;
END $do$;

-- self-check: the column and the constraint exist, bad values are refused, public roles still have no grants
DO $do$
DECLARE
  t text;
  leaked int;
BEGIN
  FOREACH t IN ARRAY ARRAY['quote_requests', 'beauty_quote_requests'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'items' AND data_type = 'jsonb') THEN
      RAISE EXCEPTION 'migration 33 self-check failed for %: no items jsonb column', t;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = ('public.' || t)::regclass AND conname = t || '_items_check') THEN
      RAISE EXCEPTION 'migration 33 self-check failed for %: no items check', t;
    END IF;
    SELECT count(*) INTO leaked FROM information_schema.role_table_grants
      WHERE table_schema = 'public' AND table_name = t AND grantee IN ('PUBLIC', 'anon', 'authenticated');
    IF leaked > 0 THEN RAISE EXCEPTION 'migration 33 self-check failed for %: a public role has table grants', t; END IF;
  END LOOP;
END $do$;

COMMIT;

-- Verify (read-only):
--   SELECT id, product_name, items FROM quote_requests WHERE items IS NOT NULL ORDER BY id DESC LIMIT 5;
