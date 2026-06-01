-- ════════════════════════════════════════════════════════════════════════════
-- Medoria — Migration 05: quote_requests ops fields
--   • internal_notes  → private operator notes (never shown publicly)
--   • source_url      → page the inquiry came from (if captured)
--   • updated_at      → last status/note change (+ auto-touch trigger)
--   • status set expanded → new, contacted, in_progress, quoted, closed, spam
-- Additive + idempotent. Safe to re-run. Does NOT delete data.
-- Run AFTER 04 (it reuses the set_updated_at() function created there).
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS internal_notes TEXT;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS source_url     TEXT;
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ DEFAULT NOW();

-- Expand the allowed status set (migration 02 created the default-named check).
ALTER TABLE quote_requests DROP CONSTRAINT IF EXISTS quote_requests_status_check;
ALTER TABLE quote_requests
  ADD CONSTRAINT quote_requests_status_check
  CHECK (status IN ('new','contacted','in_progress','quoted','closed','spam'));

-- Bump updated_at on every change (reuses set_updated_at from migration 04).
DROP TRIGGER IF EXISTS trg_quote_requests_updated_at ON quote_requests;
CREATE TRIGGER trg_quote_requests_updated_at
  BEFORE UPDATE ON quote_requests
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Verify ──────────────────────────────────────────────────────────────────
-- SELECT id, name, status, internal_notes, updated_at FROM quote_requests
-- ORDER BY created_at DESC LIMIT 10;
