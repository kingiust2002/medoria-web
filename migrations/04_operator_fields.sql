-- ════════════════════════════════════════════════════════════════════════════
-- Medoria — Migration 04: operator-panel fields (products + categories)
--   • products.is_active        → soft show/hide (archive instead of delete)
--   • products.tags             → optional keyword tags
--   • products.seo_title/desc   → optional SEO overrides
--   • categories.is_active      → soft show/hide
--   • categories.is_featured    → highlight on the public homepage
--   • set_updated_at() trigger  → bumps products.updated_at on every UPDATE
-- Purely additive + idempotent. Safe to re-run. Does NOT delete or modify data.
-- Run AFTER 01/02/03.
-- ════════════════════════════════════════════════════════════════════════════

-- ── products ────────────────────────────────────────────────────────────────
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_active       BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE products ADD COLUMN IF NOT EXISTS tags            TEXT[];
ALTER TABLE products ADD COLUMN IF NOT EXISTS seo_title       TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS seo_description TEXT;

CREATE INDEX IF NOT EXISTS idx_products_is_active ON products (is_active);

-- ── categories ──────────────────────────────────────────────────────────────
ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_active   BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT false;

-- ── updated_at auto-touch ───────────────────────────────────────────────────
-- products.updated_at already exists (from supabase-migration.sql) but nothing
-- bumps it on UPDATE. This trigger makes the operator "recently updated" sort real.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_updated_at ON products;
CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Verify ──────────────────────────────────────────────────────────────────
-- SELECT id, sku, is_active, tags, updated_at FROM products ORDER BY updated_at DESC LIMIT 5;
-- SELECT slug, is_active, is_featured FROM categories ORDER BY sort_order;
