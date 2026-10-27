-- ════════════════════════════════════════════════════════════════════════════
-- Medoria — Migration 39: scheduled publishing of products (Health + Beauty)
--
-- New columns on products and beauty_products:
--   publish_at    when an archived (inactive) product should go live; the scheduler sets is_active = true and clears the value
--   unpublish_at  when a live product should be archived;           the scheduler sets is_active = false and clears the value
--
-- Nothing is published by the database itself: a host cron calls POST /api/internal/scheduled-publishing (docs/SCHEDULED_PUBLISHING.md),
-- which applies every due schedule, records it in the product history and the activity log and refreshes the public pages.
-- Without the cron the dates simply wait. Columns only: no row is deleted and no existing value is changed. One transaction;
-- idempotent; a self-check at the end aborts (rolls back) on any mismatch. The public read policies of the product tables are untouched
-- (the new columns are not secret; they only say when a product will change).
--
-- Rollback: ALTER TABLE products DROP COLUMN publish_at, DROP COLUMN unpublish_at;  (same for beauty_products; DROP the two indexes first)
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.products') IS NULL OR to_regclass('public.beauty_products') IS NULL THEN
    RAISE EXCEPTION 'migration 39 needs the product tables (products, beauty_products)';
  END IF;
END $$;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS publish_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS unpublish_at TIMESTAMPTZ;
ALTER TABLE public.beauty_products
  ADD COLUMN IF NOT EXISTS publish_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS unpublish_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS products_publish_at_idx ON public.products (publish_at) WHERE publish_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS products_unpublish_at_idx ON public.products (unpublish_at) WHERE unpublish_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS beauty_products_publish_at_idx ON public.beauty_products (publish_at) WHERE publish_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS beauty_products_unpublish_at_idx ON public.beauty_products (unpublish_at) WHERE unpublish_at IS NOT NULL;

-- self-check
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['products', 'beauty_products'] LOOP
    IF (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name IN ('publish_at', 'unpublish_at')) <> 2 THEN
      RAISE EXCEPTION 'migration 39 self-check failed: columns missing on %', t;
    END IF;
  END LOOP;
END $$;

COMMIT;
