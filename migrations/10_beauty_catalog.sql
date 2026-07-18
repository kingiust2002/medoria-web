-- ════════════════════════════════════════════════════════════════════════════
-- Medoria — Migration 10: the ENTIRE Medoria Beauty catalog schema.
-- One consolidated file (Beauty starts fresh, so migrations 01–09 are folded
-- in): tables, indexes, uniqueness, RLS, storage bucket, view-counter RPC and
-- a starter category seed. Idempotent — safe to re-run. Purely additive: it
-- never touches the Health tables (products / categories / quote_requests).
--
-- Taxonomy (mirrors the luxury-retail standard — Sephora / Net-a-Porter):
--   world (fixed top-level department: skincare | makeup | tools; lives in
--   code, pages already exist) → category (unlimited, DB-managed, world-linked)
--   → product (brand is a first-class browse axis on the product row).
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) beauty_categories ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS beauty_categories (
  id              BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  slug            TEXT NOT NULL UNIQUE,
  world           TEXT,                       -- skincare | makeup | tools (app-validated)
  name_tg         TEXT,
  name_ru         TEXT,
  name_en         TEXT,
  name_fa         TEXT,
  description_tg  TEXT,
  description_ru  TEXT,
  description_en  TEXT,
  description_fa  TEXT,
  icon            TEXT,                       -- Lucide icon name (no emoji)
  image_url       TEXT,
  sort_order      INT NOT NULL DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  is_featured     BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_beauty_categories_world ON beauty_categories (world);
CREATE INDEX IF NOT EXISTS idx_beauty_categories_sort  ON beauty_categories (sort_order);

-- ── 2) beauty_products ───────────────────────────────────────────────────────
-- Same column shape as Health's products (post-migration-09), so the proven
-- operator tooling (forms, bulk add, CSV import) works unchanged against it.
CREATE TABLE IF NOT EXISTS beauty_products (
  id              BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  name_tg         TEXT,
  name_ru         TEXT,
  name_en         TEXT,
  name_fa         TEXT,
  description_tg  TEXT,
  description_ru  TEXT,
  description_en  TEXT,
  description_fa  TEXT,

  slug            TEXT,
  sku             TEXT,
  brand           TEXT,                       -- Chanel / Dior / … — browse axis
  category        TEXT,                       -- denormalized category slug
  category_id     BIGINT REFERENCES beauty_categories(id) ON DELETE SET NULL,

  price           NUMERIC,                    -- NULL = price on request
  unit            TEXT,
  min_order_qty   INT DEFAULT 1,
  in_stock        BOOLEAN NOT NULL DEFAULT true,
  badge           TEXT,                       -- NEW | TOP | SALE
  is_featured     BOOLEAN NOT NULL DEFAULT false,
  is_active       BOOLEAN NOT NULL DEFAULT true,

  image_url       TEXT,
  gallery_urls    TEXT[],
  specs           JSONB,                      -- shade / volume / finish / …
  brochure_url    TEXT,
  tags            TEXT[],
  seo_title       TEXT,
  seo_description TEXT,
  views           INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_beauty_products_category_id ON beauty_products (category_id);
CREATE INDEX IF NOT EXISTS idx_beauty_products_brand       ON beauty_products (brand);
CREATE INDEX IF NOT EXISTS idx_beauty_products_is_active   ON beauty_products (is_active);
CREATE INDEX IF NOT EXISTS idx_beauty_products_in_stock    ON beauty_products (in_stock);
CREATE INDEX IF NOT EXISTS idx_beauty_products_featured    ON beauty_products (is_featured);
CREATE INDEX IF NOT EXISTS idx_beauty_products_created_at  ON beauty_products (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_beauty_products_views       ON beauty_products (views DESC);

-- Uniqueness (fresh table — no duplicate pre-check needed, unlike migration 07).
CREATE UNIQUE INDEX IF NOT EXISTS beauty_products_slug_unique_idx
  ON beauty_products (slug) WHERE slug IS NOT NULL AND slug <> '';
CREATE UNIQUE INDEX IF NOT EXISTS beauty_products_sku_unique_idx
  ON beauty_products (LOWER(sku)) WHERE sku IS NOT NULL AND sku <> '';

-- updated_at auto-touch (set_updated_at() already exists from migration 04;
-- re-created here so this file also works on a project without 04).
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_beauty_products_updated_at ON beauty_products;
CREATE TRIGGER trg_beauty_products_updated_at
  BEFORE UPDATE ON beauty_products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 3) beauty_quote_requests ─────────────────────────────────────────────────
-- Born hardened (migration 02 + 05 + 09 in one): length CHECKs from day one,
-- and NO anon insert policy — submissions go through the validated server
-- action with the service-role key, so the direct-API spam vector never opens.
CREATE TABLE IF NOT EXISTS beauty_quote_requests (
  id                BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  name              TEXT NOT NULL,
  phone             TEXT,
  organization      TEXT,                     -- salon / boutique / distributor

  product_id        BIGINT REFERENCES beauty_products(id) ON DELETE SET NULL,
  product_name      TEXT,
  product_sku       TEXT,
  quantity          INTEGER,

  message           TEXT,
  preferred_contact TEXT NOT NULL DEFAULT 'whatsapp'
                    CHECK (preferred_contact IN ('whatsapp','telegram','phone')),
  language          TEXT,
  source_url        TEXT,

  status            TEXT NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new','contacted','in_progress','quoted','closed','spam')),
  internal_notes    TEXT,

  CONSTRAINT beauty_quote_requests_field_lengths CHECK (
    char_length(name)                       <= 200  AND
    char_length(coalesce(phone, ''))        <= 50   AND
    char_length(coalesce(organization, '')) <= 200  AND
    char_length(coalesce(message, ''))      <= 4000 AND
    char_length(coalesce(product_name, '')) <= 300  AND
    char_length(coalesce(product_sku, ''))  <= 120  AND
    char_length(coalesce(language, ''))     <= 8    AND
    char_length(coalesce(source_url, ''))   <= 600
  ),
  CONSTRAINT beauty_quote_requests_quantity_range CHECK (
    quantity IS NULL OR (quantity >= 1 AND quantity <= 1000000)
  )
);

CREATE INDEX IF NOT EXISTS idx_beauty_quotes_created ON beauty_quote_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_beauty_quotes_status  ON beauty_quote_requests (status);

DROP TRIGGER IF EXISTS trg_beauty_quotes_updated_at ON beauty_quote_requests;
CREATE TRIGGER trg_beauty_quotes_updated_at
  BEFORE UPDATE ON beauty_quote_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── 4) beauty_import_logs ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS beauty_import_logs (
  id                 BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source             TEXT NOT NULL DEFAULT 'csv',   -- csv | bulk
  file_name          TEXT,
  mode               TEXT,                          -- add | update | upsert
  total_rows         INTEGER NOT NULL DEFAULT 0,
  created_count      INTEGER NOT NULL DEFAULT 0,
  updated_count      INTEGER NOT NULL DEFAULT 0,
  skipped_count      INTEGER NOT NULL DEFAULT 0,
  error_count        INTEGER NOT NULL DEFAULT 0,
  categories_created INTEGER NOT NULL DEFAULT 0,
  summary            TEXT
);

CREATE INDEX IF NOT EXISTS idx_beauty_import_logs_created ON beauty_import_logs (created_at DESC);

-- ── 5) Row Level Security ────────────────────────────────────────────────────
-- Public (anon) may read ONLY active rows; hidden rows never leak through the
-- API. All writes happen server-side with the service role (bypasses RLS).
ALTER TABLE beauty_categories     ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty_products       ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty_quote_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE beauty_import_logs    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "beauty_categories_public_read" ON beauty_categories;
CREATE POLICY "beauty_categories_public_read" ON beauty_categories
  FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS "beauty_products_public_read" ON beauty_products;
CREATE POLICY "beauty_products_public_read" ON beauty_products
  FOR SELECT USING (is_active = true);

-- beauty_quote_requests + beauty_import_logs: RLS on, NO policies — anon and
-- authenticated get nothing; only the service role (server) touches them.

-- ── 6) Popularity counter RPC ────────────────────────────────────────────────
-- SECURITY DEFINER so the anon key can bump the counter without any UPDATE
-- policy on the table; scoped to active products; search_path pinned.
CREATE OR REPLACE FUNCTION increment_beauty_product_views(p_id BIGINT)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE beauty_products SET views = views + 1
  WHERE id = p_id AND is_active = true;
$$;

REVOKE ALL ON FUNCTION increment_beauty_product_views(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_beauty_product_views(BIGINT) TO anon, authenticated, service_role;

-- ── 7) Storage bucket for Beauty product images ──────────────────────────────
-- Separate from Health's product-images bucket. Public read; writes are
-- server-side with the service role only (no public write policies).
-- NOTE: if policy creation errors with "must be owner of table objects",
-- create the bucket + read policy from Dashboard → Storage instead.
INSERT INTO storage.buckets (id, name, public)
VALUES ('beauty-product-images', 'beauty-product-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "beauty_product_images_public_read" ON storage.objects;
CREATE POLICY "beauty_product_images_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'beauty-product-images');

-- ── 8) Starter categories (editable / hideable in the panel; safe re-run) ────
-- Two-level luxury taxonomy: each category belongs to a world. Names are
-- Tajik-first with Russian / English / Persian. Icons = Lucide names.
INSERT INTO beauty_categories (slug, world, name_tg, name_ru, name_en, name_fa, icon, sort_order) VALUES
  ('cleansers',    'skincare', 'Тозакунандаҳо',       'Очищение',          'Cleansers',        'پاک‌کننده‌ها',      'sparkles', 10),
  ('serums',       'skincare', 'Серумҳо',             'Сыворотки',         'Serums',           'سرم‌ها',           'flask',    20),
  ('moisturizers', 'skincare', 'Намноккунандаҳо',     'Увлажнение',        'Moisturizers',     'مرطوب‌کننده‌ها',    'droplet',  30),
  ('suncare',      'skincare', 'Муҳофизат аз офтоб',  'Солнцезащита',      'Sun Care',         'ضدآفتاب',          'sun',      40),
  ('face-makeup',  'makeup',   'Ороиши рӯй',          'Макияж лица',       'Face Makeup',      'آرایش صورت',       'star',     50),
  ('lip-makeup',   'makeup',   'Ороиши лаб',          'Макияж губ',        'Lip Makeup',       'آرایش لب',         'heart',    60),
  ('eye-makeup',   'makeup',   'Ороиши чашм',         'Макияж глаз',       'Eye Makeup',       'آرایش چشم',        'eye',      70),
  ('fragrance',    'makeup',   'Атриёт',              'Парфюмерия',        'Fragrance',        'عطر',              'wind',     80),
  ('brushes',      'tools',    'Мӯйқаламҳо',          'Кисти',             'Brushes & Applicators', 'براش‌ها',     'edit',     90),
  ('devices',      'tools',    'Дастгоҳҳои зебоӣ',    'Бьюти-девайсы',     'Beauty Devices',   'دستگاه‌های زیبایی', 'settings', 100)
ON CONFLICT (slug) DO NOTHING;

-- ── Verify ──────────────────────────────────────────────────────────────────
-- SELECT slug, world, name_en, is_active FROM beauty_categories ORDER BY sort_order;
-- SELECT COUNT(*) FROM beauty_products;
-- SELECT id, public FROM storage.buckets WHERE id = 'beauty-product-images';
-- SELECT policyname FROM pg_policies WHERE tablename IN ('beauty_products','beauty_categories');
