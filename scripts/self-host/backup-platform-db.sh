#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

if ! command -v supabase >/dev/null 2>&1; then
  echo "error: Supabase CLI is required and was not found in PATH" >&2
  exit 1
fi

: "${PLATFORM_DB_URL:?set PLATFORM_DB_URL to the Supabase platform connection string}"

output_root="${1:-./backups/supabase-platform}"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
output_dir="${output_root%/}/${timestamp}"

mkdir -p "$output_dir"
chmod 700 "$output_dir"

cleanup_partial() {
  if [[ ${backup_complete:-0} -ne 1 ]]; then
    echo "backup failed; removing partial output: $output_dir" >&2
    rm -rf -- "$output_dir"
  fi
}
trap cleanup_partial EXIT

echo "creating Supabase-compatible database dumps in: $output_dir"

supabase db dump \
  --db-url "$PLATFORM_DB_URL" \
  --file "$output_dir/roles.sql" \
  --role-only

supabase db dump \
  --db-url "$PLATFORM_DB_URL" \
  --file "$output_dir/schema.sql"

supabase db dump \
  --db-url "$PLATFORM_DB_URL" \
  --file "$output_dir/data.sql" \
  --use-copy \
  --data-only

for file in roles.sql schema.sql data.sql; do
  if [[ ! -s "$output_dir/$file" ]]; then
    echo "error: expected non-empty dump file is missing: $file" >&2
    exit 1
  fi
  chmod 600 "$output_dir/$file"
done

(
  cd "$output_dir"
  sha256sum roles.sql schema.sql data.sql > SHA256SUMS
  chmod 600 SHA256SUMS
)

cat > "$output_dir/README.txt" <<EOF
Created: $timestamp
Source: Supabase platform database
Files: roles.sql, schema.sql, data.sql, SHA256SUMS

This directory contains database credentials indirectly through data content.
Keep it encrypted at rest, do not commit it, and do not upload it to chat.
Storage object bytes are NOT included and require a separate S3/rclone copy.
EOF
chmod 600 "$output_dir/README.txt"

backup_complete=1
trap - EXIT

echo "backup complete: $output_dir"
echo "verify with: (cd '$output_dir' && sha256sum -c SHA256SUMS)"
