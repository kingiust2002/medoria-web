-- ════════════════════════════════════════════════════════════════════════════
-- Medoria — Migration 01: categories.id + products.category_id relation
-- Run in Supabase SQL editor AFTER the existing supabase-migration.sql
-- (which already created the `categories` table keyed by `slug`).
-- Idempotent: safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Give categories a numeric surrogate key (keep slug as the natural key).
--    A FK can reference any UNIQUE column, so we don't have to change the PK.
ALTER TABLE categories
  ADD COLUMN IF NOT EXISTS id BIGINT GENERATED ALWAYS AS IDENTITY;

-- Ensure uniqueness so it can be an FK target.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'categories_id_key'
  ) THEN
    ALTER TABLE categories ADD CONSTRAINT categories_id_key UNIQUE (id);
  END IF;
END $$;

-- 2) Add the relation column to products.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS category_id BIGINT;

-- 3) Backfill category_id from the existing `category` (slug) string.
UPDATE products p
SET    category_id = c.id
FROM   categories c
WHERE  p.category = c.slug
  AND  p.category_id IS DISTINCT FROM c.id;

-- 4) Add the foreign key (NOT VALID first to avoid locking; then validate).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'products_category_id_fkey'
  ) THEN
    ALTER TABLE products
      ADD CONSTRAINT products_category_id_fkey
      FOREIGN KEY (category_id) REFERENCES categories(id)
      ON DELETE SET NULL
      NOT VALID;
    ALTER TABLE products VALIDATE CONSTRAINT products_category_id_fkey;
  END IF;
END $$;

-- 5) Index for fast category filtering.
CREATE INDEX IF NOT EXISTS idx_products_category_id ON products (category_id);

-- 6) De-emojify the seeded category icons → Lucide icon names that match
--    components/shared/Icon.jsx (brand rule: no emoji in premium chrome).
--    The app already renders icons from the i18n CATEGORIES map, so this only
--    keeps the DB consistent for any admin/back-office surface. Idempotent.
UPDATE categories SET icon = 'gloves'      WHERE slug = 'gloves';
UPDATE categories SET icon = 'mask'        WHERE slug = 'masks';
UPDATE categories SET icon = 'stethoscope' WHERE slug = 'instruments';
UPDATE categories SET icon = 'bandage'     WHERE slug = 'wound';
UPDATE categories SET icon = 'thermometer' WHERE slug = 'diagnostics';
UPDATE categories SET icon = 'flask'       WHERE slug = 'lab';

-- 7) (Optional, do LATER once code no longer reads the string column.)
--    Keep `category` for one release for safety. When ready:
-- ALTER TABLE products DROP COLUMN category;

-- ── Verify ──────────────────────────────────────────────────────────────────
-- SELECT p.sku, p.category, p.category_id, c.slug
-- FROM products p LEFT JOIN categories c ON c.id = p.category_id
-- ORDER BY p.id LIMIT 20;
-- Any row with category_id IS NULL means its `category` string had no matching slug.
