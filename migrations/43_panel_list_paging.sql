-- ════════════════════════════════════════════════════════════════════════════
-- Medoria — Migration 43: server-side paging of the panel lists (Health + Beauty)
--
--   gap_count(products) / gap_count(beauty_products)
--       "How many things does this product page still lack?" — the SAME rule as lib/operator/completeness.js (image, SKU, category,
--       four names, four descriptions, specs), as a computed column. PostgREST lets the panel filter and sort on it, so the
--       "incomplete / complete" filter works over the WHOLE catalogue instead of over the rows the browser happened to load.
--       Executable by service_role only: the public API cannot ask for it.
--   quote_requests.phone_key / beauty_quote_requests.phone_key
--       The customer-file key (the last 9 digits of the phone number, only when it has at least 7 digits — lib/operator/quoteOps.js
--       phoneKey) as a generated column, so the "other requests of this customer" lookup is one indexed query on the server.
--   indexes for the list sort orders (newest first) of products and requests, and for the request tabs.
--
-- Adds two functions, two generated columns and four indexes; no row is deleted or changed, no policy or grant of an existing object is
-- touched (the request tables stay private: RLS on, no policy). Needs the product and request tables (migrations 01/10/32). One
-- transaction, idempotent, self-checking (aborts and rolls back on any mismatch). Until the release that uses it is live nothing reads
-- these objects; the panel works without it (the completeness filter and the customer file say that migration 43 is missing).
--
-- Rollback (only after the deployed code no longer uses them):
--   DROP FUNCTION IF EXISTS public.gap_count(public.products);  DROP FUNCTION IF EXISTS public.gap_count(public.beauty_products);
--   ALTER TABLE public.quote_requests DROP COLUMN IF EXISTS phone_key;  ALTER TABLE public.beauty_quote_requests DROP COLUMN IF EXISTS phone_key;
--   DROP INDEX IF EXISTS products_updated_idx, beauty_products_updated_idx, quote_requests_status_created_idx, beauty_quote_requests_status_created_idx;
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['products', 'beauty_products', 'quote_requests', 'beauty_quote_requests'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION 'migration 43 needs the table public.% (earlier migrations first)', t;
    END IF;
  END LOOP;
  FOREACH t IN ARRAY ARRAY['image_url','sku','category','category_id','specs','name_fa','name_en','name_ru','name_tg','description_fa','description_en','description_ru','description_tg','updated_at'] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'products' AND column_name = t)
       OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'beauty_products' AND column_name = t) THEN
      RAISE EXCEPTION 'migration 43 needs the column % on products and beauty_products', t;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'quote_requests' AND column_name = 'phone')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'beauty_quote_requests' AND column_name = 'phone') THEN
    RAISE EXCEPTION 'migration 43 needs the phone column of the request tables';
  END IF;
END $$;

-- blank = NULL or only whitespace (lib/operator/completeness.js blank())
CREATE OR REPLACE FUNCTION public.gap_count(p public.products) RETURNS integer
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT (CASE WHEN p.image_url IS NULL OR p.image_url ~ '^\s*$' THEN 1 ELSE 0 END)
       + (CASE WHEN p.sku IS NULL OR p.sku ~ '^\s*$' THEN 1 ELSE 0 END)
       + (CASE WHEN p.category_id IS NULL AND (p.category IS NULL OR p.category ~ '^\s*$') THEN 1 ELSE 0 END)
       + (CASE WHEN p.name_fa IS NULL OR p.name_fa ~ '^\s*$' THEN 1 ELSE 0 END)
       + (CASE WHEN p.name_ru IS NULL OR p.name_ru ~ '^\s*$' THEN 1 ELSE 0 END)
       + (CASE WHEN p.name_tg IS NULL OR p.name_tg ~ '^\s*$' THEN 1 ELSE 0 END)
       + (CASE WHEN p.name_en IS NULL OR p.name_en ~ '^\s*$' THEN 1 ELSE 0 END)
       + (CASE WHEN p.description_fa IS NULL OR p.description_fa ~ '^\s*$' THEN 1 ELSE 0 END)
       + (CASE WHEN p.description_ru IS NULL OR p.description_ru ~ '^\s*$' THEN 1 ELSE 0 END)
       + (CASE WHEN p.description_tg IS NULL OR p.description_tg ~ '^\s*$' THEN 1 ELSE 0 END)
       + (CASE WHEN p.description_en IS NULL OR p.description_en ~ '^\s*$' THEN 1 ELSE 0 END)
       + (CASE WHEN jsonb_typeof(p.specs) = 'object' AND p.specs <> '{}'::jsonb THEN 0 ELSE 1 END)
$$;

CREATE OR REPLACE FUNCTION public.gap_count(p public.beauty_products) RETURNS integer
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT (CASE WHEN p.image_url IS NULL OR p.image_url ~ '^\s*$' THEN 1 ELSE 0 END)
       + (CASE WHEN p.sku IS NULL OR p.sku ~ '^\s*$' THEN 1 ELSE 0 END)
       + (CASE WHEN p.category_id IS NULL AND (p.category IS NULL OR p.category ~ '^\s*$') THEN 1 ELSE 0 END)
       + (CASE WHEN p.name_fa IS NULL OR p.name_fa ~ '^\s*$' THEN 1 ELSE 0 END)
       + (CASE WHEN p.name_ru IS NULL OR p.name_ru ~ '^\s*$' THEN 1 ELSE 0 END)
       + (CASE WHEN p.name_tg IS NULL OR p.name_tg ~ '^\s*$' THEN 1 ELSE 0 END)
       + (CASE WHEN p.name_en IS NULL OR p.name_en ~ '^\s*$' THEN 1 ELSE 0 END)
       + (CASE WHEN p.description_fa IS NULL OR p.description_fa ~ '^\s*$' THEN 1 ELSE 0 END)
       + (CASE WHEN p.description_ru IS NULL OR p.description_ru ~ '^\s*$' THEN 1 ELSE 0 END)
       + (CASE WHEN p.description_tg IS NULL OR p.description_tg ~ '^\s*$' THEN 1 ELSE 0 END)
       + (CASE WHEN p.description_en IS NULL OR p.description_en ~ '^\s*$' THEN 1 ELSE 0 END)
       + (CASE WHEN jsonb_typeof(p.specs) = 'object' AND p.specs <> '{}'::jsonb THEN 0 ELSE 1 END)
$$;

REVOKE ALL ON FUNCTION public.gap_count(public.products) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.gap_count(public.beauty_products) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gap_count(public.products) TO service_role;
GRANT EXECUTE ON FUNCTION public.gap_count(public.beauty_products) TO service_role;

-- the customer-file key: the last 9 digits of the phone number, only for numbers with at least 7 digits
ALTER TABLE public.quote_requests ADD COLUMN IF NOT EXISTS phone_key TEXT GENERATED ALWAYS AS (
  CASE WHEN length(regexp_replace(coalesce(phone, ''), '\D', '', 'g')) >= 7 THEN right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 9) END
) STORED;
ALTER TABLE public.beauty_quote_requests ADD COLUMN IF NOT EXISTS phone_key TEXT GENERATED ALWAYS AS (
  CASE WHEN length(regexp_replace(coalesce(phone, ''), '\D', '', 'g')) >= 7 THEN right(regexp_replace(coalesce(phone, ''), '\D', '', 'g'), 9) END
) STORED;

CREATE INDEX IF NOT EXISTS quote_requests_phone_key_idx ON public.quote_requests (phone_key) WHERE phone_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS beauty_quote_requests_phone_key_idx ON public.beauty_quote_requests (phone_key) WHERE phone_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS products_updated_idx ON public.products (updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS beauty_products_updated_idx ON public.beauty_products (updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS quote_requests_status_created_idx ON public.quote_requests (status, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS beauty_quote_requests_status_created_idx ON public.beauty_quote_requests (status, created_at DESC, id DESC);

-- self-check
DO $$
DECLARE t TEXT;
BEGIN
  IF has_function_privilege('anon', 'public.gap_count(public.products)', 'EXECUTE') OR has_function_privilege('authenticated', 'public.gap_count(public.products)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.gap_count(public.beauty_products)', 'EXECUTE') OR has_function_privilege('authenticated', 'public.gap_count(public.beauty_products)', 'EXECUTE') THEN
    RAISE EXCEPTION 'migration 43 self-check failed: a public role can execute gap_count';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.gap_count(public.products)', 'EXECUTE') OR NOT has_function_privilege('service_role', 'public.gap_count(public.beauty_products)', 'EXECUTE') THEN
    RAISE EXCEPTION 'migration 43 self-check failed: service_role cannot execute gap_count';
  END IF;
  FOREACH t IN ARRAY ARRAY['quote_requests', 'beauty_quote_requests'] LOOP
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'phone_key' AND is_generated = 'ALWAYS') THEN
      RAISE EXCEPTION 'migration 43 self-check failed: % has no generated phone_key', t;
    END IF;
    IF has_table_privilege('anon', 'public.' || t, 'SELECT') OR has_table_privilege('authenticated', 'public.' || t, 'SELECT') THEN
      RAISE EXCEPTION 'migration 43 self-check failed: % became readable by a public role', t;
    END IF;
  END LOOP;
END $$;

COMMIT;
