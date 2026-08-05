\set ON_ERROR_STOP on
\pset pager off
\timing on

\echo '=== target identity ==='
select
  current_database() as database_name,
  current_user as database_user,
  current_setting('server_version') as postgres_version;

\echo '=== installed extensions ==='
select extname, extversion
from pg_extension
order by extname;

\echo '=== public tables ==='
select schemaname, tablename, tableowner
from pg_tables
where schemaname = 'public'
order by tablename;

\echo '=== public table row counts ==='
select format(
  'select %L as table_name, count(*)::bigint as row_count from %I.%I;',
  schemaname || '.' || tablename,
  schemaname,
  tablename
)
from pg_tables
where schemaname = 'public'
order by tablename
\gexec

\echo '=== row-level security flags ==='
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r'
  and n.nspname in ('public', 'storage')
order by n.nspname, c.relname;

\echo '=== policies ==='
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, policyname;

\echo '=== public functions and procedures ==='
select
  n.nspname as schema_name,
  p.proname as routine_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  case p.prokind
    when 'f' then 'function'
    when 'p' then 'procedure'
    when 'a' then 'aggregate'
    when 'w' then 'window'
    else p.prokind::text
  end as routine_type
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname, identity_arguments;

\echo '=== non-internal triggers ==='
select
  event_object_schema as schema_name,
  event_object_table as table_name,
  trigger_name,
  action_timing,
  event_manipulation,
  action_statement
from information_schema.triggers
where event_object_schema in ('public', 'storage')
order by event_object_schema, event_object_table, trigger_name, event_manipulation;

\echo '=== storage buckets ==='
select
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
from storage.buckets
order by id;

\echo '=== storage object metadata counts ==='
select
  b.id as bucket_id,
  count(o.id)::bigint as object_count,
  coalesce(sum(nullif(o.metadata ->> 'size', '')::bigint), 0)::bigint as metadata_bytes
from storage.buckets b
left join storage.objects o on o.bucket_id = b.id
group by b.id
order by b.id;

\echo '=== expected Medoria buckets ==='
with expected(bucket_id) as (
  values
    ('product-images'::text),
    ('beauty-product-images'::text),
    ('beauty-brand-logos'::text)
)
select
  e.bucket_id,
  (b.id is not null) as present,
  b.public
from expected e
left join storage.buckets b on b.id = e.bucket_id
order by e.bucket_id;

\echo '=== expected Medoria RPCs ==='
with expected(routine_name) as (
  values
    ('increment_product_views'::text),
    ('increment_beauty_product_views'::text)
), actual as (
  select
    p.proname as routine_name,
    string_agg(
      pg_get_function_identity_arguments(p.oid),
      ' | '
      order by pg_get_function_identity_arguments(p.oid)
    ) as identity_arguments
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'increment_product_views',
      'increment_beauty_product_views'
    )
  group by p.proname
)
select
  e.routine_name,
  (a.routine_name is not null) as present,
  a.identity_arguments
from expected e
left join actual a using (routine_name)
order by e.routine_name;
