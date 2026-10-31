-- ════════════════════════════════════════════════════════════════════════════
-- Medoria — Migration 44: product variants (Health + Beauty)
--
-- A VARIANT is a product row of its own that points at its parent product:
--   products.variant_of        the parent product (NULL for an ordinary product); a variant cannot have variants, and a product that has
--                              variants cannot become one; the parent cannot be changed afterwards; the parent cannot be deleted while it has
--                              variants (ON DELETE RESTRICT)
--   products.variant_options   what makes this variant different: {"size": "M", "colour": "blue"} (a variant has at least one option)
--   products.variant_sort      order of the variants on the product page
-- Because a variant is a normal row it has its OWN SKU (the existing case-insensitive unique index covers parents and variants together),
-- its own price or "price on request", image, stock flag, active flag, history and approvals — and the internal warehouse, which keys stock
-- by product id, and customer requests (which store product id / SKU / name) work for a variant with no change.
--
-- PUBLIC SITE: the public read policy now also requires `variant_of IS NULL`, so a variant never appears in a list, a search, the sitemap,
-- compare or wish list, and never as a page of its own. The product page reads the variants of an ACTIVE parent through
-- public_product_variants(parent) / public_beauty_product_variants(parent): SECURITY DEFINER, only active variants of an active parent,
-- only public columns.
--
-- Adds three columns, two constraints, one trigger and one function per table, replaces the single public policy of each table with the
-- same policy plus `variant_of IS NULL`; no row, value or grant of an existing object changes. Needs the product tables (and migration 04
-- is_active). One transaction, idempotent, self-checking (aborts and rolls back on any mismatch). Until the release that uses it is live
-- nothing reads the new columns.
--
-- Rollback (only after the deployed code no longer uses variants, and only when no variant rows exist or they may be removed):
--   DELETE FROM public.products WHERE variant_of IS NOT NULL;   DELETE FROM public.beauty_products WHERE variant_of IS NOT NULL;
--   DROP FUNCTION IF EXISTS public.public_product_variants(bigint), public.public_beauty_product_variants(bigint), public.public_variant_items(bigint[]);
--   DROP TRIGGER IF EXISTS products_variant_guard ON public.products;  DROP TRIGGER IF EXISTS beauty_products_variant_guard ON public.beauty_products;
--   DROP FUNCTION IF EXISTS public.products_variant_guard(), public.beauty_products_variant_guard();
--   ALTER TABLE public.products DROP COLUMN variant_of, DROP COLUMN variant_options, DROP COLUMN variant_sort;   (same for beauty_products)
--   DROP POLICY "products_public_read" ON public.products;  CREATE POLICY "products_public_read" ON public.products FOR SELECT USING (is_active = true);
--   DROP POLICY "beauty_products_public_read" ON public.beauty_products;  CREATE POLICY "beauty_products_public_read" ON public.beauty_products FOR SELECT USING (is_active = true);
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE t TEXT; c TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['products', 'beauty_products'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION 'migration 44 needs the table public.%', t;
    END IF;
    FOREACH c IN ARRAY ARRAY['id', 'sku', 'is_active', 'price', 'in_stock', 'image_url', 'unit', 'name_en', 'name_ru', 'name_tg', 'name_fa', 'min_order_qty', 'brand', 'category'] LOOP
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = c) THEN
        RAISE EXCEPTION 'migration 44 needs the column %.%', t, c;
      END IF;
    END LOOP;
  END LOOP;
END $$;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS variant_of BIGINT REFERENCES public.products (id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS variant_options JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS variant_sort INT NOT NULL DEFAULT 0;
ALTER TABLE public.beauty_products
  ADD COLUMN IF NOT EXISTS variant_of BIGINT REFERENCES public.beauty_products (id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS variant_options JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS variant_sort INT NOT NULL DEFAULT 0;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['products', 'beauty_products'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = ('public.' || t)::regclass AND conname = t || '_variant_shape') THEN
      EXECUTE format($f$ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (
        (variant_of IS NULL AND variant_options = '{}'::jsonb)
        OR (variant_of IS NOT NULL AND variant_of <> id AND sku IS NOT NULL AND btrim(sku) <> '' AND jsonb_typeof(variant_options) = 'object'
            AND variant_options <> '{}'::jsonb AND pg_column_size(variant_options) <= 2000)
      )$f$, t, t || '_variant_shape');
    END IF;
  END LOOP;
END $$;

CREATE INDEX IF NOT EXISTS products_variant_of_idx ON public.products (variant_of, variant_sort, id) WHERE variant_of IS NOT NULL;
CREATE INDEX IF NOT EXISTS beauty_products_variant_of_idx ON public.beauty_products (variant_of, variant_sort, id) WHERE variant_of IS NOT NULL;

-- the rules that need other rows
CREATE OR REPLACE FUNCTION public.products_variant_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE parent_variant BIGINT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.variant_of IS NULL AND NEW.variant_of IS NOT NULL THEN
      RAISE EXCEPTION 'variant:cannot_become_variant' USING ERRCODE = 'P0001';          -- an existing product (with its history, stock, requests) is never turned into a variant
    END IF;
    IF OLD.variant_of IS NOT NULL AND NEW.variant_of IS DISTINCT FROM OLD.variant_of THEN
      RAISE EXCEPTION 'variant:parent_is_fixed' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF NEW.variant_of IS NOT NULL THEN
    SELECT p.variant_of INTO parent_variant FROM public.products p WHERE p.id = NEW.variant_of;
    IF NOT FOUND THEN RAISE EXCEPTION 'variant:parent_missing' USING ERRCODE = 'P0001'; END IF;
    IF parent_variant IS NOT NULL THEN RAISE EXCEPTION 'variant:parent_is_variant' USING ERRCODE = 'P0001'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.beauty_products_variant_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE parent_variant BIGINT;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.variant_of IS NULL AND NEW.variant_of IS NOT NULL THEN
      RAISE EXCEPTION 'variant:cannot_become_variant' USING ERRCODE = 'P0001';
    END IF;
    IF OLD.variant_of IS NOT NULL AND NEW.variant_of IS DISTINCT FROM OLD.variant_of THEN
      RAISE EXCEPTION 'variant:parent_is_fixed' USING ERRCODE = 'P0001';
    END IF;
  END IF;
  IF NEW.variant_of IS NOT NULL THEN
    SELECT p.variant_of INTO parent_variant FROM public.beauty_products p WHERE p.id = NEW.variant_of;
    IF NOT FOUND THEN RAISE EXCEPTION 'variant:parent_missing' USING ERRCODE = 'P0001'; END IF;
    IF parent_variant IS NOT NULL THEN RAISE EXCEPTION 'variant:parent_is_variant' USING ERRCODE = 'P0001'; END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.products_variant_guard() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.beauty_products_variant_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS products_variant_guard ON public.products;
CREATE TRIGGER products_variant_guard BEFORE INSERT OR UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.products_variant_guard();
DROP TRIGGER IF EXISTS beauty_products_variant_guard ON public.beauty_products;
CREATE TRIGGER beauty_products_variant_guard BEFORE INSERT OR UPDATE ON public.beauty_products FOR EACH ROW EXECUTE FUNCTION public.beauty_products_variant_guard();

-- a product that already has variants cannot become a variant (the other direction of the rule above is covered by "cannot_become_variant")

-- public read: ordinary, active products only. The same single policy as before plus `variant_of IS NULL`.
DO $$
DECLARE r record;
BEGIN
  ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'products' LOOP
    EXECUTE format('DROP POLICY %I ON public.products', r.policyname);
  END LOOP;
  CREATE POLICY "products_public_read" ON public.products FOR SELECT USING (is_active = true AND variant_of IS NULL);
  ALTER TABLE public.beauty_products ENABLE ROW LEVEL SECURITY;
  FOR r IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'beauty_products' LOOP
    EXECUTE format('DROP POLICY %I ON public.beauty_products', r.policyname);
  END LOOP;
  CREATE POLICY "beauty_products_public_read" ON public.beauty_products FOR SELECT USING (is_active = true AND variant_of IS NULL);
END $$;

-- the product page's way to the variants of ONE active product (only active variants, only public columns)
CREATE OR REPLACE FUNCTION public.public_product_variants(p_parent BIGINT)
RETURNS TABLE (id BIGINT, sku TEXT, options JSONB, price NUMERIC, currency TEXT, unit TEXT, in_stock BOOLEAN, image_url TEXT, sort INT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
  SELECT v.id, v.sku, v.variant_options, v.price, v.currency, v.unit, v.in_stock, v.image_url, v.variant_sort
  FROM public.products v JOIN public.products p ON p.id = v.variant_of
  WHERE v.variant_of = p_parent AND v.is_active = true AND p.is_active = true AND p.variant_of IS NULL
  ORDER BY v.variant_sort, v.id
  LIMIT 100
$$;
CREATE OR REPLACE FUNCTION public.public_beauty_product_variants(p_parent BIGINT)
RETURNS TABLE (id BIGINT, sku TEXT, options JSONB, price NUMERIC, unit TEXT, in_stock BOOLEAN, image_url TEXT, sort INT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
  SELECT v.id, v.sku, v.variant_options, v.price, v.unit, v.in_stock, v.image_url, v.variant_sort
  FROM public.beauty_products v JOIN public.beauty_products p ON p.id = v.variant_of
  WHERE v.variant_of = p_parent AND v.is_active = true AND p.is_active = true AND p.variant_of IS NULL
  ORDER BY v.variant_sort, v.id
  LIMIT 100
$$;
-- the inquiry list (Health) holds ids, some of which are variants: the same public columns, plus the parent's address for the link
CREATE OR REPLACE FUNCTION public.public_variant_items(p_ids BIGINT[])
RETURNS TABLE (id BIGINT, sku TEXT, name_en TEXT, name_ru TEXT, name_tg TEXT, name_fa TEXT, price NUMERIC, currency TEXT, unit TEXT, in_stock BOOLEAN,
               image_url TEXT, min_order_qty INT, brand TEXT, category TEXT, options JSONB, parent_id BIGINT, parent_slug TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_catalog AS $$
  SELECT v.id, v.sku, v.name_en, v.name_ru, v.name_tg, v.name_fa, v.price, v.currency, v.unit, v.in_stock,
         COALESCE(NULLIF(v.image_url, ''), p.image_url), v.min_order_qty, v.brand, v.category, v.variant_options, p.id, p.slug
  FROM public.products v JOIN public.products p ON p.id = v.variant_of
  WHERE v.id = ANY (p_ids[1:30]) AND v.is_active = true AND p.is_active = true AND p.variant_of IS NULL
$$;
REVOKE ALL ON FUNCTION public.public_product_variants(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_variant_items(bigint[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.public_beauty_product_variants(bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_product_variants(bigint) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.public_variant_items(bigint[]) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.public_beauty_product_variants(bigint) TO anon, authenticated, service_role;

-- self-check
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['products', 'beauty_products'] LOOP
    IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = t) <> 1 THEN
      RAISE EXCEPTION 'migration 44 self-check failed: % must have exactly one policy', t;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t AND cmd = 'SELECT' AND qual LIKE '%variant_of IS NULL%' AND qual LIKE '%is_active = true%') THEN
      RAISE EXCEPTION 'migration 44 self-check failed: the public policy of % does not hide variants', t;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = ('public.' || t)::regclass AND tgname = t || '_variant_guard' AND NOT tgisinternal) THEN
      RAISE EXCEPTION 'migration 44 self-check failed: the guard trigger of % is missing', t;
    END IF;
    IF has_function_privilege('anon', ('public.' || t || '_variant_guard()')::regprocedure, 'EXECUTE') THEN
      RAISE EXCEPTION 'migration 44 self-check failed: anon can execute the guard of %', t;
    END IF;
  END LOOP;
  IF NOT has_function_privilege('anon', 'public.public_product_variants(bigint)', 'EXECUTE') OR NOT has_function_privilege('anon', 'public.public_beauty_product_variants(bigint)', 'EXECUTE') OR NOT has_function_privilege('anon', 'public.public_variant_items(bigint[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'migration 44 self-check failed: the product page cannot read its variants';
  END IF;
END $$;

COMMIT;
