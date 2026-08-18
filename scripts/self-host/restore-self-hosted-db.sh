#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

if ! command -v psql >/dev/null 2>&1; then
  echo "error: psql is required and was not found in PATH" >&2
  exit 1
fi

: "${SELF_HOSTED_DB_URL:?set SELF_HOSTED_DB_URL to the target self-hosted database connection string}"
: "${ALLOW_DESTRUCTIVE_RESTORE:?set ALLOW_DESTRUCTIVE_RESTORE=YES only for an empty disposable target}"

if [[ "$ALLOW_DESTRUCTIVE_RESTORE" != "YES" ]]; then
  echo "error: restore refused; ALLOW_DESTRUCTIVE_RESTORE must equal YES" >&2
  exit 1
fi

backup_dir="${1:?usage: restore-self-hosted-db.sh /path/to/backup-directory}"
backup_dir="${backup_dir%/}"

for file in roles.sql schema.sql data.sql SHA256SUMS; do
  if [[ ! -f "$backup_dir/$file" ]]; then
    echo "error: missing backup file: $backup_dir/$file" >&2
    exit 1
  fi
done

(
  cd "$backup_dir"
  sha256sum -c SHA256SUMS
)

echo "target connection preflight:"
psql "$SELF_HOSTED_DB_URL" \
  --no-psqlrc \
  --set ON_ERROR_STOP=1 \
  --tuples-only \
  --command "select current_database(), current_user, current_setting('server_version');"

existing_public_tables="$(
  psql "$SELF_HOSTED_DB_URL" \
    --no-psqlrc \
    --set ON_ERROR_STOP=1 \
    --tuples-only \
    --no-align \
    --command "select count(*) from pg_tables where schemaname = 'public';"
)"
existing_public_tables="${existing_public_tables//[[:space:]]/}"

if [[ "$existing_public_tables" != "0" && "${ALLOW_NONEMPTY_TARGET:-NO}" != "YES" ]]; then
  echo "error: target contains $existing_public_tables public tables" >&2
  echo "restore is intended for a fresh instance; set ALLOW_NONEMPTY_TARGET=YES only after manual review" >&2
  exit 1
fi

echo "restoring roles, schema, and data in one transaction"

psql "$SELF_HOSTED_DB_URL" \
  --no-psqlrc \
  --single-transaction \
  --set ON_ERROR_STOP=1 \
  --file "$backup_dir/roles.sql" \
  --file "$backup_dir/schema.sql" \
  --command "SET session_replication_role = replica" \
  --file "$backup_dir/data.sql"

echo "restore completed; run scripts/self-host/verify-self-hosted-db.sql next"
