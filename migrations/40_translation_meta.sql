-- ════════════════════════════════════════════════════════════════════════════
-- Medoria — Migration 40: translation status of product texts (Health + Beauty)
--
-- New column on products and beauty_products:
--   translation_meta JSONB NOT NULL DEFAULT '{}'   which texts were written by the automatic translator and not yet read by a person,
--                                                  e.g. {"name_tg":"auto","description_ru":"auto"}. A text that is not listed is human
--                                                  (typed, edited after the translation, or there from before this feature): the panel's
--                                                  "translate" button never overwrites it.
--
-- Column only: no row is deleted and no existing value is changed; every existing text counts as human. One transaction; idempotent; a
-- self-check at the end aborts (rolls back) on any mismatch. The public read policies are untouched.
-- Rollback: ALTER TABLE products DROP COLUMN translation_meta;  (same for beauty_products)
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.products') IS NULL OR to_regclass('public.beauty_products') IS NULL THEN
    RAISE EXCEPTION 'migration 40 needs the product tables (products, beauty_products)';
  END IF;
END $$;

ALTER TABLE public.products ADD COLUMN IF NOT EXISTS translation_meta JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.beauty_products ADD COLUMN IF NOT EXISTS translation_meta JSONB NOT NULL DEFAULT '{}'::jsonb;
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['products', 'beauty_products'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = ('public.' || t)::regclass AND conname = t || '_translation_meta_object') THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (jsonb_typeof(translation_meta) = ''object'' AND pg_column_size(translation_meta) <= 2048)', t, t || '_translation_meta_object');
    END IF;
  END LOOP;
END $$;

-- self-check
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['products', 'beauty_products'] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'translation_meta' AND is_nullable = 'NO') THEN
      RAISE EXCEPTION 'migration 40 self-check failed: translation_meta missing on %', t;
    END IF;
  END LOOP;
END $$;

COMMIT;
