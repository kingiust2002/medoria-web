-- 27_security_policy_cleanup.sql
-- Applied to PRODUCTION on 2026-10-20 (Supabase Studio SQL editor). Runbook §23.3.
-- Idempotent: safe to re-run. Removes policies only; no table data is touched.
--
-- Why: a database built from migrations 01-26 would otherwise recreate policies
-- that production no longer has.
--   * quote_requests_auth_read  (migration 02) let ANY signed-in Supabase user
--     read every quote request. The app reads quotes with the service-role key.
--   * quote_requests_public_insert / contact_public_insert were already removed
--     in production (step 3 of migration 09); repeated here so a fresh restore
--     matches production.
--   * products had two "public read" policies with USING (true), which exposed
--     archived (is_active = false) products through the public API. Beauty
--     already filters on is_active in its own policies.
-- The operator panels use the service-role key and are not affected.

-- 1) quote requests: no direct public or signed-in access at all
DROP POLICY IF EXISTS "quote_requests_auth_read"     ON public.quote_requests;
DROP POLICY IF EXISTS "quote_requests_public_insert" ON public.quote_requests;
DROP POLICY IF EXISTS "contact_public_insert"        ON public.contact_inquiries;

-- 2) products: public read only for active rows
BEGIN;
DROP POLICY IF EXISTS "Allow public read"     ON public.products;
DROP POLICY IF EXISTS "products_public_read"  ON public.products;
CREATE POLICY "products_public_read" ON public.products
  FOR SELECT USING (is_active = true);
COMMIT;

-- Verify:
--   SELECT tablename, policyname, cmd, qual FROM pg_policies
--   WHERE tablename IN ('products', 'quote_requests', 'contact_inquiries');
--   -- expect: one row, products / products_public_read / SELECT / (is_active = true)
--
-- Rollback (production, if ever needed):
--   CREATE POLICY "quote_requests_auth_read" ON public.quote_requests
--     FOR SELECT USING (auth.role() = 'authenticated');
--   DROP POLICY IF EXISTS "products_public_read" ON public.products;
--   CREATE POLICY "Allow public read"    ON public.products FOR SELECT USING (true);
--   CREATE POLICY "products_public_read" ON public.products FOR SELECT USING (true);
