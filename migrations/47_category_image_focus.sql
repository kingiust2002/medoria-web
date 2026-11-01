-- ════════════════════════════════════════════════════════════════════════════
-- Medoria — Migration 47: focal point for category tile images (N7), both houses
--
--   public.categories.image_focus        the focal point of the Health category image
--   public.beauty_categories.image_focus the focal point of the Beauty category image
--
-- A category tile shows its image cropped to a fixed box (CSS object-fit: cover). The focal point decides WHICH part of the image
-- stays inside that box — stored as a plain CSS `object-position` value "NN% MM%" (two integers 0–100; e.g. "50% 50%" is the centre).
-- NULL means the default centre. The value is only a framing hint rendered into a `style`; it is never used in an href/src. A CHECK
-- keeps the format strict so nothing else can ever be stored in a field that reaches the public page. The images themselves are not
-- cut or re-encoded (there is no image pipeline); the focal point is a non-destructive framing choice.
--
-- Public tables: anon already reads these rows; the new column is public-readable like the other display columns. Nothing private here.
-- Additive (ADD COLUMN IF NOT EXISTS); one transaction; idempotent; a self-check at the end aborts (rolls back) on any mismatch.
-- Needs the base schema (public.categories) and migration 10 (public.beauty_categories).
--
-- Rollback (only after the deployed code no longer reads it):
--   ALTER TABLE public.categories        DROP COLUMN IF EXISTS image_focus;
--   ALTER TABLE public.beauty_categories DROP COLUMN IF EXISTS image_focus;
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.categories') IS NULL THEN
    RAISE EXCEPTION 'migration 47 needs the base schema first (public.categories is missing)';
  END IF;
  IF to_regclass('public.beauty_categories') IS NULL THEN
    RAISE EXCEPTION 'migration 47 needs migration 10 first (public.beauty_categories is missing)';
  END IF;
END $$;

-- A strict "NN% MM%" framing value, or NULL. Two integers 0–100 joined by a single space, each with a trailing %.
-- Mirrors lib/operator/validation.js focusPoint(); a drift is caught by tests/category-brand-images-migration.test.mjs.
ALTER TABLE public.categories        ADD COLUMN IF NOT EXISTS image_focus TEXT;
ALTER TABLE public.beauty_categories ADD COLUMN IF NOT EXISTS image_focus TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'categories_image_focus_fmt') THEN
    ALTER TABLE public.categories ADD CONSTRAINT categories_image_focus_fmt
      CHECK (image_focus IS NULL OR image_focus ~ '^(0|[1-9][0-9]?|100)% (0|[1-9][0-9]?|100)%$');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'beauty_categories_image_focus_fmt') THEN
    ALTER TABLE public.beauty_categories ADD CONSTRAINT beauty_categories_image_focus_fmt
      CHECK (image_focus IS NULL OR image_focus ~ '^(0|[1-9][0-9]?|100)% (0|[1-9][0-9]?|100)%$');
  END IF;
END $$;

-- self-check
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'categories' AND column_name = 'image_focus') THEN
    RAISE EXCEPTION 'migration 47 self-check failed: categories.image_focus is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'beauty_categories' AND column_name = 'image_focus') THEN
    RAISE EXCEPTION 'migration 47 self-check failed: beauty_categories.image_focus is missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'categories_image_focus_fmt')
     OR NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'beauty_categories_image_focus_fmt') THEN
    RAISE EXCEPTION 'migration 47 self-check failed: the format CHECK is missing';
  END IF;
END $$;

COMMIT;
