-- ════════════════════════════════════════════════════════════════════════════
-- Medoria — Migration 09: security hardening for quote_requests
-- Pairs with the app release that moves quote/contact submission to a
-- validated, rate-limited SERVER action (lib/actions/quote.js).
-- Idempotent: safe to re-run. Nothing here is destructive.
-- ════════════════════════════════════════════════════════════════════════════

-- ── 1) Length/sanity CHECK constraints ───────────────────────────────────────
-- The server action enforces the same caps; these make the database the
-- backstop, so even a direct PostgREST insert cannot store megabyte blobs.
-- NOT VALID = enforced for NEW rows only; existing rows are never touched.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quote_requests_field_lengths') THEN
    ALTER TABLE quote_requests
      ADD CONSTRAINT quote_requests_field_lengths CHECK (
        char_length(name)                       <= 200  AND
        char_length(coalesce(phone, ''))        <= 50   AND
        char_length(coalesce(organization, '')) <= 200  AND
        char_length(coalesce(message, ''))      <= 4000 AND
        char_length(coalesce(product_name, '')) <= 300  AND
        char_length(coalesce(product_sku, ''))  <= 120  AND
        char_length(coalesce(language, ''))     <= 8
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quote_requests_quantity_range') THEN
    ALTER TABLE quote_requests
      ADD CONSTRAINT quote_requests_quantity_range CHECK (
        quantity IS NULL OR (quantity >= 1 AND quantity <= 1000000)
      ) NOT VALID;
  END IF;
END $$;

-- ── 2) Query-path indexes (optional but cheap) ───────────────────────────────
-- Public reads filter on is_active and sort featured-first / by views.
CREATE INDEX IF NOT EXISTS idx_products_is_active  ON products (is_active);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products (created_at DESC);

-- ── 3) Close the anonymous-insert door  ⚠ RUN ONLY AFTER DEPLOY ─────────────
-- The browser no longer inserts quote_requests directly: submissions go through
-- the server action, which writes with the SERVICE ROLE key (bypasses RLS).
-- Once that release is LIVE and SUPABASE_SERVICE_ROLE_KEY is set in production,
-- uncomment and run this block. With RLS enabled and no insert policy, the
-- anon key can no longer write to this table at all — killing the direct-API
-- spam vector. (Read access was already restricted to authenticated.)
--
-- DROP POLICY IF EXISTS "quote_requests_public_insert" ON quote_requests;
--
-- The legacy contact_inquiries table (phase 2) also carries a public-insert
-- policy and is no longer written by the app; close it at the same time:
--
-- DROP POLICY IF EXISTS "contact_public_insert" ON contact_inquiries;

-- ── Verify ──────────────────────────────────────────────────────────────────
-- SELECT conname FROM pg_constraint WHERE conrelid = 'quote_requests'::regclass;
-- SELECT policyname FROM pg_policies WHERE tablename = 'quote_requests';
