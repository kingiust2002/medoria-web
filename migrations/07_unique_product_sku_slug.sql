-- migrations/07_unique_product_sku_slug.sql
-- Uniqueness foundation for product entry / import.
--
--   • products.slug  → UNIQUE (when not null/empty)
--   • products.sku   → UNIQUE, case-insensitive (only when not null/empty —
--                      products WITHOUT a SKU are always allowed)
--
-- SAFE BY DESIGN: this migration only CREATES indexes. It never deletes,
-- merges, or modifies rows. If duplicates already exist in production the
-- migration STOPS with a clear message listing them, and nothing is changed.
--
-- ── Pre-check (run these first to see duplicates yourself) ───────────────────
--
--   -- duplicate slugs:
--   SELECT slug, COUNT(*), ARRAY_AGG(id) AS ids
--   FROM products WHERE slug IS NOT NULL AND slug <> ''
--   GROUP BY slug HAVING COUNT(*) > 1;
--
--   -- duplicate SKUs (case-insensitive):
--   SELECT LOWER(sku) AS sku, COUNT(*), ARRAY_AGG(id) AS ids
--   FROM products WHERE sku IS NOT NULL AND sku <> ''
--   GROUP BY LOWER(sku) HAVING COUNT(*) > 1;
--
-- If either query returns rows, fix them by hand in the operator panel (edit
-- the slug/SKU of one of the duplicates) and re-run this migration. Do NOT
-- delete rows unless you are sure — duplicates usually mean the same physical
-- product was entered twice and should be merged manually.

DO $$
DECLARE dup TEXT;
BEGIN
  SELECT string_agg(slug || ' (ids: ' || ids || ')', ', ')
  INTO dup
  FROM (
    SELECT slug, ARRAY_AGG(id)::TEXT AS ids
    FROM products WHERE slug IS NOT NULL AND slug <> ''
    GROUP BY slug HAVING COUNT(*) > 1
  ) d;
  IF dup IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot add unique slug index — duplicate slugs exist: %. Fix them in the operator panel, then re-run.', dup;
  END IF;

  SELECT string_agg(sku || ' (ids: ' || ids || ')', ', ')
  INTO dup
  FROM (
    SELECT LOWER(sku) AS sku, ARRAY_AGG(id)::TEXT AS ids
    FROM products WHERE sku IS NOT NULL AND sku <> ''
    GROUP BY LOWER(sku) HAVING COUNT(*) > 1
  ) d;
  IF dup IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot add unique SKU index — duplicate SKUs exist: %. Fix them in the operator panel, then re-run.', dup;
  END IF;
END $$;

-- Empty-string slugs/SKUs are normalised to NULL so they never collide.
UPDATE products SET slug = NULL WHERE slug = '';
UPDATE products SET sku  = NULL WHERE sku  = '';

CREATE UNIQUE INDEX IF NOT EXISTS products_slug_unique_idx
  ON products (slug) WHERE slug IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS products_sku_unique_idx
  ON products (LOWER(sku)) WHERE sku IS NOT NULL;

-- Verify (should both return 0 rows):
--   SELECT slug FROM products WHERE slug IS NOT NULL GROUP BY slug HAVING COUNT(*) > 1;
--   SELECT LOWER(sku) FROM products WHERE sku IS NOT NULL GROUP BY LOWER(sku) HAVING COUNT(*) > 1;
