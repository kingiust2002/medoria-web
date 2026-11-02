-- Medoria — Migration 53: approved deletions that check the reviewed version and delete in ONE transaction
--
-- Why (independent review 2026-10-29, R3 / R9 / R10): an approved deletion used to read the record, compare its version in the
-- application, and only then send a DELETE that was conditioned on the id alone. A change made between the read and the DELETE (for
-- customer requests: an answer; for a category: one product swapped for another; for a brand: any edit) was deleted with it.
-- A category's products were also read through the API, which silently stops at its row cap.
--
-- What: three functions, all callable ONLY with the service-role key (the panels' server code). Each one locks the rows it is about to
-- remove, compares them with the basis the reviewer was shown, and either removes everything or changes nothing:
--
--   operator_delete_quotes_checked(house, ids, versions)     all-or-nothing delete of customer requests whose updated_at is EXACTLY
--                                                            the one in the request (compared as timestamptz: microseconds count)
--   operator_category_basis(house, id)                       read-only: what the category is NOW (row hash, children, every member
--                                                            product with its version, counted inside the database, no row cap)
--   operator_delete_category_checked(house, id, move_to, basis)
--                                                            locks the category, the destination and every member, compares the whole
--                                                            basis, moves the members, deletes the category — or changes nothing
--   operator_delete_brand_checked(id, basis)                 Beauty only: the brand row hash must still be the reviewed one
--
-- Applying this migration is REQUIRED before approved quote / category / brand deletions work: the application fails CLOSED (nothing is
-- deleted, the request stays pending / is marked failed) when the functions are missing. Direct (not approved) deletion of a category
-- or brand uses the same functions with the basis read a moment before, so it also needs this migration.
--
-- Compatible with: migrations 01, 10-12, 20, 32, 37 (the tables and columns it reads). Idempotent (CREATE OR REPLACE).
-- Rollback: DROP FUNCTION public.operator_delete_quotes_checked(text, bigint[], jsonb), public.operator_category_basis(text, bigint),
--           public.operator_delete_category_checked(text, bigint, bigint, jsonb), public.operator_delete_brand_checked(bigint, jsonb);
--           (the application then refuses those deletions; nothing else depends on them)

BEGIN;

-- ── customer requests ────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.operator_delete_quotes_checked(p_house text, p_ids bigint[], p_versions jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ids bigint[];
  v_found int;
  v_bad bigint;
  v_deleted bigint[];
BEGIN
  IF p_house NOT IN ('health', 'beauty') THEN RETURN jsonb_build_object('ok', false, 'reason', 'bad_house'); END IF;
  SELECT COALESCE(array_agg(DISTINCT i ORDER BY i), '{}') INTO v_ids FROM unnest(COALESCE(p_ids, '{}')) AS i;
  IF cardinality(v_ids) = 0 THEN RETURN jsonb_build_object('ok', false, 'reason', 'none'); END IF;

  -- lock every row first, in id order (no deadlock between two overlapping approvals), then judge them
  IF p_house = 'health' THEN
    SELECT count(*) INTO v_found FROM (SELECT id FROM public.quote_requests WHERE id = ANY (v_ids) ORDER BY id FOR UPDATE) l;
  ELSE
    SELECT count(*) INTO v_found FROM (SELECT id FROM public.beauty_quote_requests WHERE id = ANY (v_ids) ORDER BY id FOR UPDATE) l;
  END IF;
  IF v_found <> cardinality(v_ids) THEN RETURN jsonb_build_object('ok', false, 'reason', 'stale', 'missing', cardinality(v_ids) - v_found); END IF;

  IF p_house = 'health' THEN
    SELECT q.id INTO v_bad FROM public.quote_requests q
     WHERE q.id = ANY (v_ids) AND q.updated_at IS DISTINCT FROM NULLIF(p_versions ->> q.id::text, '')::timestamptz
     ORDER BY q.id LIMIT 1;
  ELSE
    SELECT q.id INTO v_bad FROM public.beauty_quote_requests q
     WHERE q.id = ANY (v_ids) AND q.updated_at IS DISTINCT FROM NULLIF(p_versions ->> q.id::text, '')::timestamptz
     ORDER BY q.id LIMIT 1;
  END IF;
  IF v_bad IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'stale', 'changed_id', v_bad); END IF;

  IF p_house = 'health' THEN
    WITH d AS (DELETE FROM public.quote_requests WHERE id = ANY (v_ids) RETURNING id) SELECT array_agg(id ORDER BY id) INTO v_deleted FROM d;
  ELSE
    WITH d AS (DELETE FROM public.beauty_quote_requests WHERE id = ANY (v_ids) RETURNING id) SELECT array_agg(id ORDER BY id) INTO v_deleted FROM d;
  END IF;
  RETURN jsonb_build_object('ok', true, 'deleted', to_jsonb(v_deleted));
END $$;

-- ── categories ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
-- The basis of a category: hash of its whole row (any edit changes it), its sub-category count, and the members: every product attached
-- by the foreign key (and, for Health, by the legacy slug text) with its updated_at. `members_hash` pins WHICH products and which
-- versions; swapping one product for another keeps the count and changes the hash.
CREATE OR REPLACE FUNCTION public.operator_category_basis(p_house text, p_id bigint)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_slug text; v_hash text; v_children int := 0; v_count int; v_mhash text;
BEGIN
  IF p_house = 'health' THEN
    SELECT c.slug, md5(to_jsonb(c)::text) INTO v_slug, v_hash FROM public.categories c WHERE c.id = p_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('found', false); END IF;
    SELECT count(*) INTO v_children FROM public.categories k WHERE k.parent_id = p_id;
    SELECT count(*), md5(COALESCE(string_agg(m.id::text || ':' || COALESCE(to_char(m.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), ''), ',' ORDER BY m.id), ''))
      INTO v_count, v_mhash
      FROM public.products m WHERE m.category_id = p_id OR m.category = v_slug;
  ELSIF p_house = 'beauty' THEN
    SELECT c.slug, md5(to_jsonb(c)::text) INTO v_slug, v_hash FROM public.beauty_categories c WHERE c.id = p_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('found', false); END IF;
    SELECT count(*) INTO v_children FROM public.beauty_categories k WHERE k.parent_id = p_id;
    SELECT count(*), md5(COALESCE(string_agg(m.id::text || ':' || COALESCE(to_char(m.updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'), ''), ',' ORDER BY m.id), ''))
      INTO v_count, v_mhash
      FROM public.beauty_products m WHERE m.category_id = p_id;
  ELSE
    RETURN jsonb_build_object('found', false);
  END IF;
  RETURN jsonb_build_object('found', true, 'slug', v_slug, 'row_hash', v_hash, 'children', v_children, 'members', v_count, 'members_hash', v_mhash);
END $$;

CREATE OR REPLACE FUNCTION public.operator_delete_category_checked(p_house text, p_id bigint, p_move_to bigint, p_basis jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_slug text; v_target_slug text; v_now jsonb; v_moved int := 0;
BEGIN
  IF p_house NOT IN ('health', 'beauty') THEN RETURN jsonb_build_object('ok', false, 'reason', 'bad_house'); END IF;
  IF p_basis IS NULL OR jsonb_typeof(p_basis) <> 'object' OR (p_basis -> 'row_hash') IS NULL OR (p_basis -> 'members_hash') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_basis');                 -- a deletion is always prepared against a basis
  END IF;

  -- 1. lock: the category (blocks any product from being attached to it meanwhile: the foreign key needs a share lock on this row),
  --    the destination (it must still exist until we are done), then every member product in id order
  IF p_house = 'health' THEN
    -- Legacy category text has no FK and therefore takes no lock on the category.
    -- Serialize this rare destructive operation with catalogue writers before
    -- fingerprinting membership, so an in-flight legacy-only insert/update cannot
    -- be missed between the basis check and the move/delete.
    LOCK TABLE public.products IN SHARE ROW EXCLUSIVE MODE;
    SELECT slug INTO v_slug FROM public.categories WHERE id = p_id FOR UPDATE;
  ELSE
    SELECT slug INTO v_slug FROM public.beauty_categories WHERE id = p_id FOR UPDATE;
  END IF;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;

  IF p_move_to IS NOT NULL THEN
    IF p_move_to = p_id THEN RETURN jsonb_build_object('ok', false, 'reason', 'same_target'); END IF;
    IF p_house = 'health' THEN
      SELECT slug INTO v_target_slug FROM public.categories WHERE id = p_move_to FOR KEY SHARE;
    ELSE
      SELECT slug INTO v_target_slug FROM public.beauty_categories WHERE id = p_move_to FOR KEY SHARE;
    END IF;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_target'); END IF;
  END IF;

  IF p_house = 'health' THEN
    PERFORM m.id FROM public.products m WHERE m.category_id = p_id OR m.category = v_slug ORDER BY m.id FOR UPDATE;
  ELSE
    PERFORM m.id FROM public.beauty_products m WHERE m.category_id = p_id ORDER BY m.id FOR UPDATE;
  END IF;

  -- 2. judge, under the locks, against exactly what the reviewer was shown
  v_now := public.operator_category_basis(p_house, p_id);
  IF (v_now ->> 'children')::int > 0 THEN RETURN jsonb_build_object('ok', false, 'reason', 'has_children'); END IF;
  IF (v_now ->> 'row_hash') IS DISTINCT FROM (p_basis ->> 'row_hash')
     OR (v_now ->> 'members_hash') IS DISTINCT FROM (p_basis ->> 'members_hash')
     OR (v_now ->> 'members') IS DISTINCT FROM (p_basis ->> 'members') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'stale');
  END IF;
  IF (v_now ->> 'members')::int > 0 AND p_move_to IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'needs_move', 'members', (v_now ->> 'members')::int); END IF;

  -- 3. act: no product is ever deleted, and none is left pointing at a category that is gone
  IF (v_now ->> 'members')::int > 0 THEN
    IF p_house = 'health' THEN
      UPDATE public.products SET category_id = p_move_to, category = v_target_slug WHERE category_id = p_id OR category = v_slug;
    ELSE
      UPDATE public.beauty_products SET category_id = p_move_to, category = v_target_slug WHERE category_id = p_id;
    END IF;
    GET DIAGNOSTICS v_moved = ROW_COUNT;
  END IF;
  IF p_house = 'health' THEN DELETE FROM public.categories WHERE id = p_id; ELSE DELETE FROM public.beauty_categories WHERE id = p_id; END IF;
  RETURN jsonb_build_object('ok', true, 'moved', v_moved);
END $$;

-- ── brands (Beauty) ─────────────────────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.operator_delete_brand_checked(p_id bigint, p_basis jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hash text;
BEGIN
  IF p_basis IS NULL OR jsonb_typeof(p_basis) <> 'object' OR (p_basis -> 'row_hash') IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'no_basis'); END IF;
  SELECT md5(to_jsonb(b)::text) INTO v_hash FROM public.beauty_brands b WHERE b.id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF v_hash IS DISTINCT FROM (p_basis ->> 'row_hash') THEN RETURN jsonb_build_object('ok', false, 'reason', 'stale'); END IF;
  DELETE FROM public.beauty_brands WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END $$;

CREATE OR REPLACE FUNCTION public.operator_brand_basis(p_id bigint)
RETURNS jsonb
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE((SELECT jsonb_build_object('found', true, 'slug', b.slug, 'name', b.name, 'row_hash', md5(to_jsonb(b)::text)) FROM public.beauty_brands b WHERE b.id = p_id), jsonb_build_object('found', false));
$$;

-- service-role only: the panels' server code is the sole caller; the public API roles cannot execute any of them
REVOKE ALL ON FUNCTION public.operator_delete_quotes_checked(text, bigint[], jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.operator_category_basis(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.operator_delete_category_checked(text, bigint, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.operator_delete_brand_checked(bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.operator_brand_basis(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.operator_delete_quotes_checked(text, bigint[], jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.operator_category_basis(text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.operator_delete_category_checked(text, bigint, bigint, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.operator_delete_brand_checked(bigint, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.operator_brand_basis(bigint) TO service_role;

COMMIT;
