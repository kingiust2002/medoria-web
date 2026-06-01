-- ════════════════════════════════════════════════════════════════════════════
-- Medoria — Migration 06: Supabase Storage bucket for product images
--   Bucket: product-images (public read)
--   Writes are done SERVER-SIDE with the service-role key (which bypasses RLS),
--   so we deliberately add NO public insert/update/delete policies. The browser
--   / anon role can never modify storage.
-- Idempotent. Safe to re-run.
--
-- NOTE: Some Supabase projects restrict creating storage policies from the SQL
-- editor. If the policy statements error with "must be owner of table objects",
-- create the bucket + read policy from the Dashboard instead — see migrations/
-- README.md → "Storage setup".
-- ════════════════════════════════════════════════════════════════════════════

-- 1) Create the public bucket (no-op if it already exists).
INSERT INTO storage.buckets (id, name, public)
VALUES ('product-images', 'product-images', true)
ON CONFLICT (id) DO NOTHING;

-- 2) Public read of objects in this bucket only.
DROP POLICY IF EXISTS "product_images_public_read" ON storage.objects;
CREATE POLICY "product_images_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'product-images');

-- (No write policies on purpose — uploads use the service role on the server.)

-- ── Verify ──────────────────────────────────────────────────────────────────
-- SELECT id, public FROM storage.buckets WHERE id = 'product-images';
