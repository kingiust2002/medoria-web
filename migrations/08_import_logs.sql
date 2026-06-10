-- migrations/08_import_logs.sql
-- Lightweight history of operator bulk/file imports. Service-role only:
-- RLS is enabled with NO public policies, so the anon key can neither read
-- nor write — only the operator panel (service-role, server-side) touches it.
CREATE TABLE IF NOT EXISTS import_logs (
  id                 BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source             TEXT NOT NULL DEFAULT 'csv',   -- csv | bulk
  file_name          TEXT,
  mode               TEXT,                          -- add | update | upsert
  total_rows         INTEGER NOT NULL DEFAULT 0,
  created_count      INTEGER NOT NULL DEFAULT 0,
  updated_count      INTEGER NOT NULL DEFAULT 0,
  skipped_count      INTEGER NOT NULL DEFAULT 0,
  error_count        INTEGER NOT NULL DEFAULT 0,
  categories_created INTEGER NOT NULL DEFAULT 0,
  summary            TEXT
);

CREATE INDEX IF NOT EXISTS idx_import_logs_created ON import_logs (created_at DESC);

ALTER TABLE import_logs ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: anon/authenticated get nothing; service-role bypasses RLS.
