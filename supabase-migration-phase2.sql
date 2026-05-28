-- ════════════════════════════════════════════════════════════════════════════
-- Medoria v2 — Phase 2 migration
-- Run this AFTER supabase-migration.sql
-- ════════════════════════════════════════════════════════════════════════════

-- Safe to re-run: all statements use IF NOT EXISTS

-- Make sure gallery_urls exists (was added in phase 1, just in case)
ALTER TABLE products ADD COLUMN IF NOT EXISTS gallery_urls TEXT[];
ALTER TABLE products ADD COLUMN IF NOT EXISTS specs        JSONB;
ALTER TABLE products ADD COLUMN IF NOT EXISTS brochure_url TEXT;

-- Index on brand for filter
CREATE INDEX IF NOT EXISTS idx_products_brand ON products (brand);

-- ── Optional: contact_inquiries table for storing form submissions ──────────
-- (currently form sends via WhatsApp, but you can enable Supabase storage too)
CREATE TABLE IF NOT EXISTS contact_inquiries (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  created_at TIMESTAMP DEFAULT NOW(),
  name TEXT NOT NULL,
  organization TEXT,
  phone TEXT,
  email TEXT,
  subject TEXT,
  message TEXT NOT NULL,
  language TEXT,
  status TEXT DEFAULT 'new'
);

ALTER TABLE contact_inquiries ENABLE ROW LEVEL SECURITY;

-- Allow anyone to INSERT (public form), but only auth can read
DROP POLICY IF EXISTS "contact_public_insert" ON contact_inquiries;
CREATE POLICY "contact_public_insert" ON contact_inquiries
  FOR INSERT WITH CHECK (true);

-- ── Sample products with gallery for testing (optional) ─────────────────────
-- Uncomment to insert demo products:
-- INSERT INTO products (name_ru, name_tg, name_en, name_fa, description_ru, category, price, unit, in_stock, badge, sku, brand, is_featured)
-- VALUES
--   ('Перчатки нитриловые',  'Дастпӯши нитрилӣ', 'Nitrile gloves',  'دستکش نیتریل', 'Смотровые нитриловые перчатки без пудры',  'gloves', 8.50, '× 100', true, 'TOP', 'GLV-001', 'MediCare', true),
--   ('Маска медицинская 3-х слойная', 'Ниқоби тиббии 3-қабата', '3-ply medical mask', 'ماسک پزشکی ۳ لایه', 'Одноразовая защитная маска', 'masks', 4.20, '× 50', true, 'NEW', 'MSK-002', 'SafeWear', true),
--   ('Шприц 5мл одноразовый',  'Шприци 5мл якдафъаина', '5ml disposable syringe', 'سرنگ ۵cc یکبار مصرف', 'Стерильный одноразовый шприц с иглой', 'instruments', 0.18, 'pcs', true, NULL, 'SYR-005', 'MedTech', true);

-- ── Done ────────────────────────────────────────────────────────────────────
