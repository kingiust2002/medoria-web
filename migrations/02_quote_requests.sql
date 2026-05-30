-- ════════════════════════════════════════════════════════════════════════════
-- Medoria — Migration 02: quote_requests table
-- Stores B2B inquiry submissions. Replaces/augments the older
-- `contact_inquiries` table with the fields the quote form needs,
-- including the preferred contact channel (whatsapp | telegram | phone).
-- Idempotent: safe to re-run.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS quote_requests (
  id               BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  created_at       TIMESTAMPTZ DEFAULT NOW(),

  -- Who is asking
  name             TEXT NOT NULL,
  phone            TEXT,
  organization     TEXT,            -- clinic / pharmacy / hospital / distributor

  -- What they're asking about (product optional → general procurement list)
  product_id       BIGINT REFERENCES products(id) ON DELETE SET NULL,
  product_name     TEXT,            -- denormalized snapshot (survives product edits)
  product_sku      TEXT,
  quantity         INTEGER,

  -- Message + routing
  message          TEXT,
  preferred_contact TEXT NOT NULL DEFAULT 'whatsapp'
                    CHECK (preferred_contact IN ('whatsapp','telegram','phone')),
  language         TEXT,            -- ru | tg | en | fa

  -- Ops
  status           TEXT NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new','contacted','quoted','closed'))
);

CREATE INDEX IF NOT EXISTS idx_quote_requests_created ON quote_requests (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quote_requests_status  ON quote_requests (status);

-- ── RLS: anyone may submit (public form); only authenticated may read ────────
ALTER TABLE quote_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quote_requests_public_insert" ON quote_requests;
CREATE POLICY "quote_requests_public_insert" ON quote_requests
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "quote_requests_auth_read" ON quote_requests;
CREATE POLICY "quote_requests_auth_read" ON quote_requests
  FOR SELECT USING (auth.role() = 'authenticated');

-- ── Verify ──────────────────────────────────────────────────────────────────
-- INSERT INTO quote_requests (name, phone, preferred_contact, language)
-- VALUES ('Test Clinic', '+992900000000', 'whatsapp', 'fa');
-- SELECT * FROM quote_requests ORDER BY created_at DESC LIMIT 5;
