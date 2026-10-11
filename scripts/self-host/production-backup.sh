#!/usr/bin/env bash
# Medoria production backup: local snapshot -> encrypted R2 -> verify -> retention.
#
# Run as the `medoria` user (it owns rclone.conf, deploy/.env and docker access).
# Never run it as root: root has no rclone config and would write root-owned files.
#
#   production-backup.sh           take a backup (what cron runs)
#   production-backup.sh --check   freshness check only; exit 1 if the newest local or
#                                  R2 snapshot is older than MAX_AGE_HOURS (default 36)
#
# Snapshot layout (compatible with runbook §7/§22.5):
#   database-full.dump  database-public.dump  database-globals.sql  database-counts.txt
#   manifest.txt  git-state.txt  checksums.sha256
#   config/   protected copies of app.env, supabase.env, Caddyfile, compose files, rclone.conf
#   storage/  RAW copy of docker/volumes/storage (stub/stub/<bucket>/<object>/<version>)
#
# Nothing here prints secrets. Backups reach R2 only through the encrypted `r2crypt`
# remote -- never point R2_REMOTE at the raw `r2raw:` remote.
set -Eeuo pipefail
umask 077

APP_DIR="${APP_DIR:-/home/medoria/apps/medoria-staging}"
SUPABASE_DIR="${SUPABASE_DIR:-/home/medoria/infra/supabase-staging/docker}"
BACKUP_ROOT="${BACKUP_ROOT:-/home/medoria/backups/production-auto}"
DB_CONTAINER="${DB_CONTAINER:-supabase-db}"
DB_USER="${DB_USER:-supabase_admin}"
DB_NAME="${DB_NAME:-postgres}"
R2_REMOTE="${R2_REMOTE:-r2crypt:production-auto}"
LOCAL_RETENTION_DAYS="${LOCAL_RETENTION_DAYS:-14}"
R2_RETENTION_DAYS="${R2_RETENTION_DAYS:-90}"
MIN_KEEP="${MIN_KEEP:-3}"
MAX_AGE_HOURS="${MAX_AGE_HOURS:-36}"
export RCLONE_CONFIG="${RCLONE_CONFIG:-$HOME/.config/rclone/rclone.conf}"

SNAP_RE='^[0-9]{8}T[0-9]{6}Z$'
STATUS_FILE="$BACKUP_ROOT/last-run.status"
LOCK_FILE="$(dirname "$BACKUP_ROOT")/.production-backup.lock"

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }

snapshot_epoch() { # 20260901T023001Z -> epoch seconds
  local n="$1"
  date -u -d "${n:0:4}-${n:4:2}-${n:6:2} ${n:9:2}:${n:11:2}:${n:13:2}" +%s
}

# stdin: snapshot names. stdout: names older than $1 days, never touching the newest MIN_KEEP.
prune_candidates() {
  local days="$1" cutoff i count
  local -a names
  cutoff=$(( $(date -u +%s) - days * 86400 ))
  mapfile -t names < <(grep -E "$SNAP_RE" | sort)
  count=${#names[@]}
  for (( i = 0; i < count - MIN_KEEP; i++ )); do
    if [ "$(snapshot_epoch "${names[i]}")" -lt "$cutoff" ]; then
      printf '%s\n' "${names[i]}"
    fi
  done
  return 0
}

newest_of() { grep -E "$SNAP_RE" | sort | tail -n 1; }

hours_since() { echo $(( ( $(date -u +%s) - $(snapshot_epoch "$1") ) / 3600 )); }

require_cmds() {
  local c
  for c in docker rclone flock sha256sum find cp mv date sort grep; do
    command -v "$c" >/dev/null 2>&1 || die "required command not found: $c"
  done
  [ -f "$RCLONE_CONFIG" ] || die "rclone config not found: $RCLONE_CONFIG (run as the medoria user)"
}

# --------------------------------------------------------------------------- check mode
if [ "${1:-}" = "--check" ]; then
  require_cmds
  rc=0
  local_newest="$(find "$BACKUP_ROOT" -maxdepth 1 -type d -printf '%f\n' 2>/dev/null | newest_of || true)"
  r2_newest="$(rclone lsf "$R2_REMOTE" --dirs-only | sed 's#/$##' | newest_of || true)"
  for pair in "local:$local_newest" "r2:$r2_newest"; do
    where="${pair%%:*}"; snap="${pair#*:}"
    if [ -z "$snap" ]; then
      echo "BACKUP_FRESHNESS_${where}=FAIL (no snapshot found)"; rc=1; continue
    fi
    age="$(hours_since "$snap")"
    if [ "$age" -le "$MAX_AGE_HOURS" ]; then
      echo "BACKUP_FRESHNESS_${where}=PASS newest=$snap age_hours=$age"
    else
      echo "BACKUP_FRESHNESS_${where}=FAIL newest=$snap age_hours=$age (limit ${MAX_AGE_HOURS}h)"; rc=1
    fi
  done
  [ -f "$STATUS_FILE" ] && sed 's/^/last-run: /' "$STATUS_FILE"
  exit "$rc"
fi

# ------------------------------------------------------------------------------- backup
require_cmds
mkdir -p "$BACKUP_ROOT"
chmod 700 "$BACKUP_ROOT"

# Overlapping runs are skipped, not queued.
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  log "another backup is running; skipping"
  exit 0
fi

# Keep the cron log from growing without bound.
if [ -f "$BACKUP_ROOT/cron.log" ] && [ "$(stat -c %s "$BACKUP_ROOT/cron.log")" -gt 5242880 ]; then
  mv -f "$BACKUP_ROOT/cron.log" "$BACKUP_ROOT/cron.log.1"
fi

ts="$(date -u +%Y%m%dT%H%M%SZ)"
stage="$BACKUP_ROOT/.incomplete-$ts"
final="$BACKUP_ROOT/$ts"
step="start"
declare -A RESULT=()

write_status() { # $1 = PASS|FAIL
  {
    echo "AUTO_BACKUP=$1"
    echo "SNAPSHOT=$ts"
    echo "FINISHED=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    [ "$1" = "FAIL" ] && echo "FAILED_STEP=$step"
    for k in LOCAL_BACKUP OFFSITE_UPLOAD OFFSITE_VERIFY R2_RETENTION LOCAL_RETENTION; do
      echo "$k=${RESULT[$k]:-NOT_RUN}"
    done
  } > "$STATUS_FILE"
  chmod 600 "$STATUS_FILE"
}

on_exit() {
  local rc=$?
  trap - EXIT
  if [ "$rc" -ne 0 ]; then
    log "FAILED at step: $step (exit $rc)" >&2
    rm -rf -- "$stage"
    write_status FAIL || true
    echo "AUTO_BACKUP=FAIL"
  fi
  exit "$rc"
}
trap on_exit EXIT

log "backup $ts starting"

step="preflight"
[ "$(docker inspect -f '{{.State.Running}}' "$DB_CONTAINER" 2>/dev/null)" = "true" ] \
  || die "container $DB_CONTAINER is not running"
[ -d "$SUPABASE_DIR/volumes/storage" ] || die "storage volume not found: $SUPABASE_DIR/volumes/storage"
[ -f "$APP_DIR/deploy/.env" ] || die "missing $APP_DIR/deploy/.env"
[ -f "$SUPABASE_DIR/.env" ] || die "missing $SUPABASE_DIR/.env"
rclone mkdir "$R2_REMOTE"
rclone lsf "$R2_REMOTE" --dirs-only >/dev/null || die "cannot list $R2_REMOTE"

mkdir -p "$stage/config" "$stage/storage"
chmod 700 "$stage" "$stage/config" "$stage/storage"

step="database dump (full)"
docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc > "$stage/database-full.dump"
step="database dump (public)"
docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc --schema=public > "$stage/database-public.dump"
step="database globals"
docker exec "$DB_CONTAINER" pg_dumpall -U "$DB_USER" --globals-only --no-role-passwords > "$stage/database-globals.sql"

step="database dump validation"
# The host's postgresql-client is 16; the dumps are PG17, so validate inside the container.
for f in database-full.dump database-public.dump; do
  [ -s "$stage/$f" ] || die "$f is empty"
  docker exec -i "$DB_CONTAINER" pg_restore -l < "$stage/$f" >/dev/null || die "$f failed pg_restore -l"
done
[ -s "$stage/database-globals.sql" ] || die "database-globals.sql is empty"

step="row counts"
docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -At -F '=' -c "
  select table_name, (xpath('/row/c/text()',
           query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text
    from information_schema.tables
   where table_schema = 'public' and table_type = 'BASE TABLE'
   order by 1;" > "$stage/database-counts.txt"
storage_rows="$(docker exec "$DB_CONTAINER" psql -U "$DB_USER" -d "$DB_NAME" -At -c 'select count(*) from storage.objects')"
echo "storage.objects=$storage_rows" >> "$stage/database-counts.txt"
[ -s "$stage/database-counts.txt" ] || die "row counts are empty"

step="storage copy"
cp -r --no-preserve=ownership "$SUPABASE_DIR/volumes/storage/." "$stage/storage/"
src_files="$(find "$SUPABASE_DIR/volumes/storage" -type f ! -name .gitkeep | wc -l)"
dst_files="$(find "$stage/storage" -type f ! -name .gitkeep | wc -l)"
[ "$src_files" = "$dst_files" ] || die "storage copy mismatch: source=$src_files copy=$dst_files"

step="config copy"
cp "$APP_DIR/deploy/.env" "$stage/config/app.env"
cp "$SUPABASE_DIR/.env" "$stage/config/supabase.env"
cp "$RCLONE_CONFIG" "$stage/config/rclone.conf"
cp "$APP_DIR/deploy/Caddyfile" "$stage/config/Caddyfile"
cp "$APP_DIR/deploy/compose.app.yml" "$stage/config/compose.app.yml"
# Local compose edits (pooler ports bound to 127.0.0.1, medoria-shared network) live only on the host.
for f in docker-compose.yml docker-compose.override.yml; do
  [ -f "$SUPABASE_DIR/$f" ] && cp "$SUPABASE_DIR/$f" "$stage/config/supabase-$f"
done
chmod 600 "$stage"/config/*

step="git state"
{
  echo "head=$(git -C "$APP_DIR" rev-parse HEAD)"
  echo "branch=$(git -C "$APP_DIR" rev-parse --abbrev-ref HEAD)"
  echo "--- status ---"
  git -C "$APP_DIR" status --short
} > "$stage/git-state.txt" 2>&1 || true

step="manifest"
{
  echo "snapshot=$ts"
  echo "host=$(hostname)"
  echo "created_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "postgres=$(docker exec "$DB_CONTAINER" postgres --version)"
  echo "storage_files=$dst_files"
  echo "storage_objects_rows=$storage_rows"
  echo "storage_layout=raw volume copy: stub/stub/<bucket>/<object name>/<version>"
  echo "script=scripts/self-host/production-backup.sh"
  [ "$dst_files" = "$storage_rows" ] \
    || echo "note=storage file count differs from storage.objects rows (leftover or missing files)"
} > "$stage/manifest.txt"

step="checksums"
( cd "$stage" && find . -type f ! -name checksums.sha256 -print0 | sort -z | xargs -0 sha256sum > checksums.sha256 )
( cd "$stage" && sha256sum -c --quiet checksums.sha256 )

step="finalize local snapshot"
mv "$stage" "$final"
RESULT[LOCAL_BACKUP]=PASS
log "local snapshot ready: $final"

step="R2 upload"
rclone copy "$final" "$R2_REMOTE/$ts" --checksum --transfers 4 --retries 3 --low-level-retries 5 --quiet
RESULT[OFFSITE_UPLOAD]=PASS

step="R2 verify"
# Crypt remotes have no common hash; --download forces a real read-back of the encrypted copy.
rclone check "$final" "$R2_REMOTE/$ts" --download --one-way --quiet
RESULT[OFFSITE_VERIFY]=PASS
log "off-site copy verified: $R2_REMOTE/$ts"

step="R2 retention"
r2_all="$(rclone lsf "$R2_REMOTE" --dirs-only | sed 's#/$##')"
while IFS= read -r old; do
  [ -n "$old" ] || continue
  log "R2 retention: removing $old"
  rclone purge "$R2_REMOTE/$old"
done < <(printf '%s\n' "$r2_all" | prune_candidates "$R2_RETENTION_DAYS")
RESULT[R2_RETENTION]=PASS

step="local retention"
local_all="$(find "$BACKUP_ROOT" -maxdepth 1 -type d -printf '%f\n')"
while IFS= read -r old; do
  [ -n "$old" ] || continue
  log "local retention: removing $old"
  rm -rf -- "${BACKUP_ROOT:?}/$old"
done < <(printf '%s\n' "$local_all" | prune_candidates "$LOCAL_RETENTION_DAYS")
find "$BACKUP_ROOT" -maxdepth 1 -type d -name '.incomplete-*' -mmin +1440 -exec rm -rf -- {} + 2>/dev/null || true
RESULT[LOCAL_RETENTION]=PASS

step="done"
write_status PASS
trap - EXIT
echo "AUTO_BACKUP=PASS"
echo "LOCAL_BACKUP=PASS"
echo "NEW_SNAPSHOT=$ts"
echo "OFFSITE_UPLOAD=PASS"
echo "OFFSITE_VERIFY=PASS"
echo "R2_RETENTION=PASS"
echo "LOCAL_RETENTION=PASS"
