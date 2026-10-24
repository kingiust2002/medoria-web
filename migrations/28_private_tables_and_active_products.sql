-- 28_private_tables_and_active_products.sql
-- Customer-data protection + archived-product visibility, as ONE all-or-nothing
-- transaction. Idempotent: safe to re-run. Removes policies and table privileges
-- only; no table DATA is read, changed or deleted. Runbook §23.
--
-- Builds on 27 (which production already has, applied by hand on 2026-10-20) and
-- makes the result independent of policy NAMES, so an old or renamed policy can
-- no longer defeat the restriction (permissive policies are OR-ed together: one
-- leftover `USING (true)` policy on `products` re-exposes archived rows).
--
-- 1) PRIVATE TABLES (Health and Beauty customer requests, import logs): only the
--    server may touch them, with the service-role key (it bypasses RLS and is
--    re-granted below). Every policy is dropped and anon / authenticated / PUBLIC
--    lose every table privilege, a second lock on top of RLS.
-- 2) PRODUCTS: public read only for active rows, as the single policy.
--
-- Preconditions: migration 04 applied (products.is_active). Take a fresh backup
-- first (runbook §23.6).

BEGIN;

DO $$
DECLARE
  t text;
  r record;
  private_tables text[] := ARRAY[
    'quote_requests', 'beauty_quote_requests', 'contact_inquiries',
    'import_logs', 'beauty_import_logs'
  ];
BEGIN
  FOREACH t IN ARRAY private_tables LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'skipping % (table does not exist)', t;
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    FOR r IN SELECT policyname FROM pg_policies
             WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, t);
    END LOOP;
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
  END LOOP;
END $$;

DO $$
DECLARE
  r record;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'is_active'
  ) THEN
    RAISE EXCEPTION 'products.is_active is missing: apply migration 04 first';
  END IF;

  ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
  FOR r IN SELECT policyname FROM pg_policies
           WHERE schemaname = 'public' AND tablename = 'products' LOOP
    EXECUTE format('DROP POLICY %I ON public.products', r.policyname);
  END LOOP;
  CREATE POLICY "products_public_read" ON public.products
    FOR SELECT USING (is_active = true);
END $$;

-- Self-check: any failure here aborts the whole transaction and nothing changes.
DO $$
DECLARE
  t text;
  private_tables text[] := ARRAY[
    'quote_requests', 'beauty_quote_requests', 'contact_inquiries',
    'import_logs', 'beauty_import_logs'
  ];
BEGIN
  FOREACH t IN ARRAY private_tables LOOP
    CONTINUE WHEN to_regclass('public.' || t) IS NULL;
    IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t) THEN
      RAISE EXCEPTION 'policy still present on %', t;
    END IF;
    IF has_table_privilege('anon', 'public.' || t, 'SELECT')
       OR has_table_privilege('authenticated', 'public.' || t, 'SELECT') THEN
      RAISE EXCEPTION 'anon/authenticated can still SELECT %', t;
    END IF;
    IF NOT has_table_privilege('service_role', 'public.' || t, 'SELECT, INSERT, UPDATE, DELETE') THEN
      RAISE EXCEPTION 'service_role lost access to %', t;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'products') <> 1 THEN
    RAISE EXCEPTION 'products must have exactly one policy';
  END IF;
END $$;

COMMIT;

-- Verify (run after COMMIT):
--   SELECT tablename, policyname, cmd, qual FROM pg_policies
--   WHERE schemaname = 'public'
--     AND tablename IN ('products','quote_requests','beauty_quote_requests',
--                       'contact_inquiries','import_logs','beauty_import_logs');
--   -- expect exactly ONE row: products | products_public_read | SELECT | (is_active = true)
--   SELECT has_table_privilege('anon', 'public.quote_requests', 'SELECT');          -- false
--   SELECT has_table_privilege('authenticated', 'public.beauty_quote_requests', 'SELECT'); -- false
--   SELECT has_table_privilege('service_role', 'public.quote_requests', 'SELECT');  -- true
--
-- Rollback (restores the previous permissive state; use only if the app breaks):
--   BEGIN;
--   GRANT ALL ON TABLE public.quote_requests, public.beauty_quote_requests,
--     public.contact_inquiries, public.import_logs, public.beauty_import_logs
--     TO anon, authenticated;
--   DROP POLICY IF EXISTS "products_public_read" ON public.products;
--   CREATE POLICY "products_public_read" ON public.products FOR SELECT USING (true);
--   COMMIT;
-- (The app itself never needs anon/authenticated access to the private tables;
--  rolling back only makes sense to rule this migration out while debugging.)
