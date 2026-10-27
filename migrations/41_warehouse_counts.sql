-- ════════════════════════════════════════════════════════════════════════════
-- Medoria — Migration 41: warehouse stock counts and minimum levels (Health + Beauty)
--
--   health_/beauty_stock_levels       a minimum quantity per product (all warehouses together); below it the product is flagged "low"
--   health_/beauty_stock_counts       a physical count of ONE warehouse: open → closed | cancelled (once); only one open count per warehouse
--   health_/beauty_stock_count_lines  per product: what the system expected when the count started, and what was counted
--
-- Closing a count posts the differences through the ledger functions of migration 36 (nothing here changes a balance by itself);
-- a closed or cancelled count and its lines are frozen. Private like the rest of the warehouse: RLS on, no policy, nothing for
-- anon / authenticated; service_role reads and writes these workspace tables (never the ledger, which stays function-only).
-- Needs migration 36. One transaction; idempotent; a self-check at the end aborts (rolls back) on any mismatch.
--
-- Rollback (only after the deployed code no longer uses it):
--   DROP TABLE public.health_stock_count_lines, public.health_stock_counts, public.health_stock_levels;  (same for beauty_*)
--   DROP FUNCTION public.stock_count_guard(), public.stock_count_line_guard();
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.health_stock_locations') IS NULL OR to_regclass('public.beauty_stock_locations') IS NULL THEN
    RAISE EXCEPTION 'migration 41 needs migration 36 first (the warehouse tables are missing)';
  END IF;
END $$;

-- a count is decided once: open → closed | cancelled; nothing about it changes afterwards, and it is never deleted
CREATE OR REPLACE FUNCTION public.stock_count_guard() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'stock:never_deleted' USING ERRCODE = 'P0001'; END IF;
  IF OLD.status <> 'open' THEN RAISE EXCEPTION 'stock:count_closed' USING ERRCODE = 'P0001'; END IF;
  IF NEW.location_id <> OLD.location_id OR NEW.created_at <> OLD.created_at OR NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'stock:count_closed' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.stock_count_guard() FROM PUBLIC, anon, authenticated;

DO $mig$
DECLARE h TEXT;
BEGIN
  FOREACH h IN ARRAY ARRAY['health', 'beauty'] LOOP
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS public.%1$s_stock_levels (
        product_id    BIGINT PRIMARY KEY,
        min_level     NUMERIC(14,3) NOT NULL CHECK (min_level >= 0 AND min_level <= 99999999),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_by    UUID REFERENCES public.operator_users (id),
        updated_label TEXT CHECK (updated_label IS NULL OR char_length(updated_label) <= 80)
      )$f$, h);
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS public.%1$s_stock_counts (
        id            BIGSERIAL PRIMARY KEY,
        location_id   BIGINT NOT NULL REFERENCES public.%1$s_stock_locations (id) ON DELETE RESTRICT,
        status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),
        note          TEXT CHECK (note IS NULL OR char_length(note) <= 300),
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_by    UUID REFERENCES public.operator_users (id),
        created_label TEXT CHECK (created_label IS NULL OR char_length(created_label) <= 80),
        closed_at     TIMESTAMPTZ,
        closed_by     UUID REFERENCES public.operator_users (id),
        closed_label  TEXT CHECK (closed_label IS NULL OR char_length(closed_label) <= 80),
        differences   INT CHECK (differences IS NULL OR differences >= 0),
        CONSTRAINT %1$s_stock_counts_closed CHECK ((status = 'open') = (closed_at IS NULL))
      )$f$, h);
    EXECUTE format('CREATE UNIQUE INDEX IF NOT EXISTS %1$s_stock_counts_one_open ON public.%1$s_stock_counts (location_id) WHERE status = ''open''', h);
    EXECUTE format($f$
      CREATE TABLE IF NOT EXISTS public.%1$s_stock_count_lines (
        count_id      BIGINT NOT NULL REFERENCES public.%1$s_stock_counts (id) ON DELETE RESTRICT,
        product_id    BIGINT NOT NULL,
        sku           TEXT CHECK (sku IS NULL OR char_length(sku) <= 80),
        expected      NUMERIC(14,3) NOT NULL CHECK (expected >= 0),
        counted       NUMERIC(14,3) CHECK (counted IS NULL OR (counted >= 0 AND counted <= 99999999)),
        counted_at    TIMESTAMPTZ,
        counted_label TEXT CHECK (counted_label IS NULL OR char_length(counted_label) <= 80),
        PRIMARY KEY (count_id, product_id)
      )$f$, h);

    EXECUTE format($f$
      CREATE OR REPLACE FUNCTION public.%1$s_stock_count_line_guard() RETURNS trigger
      LANGUAGE plpgsql AS $b$
      DECLARE v_status TEXT; v_count BIGINT;
      BEGIN
        v_count := CASE WHEN TG_OP = 'DELETE' THEN OLD.count_id ELSE NEW.count_id END;
        SELECT status INTO v_status FROM public.%1$s_stock_counts WHERE id = v_count FOR SHARE;   -- serialises with the close
        IF v_status IS DISTINCT FROM 'open' THEN RAISE EXCEPTION 'stock:count_closed' USING ERRCODE = 'P0001'; END IF;
        IF TG_OP = 'UPDATE' AND (NEW.expected <> OLD.expected OR NEW.product_id <> OLD.product_id OR NEW.count_id <> OLD.count_id) THEN
          RAISE EXCEPTION 'stock:count_closed' USING ERRCODE = 'P0001';
        END IF;
        RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
      END $b$$f$, h);
    EXECUTE format('REVOKE ALL ON FUNCTION public.%1$s_stock_count_line_guard() FROM PUBLIC, anon, authenticated', h);
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_stock_count_line_guard ON public.%1$s_stock_count_lines', h);
    EXECUTE format('CREATE TRIGGER %1$s_stock_count_line_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%1$s_stock_count_lines FOR EACH ROW EXECUTE FUNCTION public.%1$s_stock_count_line_guard()', h);
    EXECUTE format('DROP TRIGGER IF EXISTS %1$s_stock_counts_guard ON public.%1$s_stock_counts', h);
    EXECUTE format('CREATE TRIGGER %1$s_stock_counts_guard BEFORE UPDATE OR DELETE ON public.%1$s_stock_counts FOR EACH ROW EXECUTE FUNCTION public.stock_count_guard()', h);

    EXECUTE format('ALTER TABLE public.%1$s_stock_levels ENABLE ROW LEVEL SECURITY', h);
    EXECUTE format('ALTER TABLE public.%1$s_stock_counts ENABLE ROW LEVEL SECURITY', h);
    EXECUTE format('ALTER TABLE public.%1$s_stock_count_lines ENABLE ROW LEVEL SECURITY', h);
    EXECUTE format('REVOKE ALL ON public.%1$s_stock_levels, public.%1$s_stock_counts, public.%1$s_stock_count_lines FROM PUBLIC, anon, authenticated, service_role', h);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%1$s_stock_levels, public.%1$s_stock_count_lines TO service_role', h);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%1$s_stock_counts TO service_role', h);
    EXECUTE format('GRANT USAGE ON SEQUENCE public.%1$s_stock_counts_id_seq TO service_role', h);
  END LOOP;
END $mig$;

-- self-check
DO $$
DECLARE h TEXT; t TEXT;
BEGIN
  FOREACH h IN ARRAY ARRAY['health', 'beauty'] LOOP
    FOREACH t IN ARRAY ARRAY['stock_levels', 'stock_counts', 'stock_count_lines'] LOOP
      IF to_regclass('public.' || h || '_' || t) IS NULL THEN RAISE EXCEPTION 'migration 41 self-check failed: % is missing', h || '_' || t; END IF;
      IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = ('public.' || h || '_' || t)::regclass) THEN RAISE EXCEPTION 'migration 41 self-check failed: row-level security is off on %', h || '_' || t; END IF;
      IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = h || '_' || t) THEN RAISE EXCEPTION 'migration 41 self-check failed: % has a policy', h || '_' || t; END IF;
      IF has_table_privilege('anon', 'public.' || h || '_' || t, 'SELECT') OR has_table_privilege('authenticated', 'public.' || h || '_' || t, 'SELECT') THEN
        RAISE EXCEPTION 'migration 41 self-check failed: anon/authenticated can reach %', h || '_' || t;
      END IF;
      IF NOT has_table_privilege('service_role', 'public.' || h || '_' || t, 'SELECT') THEN RAISE EXCEPTION 'migration 41 self-check failed: service_role cannot read %', h || '_' || t; END IF;
    END LOOP;
    IF has_table_privilege('service_role', 'public.' || h || '_stock_counts', 'DELETE') THEN RAISE EXCEPTION 'migration 41 self-check failed: service_role can delete counts'; END IF;
  END LOOP;
END $$;

COMMIT;
