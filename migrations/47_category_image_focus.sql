-- ════════════════════════════════════════════════════════════════════════════
-- Medoria — Migration 47: focus point of a category image (both houses)
--
--   public.categories.image_focus_x / image_focus_y          Health
--   public.beauty_categories.image_focus_x / image_focus_y   Beauty
--
-- The point of the picture (0–100 % from the left / the top) that must stay visible when the site crops the image into a tile (CSS
-- object-position). Both are NULL (no choice: the centre is used) or both are whole numbers 0–100. Additive and nullable: no existing row, policy or
-- grant changes — the public read policies are row level only, so the new columns are readable exactly like the others.
-- One transaction; idempotent; a self-check at the end aborts (rolls back) on any mismatch.
--
-- Rollback (only after the deployed code no longer uses it):
--   ALTER TABLE public.categories        DROP CONSTRAINT categories_image_focus_ok,        DROP COLUMN image_focus_x, DROP COLUMN image_focus_y;
--   ALTER TABLE public.beauty_categories DROP CONSTRAINT beauty_categories_image_focus_ok, DROP COLUMN image_focus_x, DROP COLUMN image_focus_y;
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.categories') IS NULL OR to_regclass('public.beauty_categories') IS NULL THEN
    RAISE EXCEPTION 'migration 47 needs the category tables of both houses (categories, beauty_categories)';
  END IF;
END $$;

ALTER TABLE public.categories        ADD COLUMN IF NOT EXISTS image_focus_x SMALLINT, ADD COLUMN IF NOT EXISTS image_focus_y SMALLINT;
ALTER TABLE public.beauty_categories ADD COLUMN IF NOT EXISTS image_focus_x SMALLINT, ADD COLUMN IF NOT EXISTS image_focus_y SMALLINT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'categories_image_focus_ok' AND conrelid = 'public.categories'::regclass) THEN
    ALTER TABLE public.categories ADD CONSTRAINT categories_image_focus_ok CHECK (
      (image_focus_x IS NULL) = (image_focus_y IS NULL) AND (image_focus_x IS NULL OR (image_focus_x BETWEEN 0 AND 100 AND image_focus_y BETWEEN 0 AND 100)));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'beauty_categories_image_focus_ok' AND conrelid = 'public.beauty_categories'::regclass) THEN
    ALTER TABLE public.beauty_categories ADD CONSTRAINT beauty_categories_image_focus_ok CHECK (
      (image_focus_x IS NULL) = (image_focus_y IS NULL) AND (image_focus_x IS NULL OR (image_focus_x BETWEEN 0 AND 100 AND image_focus_y BETWEEN 0 AND 100)));
  END IF;
END $$;

-- self-check
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['categories', 'beauty_categories'] LOOP
    IF (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name IN ('image_focus_x', 'image_focus_y') AND data_type = 'smallint' AND is_nullable = 'YES') <> 2 THEN
      RAISE EXCEPTION 'migration 47 self-check failed: % lacks its focus columns', t;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = t || '_image_focus_ok') THEN
      RAISE EXCEPTION 'migration 47 self-check failed: the focus check of % is missing', t;
    END IF;
  END LOOP;
END $$;

COMMIT;
