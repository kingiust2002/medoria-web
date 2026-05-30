-- ════════════════════════════════════════════════════════════════════════════
-- Medoria — Migration 03: sort + price fields
--   • created_at  → enables the "newest" sort
--   • views       → enables the "popular" sort
--   • price nullable → enables "Request price / استعلام قیمت"
-- Idempotent: safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

-- Newest sort
ALTER TABLE products ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Popular sort (incremented on product-detail view; see lib/supabase.js)
ALTER TABLE products ADD COLUMN IF NOT EXISTS views INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_products_created_at ON products (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_views      ON products (views DESC);

-- Make price nullable → NULL means "price on request"
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'products' AND column_name = 'price' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE products ALTER COLUMN price DROP NOT NULL;
  END IF;
END $$;

-- Atomic view increment used by recordProductView() in the data layer.
CREATE OR REPLACE FUNCTION increment_product_views(p_id BIGINT)
RETURNS void LANGUAGE sql AS $$
  UPDATE products SET views = views + 1 WHERE id = p_id;
$$;

-- ── Verify ──────────────────────────────────────────────────────────────────
-- SELECT id, sku, price, views, created_at FROM products ORDER BY created_at DESC LIMIT 5;
-- UPDATE products SET price = NULL WHERE sku = 'SOME-SKU';  -- test "request price"
