-- Medoria — Migration 54: product documents live in PRIVATE storage and are served only through the application (review R1)
--
-- Why: migration 48's documents were uploaded to the houses' PUBLIC image buckets (product-images, beauty-product-images, folder documents/).
-- Hiding a document, letting it expire or archiving its product only hid the LISTING; anybody who knew the object's address kept getting the
-- file. A storage object cannot be protected by a table policy.
--
-- What:
--   * two PRIVATE buckets — product-documents (Health) and beauty-product-documents (Beauty) — limited to 15 MB of application/pdf where the
--     storage version has those columns. No policy of storage.objects names them, so anon / authenticated can neither list nor read them; only the
--     application's service-role client can, and it does so behind a route that checks, at the moment of each request, who is asking and whether
--     the document is public right now (published, not expired, active parent, not a variant) or the asker is a signed-in person of that house with
--     the right to see documents.
--   * public_product_documents / public_beauty_product_documents no longer return `file_path` (nothing public needs a storage path now); the page
--     links to /api/documents/<house>/<id>.
--   * public_product_document_visible / public_beauty_product_document_visible(id) → boolean: the single SQL statement of "is this document public
--     right now", used by the route (anonymous callers learn nothing else).
--   * a self-check that refuses to finish if any policy on storage.objects could expose the private buckets.
--
-- Needs 48 (the document tables). Existing document files, if migration 48 was ever applied and used, are still in the OLD public bucket
-- (folder documents/): this migration says so with a WARNING and does not touch them (docs/PANEL_PRODUCT_DOCUMENTS.md, "Moving files").
-- One transaction, idempotent. Rollback: DROP the two *_visible functions, recreate the two list functions of migration 48 (with file_path), and
-- (only if no document file is in them) DELETE FROM storage.buckets WHERE id IN ('product-documents','beauty-product-documents').
-- The application of this release uses the private buckets: do not roll the database back without rolling the application back.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.product_documents') IS NULL OR to_regclass('public.beauty_product_documents') IS NULL THEN
    RAISE EXCEPTION 'migration 54 needs migration 48 first (the product document tables are missing)';
  END IF;
  IF to_regclass('storage.buckets') IS NULL THEN
    RAISE EXCEPTION 'migration 54 needs the storage schema (storage.buckets)';
  END IF;
END $$;

-- ── the private buckets ────────────────────────────────────────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public) VALUES
  ('product-documents', 'product-documents', false),
  ('beauty-product-documents', 'beauty-product-documents', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'storage' AND table_name = 'buckets' AND column_name = 'file_size_limit') THEN
    UPDATE storage.buckets SET file_size_limit = 15728640 WHERE id IN ('product-documents', 'beauty-product-documents');
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'storage' AND table_name = 'buckets' AND column_name = 'allowed_mime_types') THEN
    UPDATE storage.buckets SET allowed_mime_types = ARRAY['application/pdf'] WHERE id IN ('product-documents', 'beauty-product-documents');
  END IF;
END $$;

-- ── the public side: no storage path, one visibility rule ─────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.public_product_documents(BIGINT);
CREATE FUNCTION public.public_product_documents(p_product BIGINT)
RETURNS TABLE (id BIGINT, kind TEXT, title TEXT, lang TEXT, valid_until DATE, file_size INT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT d.id, d.kind, d.title, d.lang, d.valid_until, d.file_size
    FROM public.product_documents d
    JOIN public.products p ON p.id = d.product_id
   WHERE d.product_id = p_product
     AND d.is_published
     AND (d.valid_until IS NULL OR d.valid_until >= (NOW() AT TIME ZONE 'Asia/Dushanbe')::date)
     AND p.is_active
     AND (to_jsonb(p) ->> 'variant_of') IS NULL
   ORDER BY d.sort_order, d.id
   LIMIT 50;
$$;
REVOKE ALL ON FUNCTION public.public_product_documents(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_product_documents(BIGINT) TO anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.public_beauty_product_documents(BIGINT);
CREATE FUNCTION public.public_beauty_product_documents(p_product BIGINT)
RETURNS TABLE (id BIGINT, kind TEXT, title TEXT, lang TEXT, valid_until DATE, file_size INT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT d.id, d.kind, d.title, d.lang, d.valid_until, d.file_size
    FROM public.beauty_product_documents d
    JOIN public.beauty_products p ON p.id = d.product_id
   WHERE d.product_id = p_product
     AND d.is_published
     AND (d.valid_until IS NULL OR d.valid_until >= (NOW() AT TIME ZONE 'Asia/Dushanbe')::date)
     AND p.is_active
     AND (to_jsonb(p) ->> 'variant_of') IS NULL
   ORDER BY d.sort_order, d.id
   LIMIT 50;
$$;
REVOKE ALL ON FUNCTION public.public_beauty_product_documents(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_beauty_product_documents(BIGINT) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.public_product_document_visible(p_id BIGINT) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.product_documents d JOIN public.products p ON p.id = d.product_id
     WHERE d.id = p_id AND d.is_published
       AND (d.valid_until IS NULL OR d.valid_until >= (NOW() AT TIME ZONE 'Asia/Dushanbe')::date)
       AND p.is_active AND (to_jsonb(p) ->> 'variant_of') IS NULL);
$$;
CREATE OR REPLACE FUNCTION public.public_beauty_product_document_visible(p_id BIGINT) RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.beauty_product_documents d JOIN public.beauty_products p ON p.id = d.product_id
     WHERE d.id = p_id AND d.is_published
       AND (d.valid_until IS NULL OR d.valid_until >= (NOW() AT TIME ZONE 'Asia/Dushanbe')::date)
       AND p.is_active AND (to_jsonb(p) ->> 'variant_of') IS NULL);
$$;
REVOKE ALL ON FUNCTION public.public_product_document_visible(BIGINT), public.public_beauty_product_document_visible(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_product_document_visible(BIGINT), public.public_beauty_product_document_visible(BIGINT) TO anon, authenticated, service_role;

-- ── self-check ────────────────────────────────────────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  pol record;
  n int;
BEGIN
  IF (SELECT count(*) FROM storage.buckets WHERE id IN ('product-documents', 'beauty-product-documents') AND public = false) <> 2 THEN
    RAISE EXCEPTION 'migration 54 self-check: the document buckets are not both private';
  END IF;
  -- a policy that lets the public API roles read storage objects without naming a bucket (or naming ours) would expose the files
  FOR pol IN SELECT policyname, qual, roles FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND cmd IN ('SELECT', 'ALL') LOOP
    IF (pol.roles && ARRAY['public', 'anon', 'authenticated']::name[])
       AND (pol.qual IS NULL OR pol.qual = 'true' OR pol.qual !~ 'bucket_id' OR pol.qual ~ 'product-documents') THEN
      RAISE EXCEPTION 'migration 54 self-check: storage policy "%" could expose the private document buckets; narrow it to a bucket_id first', pol.policyname;
    END IF;
  END LOOP;
  IF has_function_privilege('anon', 'public.public_product_documents(bigint)', 'EXECUTE') = false THEN
    RAISE EXCEPTION 'migration 54 self-check: the public list function must stay executable by anon';
  END IF;
  EXECUTE 'SELECT (SELECT count(*) FROM public.product_documents) + (SELECT count(*) FROM public.beauty_product_documents)' INTO n;
  IF n > 0 THEN
    RAISE WARNING 'migration 54: % document row(s) already exist. Their files are in the OLD public image bucket (folder documents/) and are still publicly readable there until you move them to the private bucket and delete the old copy (docs/PANEL_PRODUCT_DOCUMENTS.md, "Moving files").', n;
  END IF;
END $$;

COMMIT;
