-- ════════════════════════════════════════════════════════════════════════════
-- Medoria — Migration 11: Beauty BRANDS (the "Maisons" directory).
-- A first-class, operator-managed brand table so the public "Brands" section
-- can show real houses with the OFFICIAL logo the operator uploads (never a
-- scraped or AI-faked mark). Brand → products is the existing text join:
-- beauty_products.brand matches beauty_brands.name (brand names are not
-- translated, per localization law). Idempotent; additive; touches only
-- beauty_* objects.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) beauty_brands ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS beauty_brands (
  id            BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  slug          TEXT NOT NULL UNIQUE,          -- url key, e.g. 'la-prairie'
  name          TEXT NOT NULL,                 -- canonical Latin house name; matches beauty_products.brand
  tagline_tg    TEXT,                          -- optional one-line editorial note (per locale)
  tagline_ru    TEXT,
  tagline_en    TEXT,
  tagline_fa    TEXT,
  logo_url      TEXT,                          -- OFFICIAL logo the operator uploaded (or full https URL)
  website       TEXT,                          -- optional official site link
  sort_order    INT NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  is_featured   BOOLEAN NOT NULL DEFAULT false,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_beauty_brands_sort   ON beauty_brands (sort_order);
CREATE INDEX IF NOT EXISTS idx_beauty_brands_active ON beauty_brands (is_active);
-- Case-insensitive lookup by name (join to products.brand).
CREATE INDEX IF NOT EXISTS idx_beauty_brands_name_lower ON beauty_brands (LOWER(name));

-- ── 2) Row Level Security ────────────────────────────────────────────────────
-- Public (anon) reads only active brands; all writes are server-side with the
-- service role (bypasses RLS), exactly like beauty_categories.
ALTER TABLE beauty_brands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "beauty_brands_public_read" ON beauty_brands;
CREATE POLICY "beauty_brands_public_read" ON beauty_brands
  FOR SELECT USING (is_active = true);

-- ── 3) Storage bucket for official brand logos ───────────────────────────────
-- Separate bucket; public read, server-side (service role) writes only.
-- NOTE: if policy creation errors with "must be owner of table objects",
-- create the bucket + read policy from Dashboard → Storage instead.
INSERT INTO storage.buckets (id, name, public)
VALUES ('beauty-brand-logos', 'beauty-brand-logos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "beauty_brand_logos_public_read" ON storage.objects;
CREATE POLICY "beauty_brand_logos_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'beauty-brand-logos');

-- ── Verify ──────────────────────────────────────────────────────────────────
-- SELECT slug, name, is_active, is_featured, sort_order FROM beauty_brands ORDER BY sort_order;
-- SELECT id, public FROM storage.buckets WHERE id = 'beauty-brand-logos';
-- SELECT policyname FROM pg_policies WHERE tablename = 'beauty_brands';
