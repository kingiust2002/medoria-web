-- ════════════════════════════════════════════════════════════════════════════
-- Medoria v2 — Supabase migration
-- Run this in Supabase SQL Editor
-- It safely adds new columns and the Persian/SKU/brand/featured fields.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Add new columns (safe — only adds if missing) ──────────────────────────
ALTER TABLE products ADD COLUMN IF NOT EXISTS name_fa        TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS description_fa TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS slug           TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS sku            TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS brand          TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS min_order_qty  INT DEFAULT 1;
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_featured    BOOLEAN DEFAULT false;
ALTER TABLE products ADD COLUMN IF NOT EXISTS gallery_urls   TEXT[];
ALTER TABLE products ADD COLUMN IF NOT EXISTS specs          JSONB;
ALTER TABLE products ADD COLUMN IF NOT EXISTS brochure_url   TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMP DEFAULT NOW();

-- ── Create index for fast search & sort ────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_products_category   ON products (category);
CREATE INDEX IF NOT EXISTS idx_products_in_stock   ON products (in_stock);
CREATE INDEX IF NOT EXISTS idx_products_featured   ON products (is_featured);
CREATE INDEX IF NOT EXISTS idx_products_sku        ON products (sku);

-- ── (Optional) categories table ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categories (
  slug TEXT PRIMARY KEY,
  name_ru TEXT,
  name_tg TEXT,
  name_en TEXT,
  name_fa TEXT,
  description_ru TEXT,
  description_tg TEXT,
  description_en TEXT,
  description_fa TEXT,
  icon TEXT,
  image_url TEXT,
  sort_order INT DEFAULT 0
);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "categories_public_read" ON categories;
CREATE POLICY "categories_public_read" ON categories FOR SELECT USING (true);

-- Seed categories
INSERT INTO categories (slug, name_ru, name_tg, name_en, name_fa, icon, sort_order) VALUES
  ('gloves',      'Перчатки',       'Дастпӯш',         'Gloves',             'دستکش',         '🧤', 1),
  ('masks',       'Маски и защита', 'Ниқоб ва ҳифоз',  'Masks & Protection', 'ماسک و محافظت',  '😷', 2),
  ('instruments', 'Инструменты',    'Асбобҳо',         'Instruments',        'ابزار پزشکی',    '🩺', 3),
  ('wound',       'Перевязочные',   'Бандубаст',       'Wound Care',         'زخم‌بندی',       '🩹', 4),
  ('diagnostics', 'Диагностика',    'Ташхис',          'Diagnostics',        'تشخیص',         '🌡️', 5),
  ('lab',         'Лаборатория',    'Лаборатория',     'Lab Supplies',       'آزمایشگاهی',    '🧪', 6)
ON CONFLICT (slug) DO NOTHING;

-- ── Make sure public read policy exists on products ────────────────────────
DROP POLICY IF EXISTS "products_public_read" ON products;
CREATE POLICY "products_public_read" ON products
  FOR SELECT USING (true);

-- ── Done ───────────────────────────────────────────────────────────────────
-- Refresh table editor in Supabase dashboard to see new fields.
