#!/usr/bin/env bash
set -Eeuo pipefail

for command_name in rclone jq; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "error: $command_name is required and was not found in PATH" >&2
    exit 1
  fi
done

source_remote="${SOURCE_RCLONE_REMOTE:-platform}"
destination_remote="${DESTINATION_RCLONE_REMOTE:-self-hosted}"
apply_copy="${APPLY_STORAGE_COPY:-NO}"

if [[ "$source_remote" == "$destination_remote" ]]; then
  echo "error: source and destination rclone remotes must be different" >&2
  exit 1
fi

echo "checking source remote: ${source_remote}:"
rclone lsd "${source_remote}:" >/dev/null

echo "checking destination remote: ${destination_remote}:"
rclone lsd "${destination_remote}:" >/dev/null

mapfile -t buckets < <(
  rclone lsf "${source_remote}:" --dirs-only | sed 's:/*$::' | sed '/^$/d'
)

if [[ ${#buckets[@]} -eq 0 ]]; then
  echo "no source buckets found; nothing to copy"
  exit 0
fi

echo "source buckets:"
printf '  - %s\n' "${buckets[@]}"

for bucket in "${buckets[@]}"; do
  if ! rclone lsf "${destination_remote}:${bucket}" --max-depth 1 >/dev/null 2>&1; then
    echo "error: destination bucket does not exist or is not accessible: $bucket" >&2
    echo "restore bucket metadata or create the matching bucket before copying objects" >&2
    exit 1
  fi
done

copy_flags=(
  --transfers "${RCLONE_TRANSFERS:-4}"
  --checkers "${RCLONE_CHECKERS:-8}"
  --timeout "${RCLONE_TIMEOUT:-30m}"
  --stats 10s
  --stats-one-line
)

if [[ "$apply_copy" != "YES" ]]; then
  echo "APPLY_STORAGE_COPY is not YES; running dry-run only"
  copy_flags+=(--dry-run)
fi

for bucket in "${buckets[@]}"; do
  echo "copying bucket: $bucket"
  rclone copy \
    "${source_remote}:${bucket}" \
    "${destination_remote}:${bucket}" \
    "${copy_flags[@]}"
done

if [[ "$apply_copy" != "YES" ]]; then
  echo "dry-run complete; no objects were written"
  echo "set APPLY_STORAGE_COPY=YES only after reviewing the dry-run"
  exit 0
fi

echo "copy complete; comparing source and destination sizes"
verification_failed=0

for bucket in "${buckets[@]}"; do
  source_json="$(rclone size "${source_remote}:${bucket}" --json)"
  destination_json="$(rclone size "${destination_remote}:${bucket}" --json)"

  source_count="$(jq -r '.count' <<<"$source_json")"
  source_bytes="$(jq -r '.bytes' <<<"$source_json")"
  destination_count="$(jq -r '.count' <<<"$destination_json")"
  destination_bytes="$(jq -r '.bytes' <<<"$destination_json")"

  printf '%s: source=%s objects/%s bytes destination=%s objects/%s bytes\n' \
    "$bucket" "$source_count" "$source_bytes" "$destination_count" "$destination_bytes"

  if [[ "$source_count" != "$destination_count" || "$source_bytes" != "$destination_bytes" ]]; then
    verification_failed=1
  fi
done

if [[ $verification_failed -ne 0 ]]; then
  echo "error: at least one bucket size/count comparison failed" >&2
  exit 1
fi

echo "all bucket object counts and byte totals match"
