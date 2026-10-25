-- ════════════════════════════════════════════════════════════════════════════
-- Medoria — Migration 31: public read of categories and brands = ACTIVE rows only
--
-- Found in the 2026-10 security review: Health `categories` kept the first policy
-- ever written ("categories_public_read … USING (true)"), so a category the
-- operator had switched OFF (is_active = false) was still readable by anyone with
-- the public key through the API, even though the site itself hides it. Products got
-- the same fix in migrations 27/28. This does it for the three category/brand tables:
--
--   categories        (Health)   → exactly one policy, SELECT … USING (is_active = true)
--   beauty_categories (Beauty)   → same (already the case since migration 10; re-asserted)
--   beauty_brands     (Beauty)   → same (already the case since migration 11; re-asserted)
--
-- Expected effect for visitors: none for active categories; an inactive category (and, because
-- the site already prunes an inactive parent's subtree, everything below it) is not returned by
-- the API any more. The operator panels read with the service role and still see everything.
--
-- One transaction. Touches policies only: no row, column or grant is read or changed. Idempotent.
-- Tables or columns that do not exist are skipped. A self-check at the end aborts (rolls back)
-- unless each table has exactly one policy and it is the active-only SELECT policy.
--
-- Rollback (Health only; restores "everything is public"):
--   DROP POLICY categories_public_read ON public.categories;
--   CREATE POLICY categories_public_read ON public.categories FOR SELECT USING (true);
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  t text;
  p record;
BEGIN
  FOREACH t IN ARRAY ARRAY['categories', 'beauty_categories', 'beauty_brands'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'skipping %: table does not exist', t;
      CONTINUE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = t AND column_name = 'is_active') THEN
      RAISE EXCEPTION 'public.%.is_active is missing: run migration 04 (Health) / 10-11 (Beauty) first; nothing was changed', t;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, t);
    END LOOP;
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT USING (is_active = true)', t || '_public_read', t);
  END LOOP;
END $$;

-- self-check: one policy per table, a SELECT policy, restricted to active rows
DO $$
DECLARE
  t text;
  n int;
  q text;
  c text;
BEGIN
  FOREACH t IN ARRAY ARRAY['categories', 'beauty_categories', 'beauty_brands'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN CONTINUE; END IF;
    SELECT count(*), max(qual), max(cmd) INTO n, q, c FROM pg_policies WHERE schemaname = 'public' AND tablename = t;
    IF n <> 1 OR c <> 'SELECT' OR q NOT LIKE '%is_active%' THEN
      RAISE EXCEPTION 'migration 31 self-check failed for %: % polic(ies), cmd %, qual %', t, n, c, q;
    END IF;
  END LOOP;
END $$;

COMMIT;

-- Verify (read-only):
--   SELECT tablename, policyname, cmd, qual FROM pg_policies
--   WHERE schemaname = 'public' AND tablename IN ('categories','beauty_categories','beauty_brands');
--   -- with the public (anon) key:   GET /rest/v1/categories?is_active=eq.false   →   []
