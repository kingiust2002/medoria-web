#!/usr/bin/env bash
# Medoria restore drill: prove that a backup can really be restored, without touching production.
#
#   restore-drill.sh                      newest LOCAL snapshot
#   restore-drill.sh --snapshot TS        a specific snapshot (e.g. 20261024T115301Z)
#   restore-drill.sh --from-r2            newest snapshot read back from the ENCRYPTED R2 copy
#   restore-drill.sh --keep               keep the working copy and print where it is
#
# What it does (nothing here can write to the production database or to the backups):
#   1. picks the snapshot and verifies every file against checksums.sha256
#   2. starts a THROW-AWAY database container from the same image as supabase-db (no network, no published
#      port, memory-capped, removed at the end whatever happens)
#   3. restores database-public.dump into it
#   4. compares the row count of every public table with database-counts.txt recorded by the backup
#   5. compares the number of files in storage/ with the manifest, and lists the full dump
#   → prints one PASS/FAIL line per check and RESTORE_DRILL=PASS|FAIL (exit 0 / 1).
#
# Run as the `medoria` user (it owns rclone.conf and docker access), e.g. once a month:
#   cd /home/medoria && sudo -u medoria /home/medoria/bin/medoria-restore-drill.sh
# Optional: RESTORE_DRILL_PING_URL=<heartbeat URL> in ~/.config/medoria/backup-alerts.env makes a failed or
# missing drill alert you (same service and protocol as docs/MONITORING_AND_ALERTS.md).
#
# Needs free disk of about 3x the snapshot (work copy + the restored database) under WORK_ROOT.
set -Eeuo pipefail
umask 077
cd /

BACKUP_ROOT="${BACKUP_ROOT:-/home/medoria/backups/production-auto}"
WORK_ROOT="${WORK_ROOT:-/home/medoria/backups/restore-drill-work}"
DB_CONTAINER="${DB_CONTAINER:-supabase-db}"
DRILL_IMAGE="${DRILL_IMAGE:-}"
R2_REMOTE="${R2_REMOTE:-r2crypt:production-auto}"
READY_TIMEOUT="${READY_TIMEOUT:-120}"
export RCLONE_CONFIG="${RCLONE_CONFIG:-$HOME/.config/rclone/rclone.conf}"
ALERT_ENV="${BACKUP_ALERT_ENV:-$HOME/.config/medoria/backup-alerts.env}"
SNAP_RE='^[0-9]{8}T[0-9]{6}Z$'

snapshot="" from_r2=0 keep=0
while [ $# -gt 0 ]; do
  case "$1" in
    --snapshot) snapshot="${2:-}"; shift 2 ;;
    --from-r2) from_r2=1; shift ;;
    --keep) keep=1; shift ;;
    *) echo "unknown option: $1" >&2; exit 2 ;;
  esac
done

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
FAILED=0
fail() { echo "$1=FAIL${2:+ ($2)}"; FAILED=1; }
pass() { echo "$1=PASS${2:+ ($2)}"; }

# ---- optional heartbeat ping (same parsing rules as production-backup.sh: parsed, never sourced, never printed)
PING_URL=""
if [ -f "$ALERT_ENV" ]; then
  line="$(grep -E '^RESTORE_DRILL_PING_URL=' "$ALERT_ENV" | tail -n 1 || true)"
  val="${line#*=}"; val="${val%\"}"; val="${val#\"}"
  [[ "$val" =~ ^https?://[^[:space:]]+$ ]] && PING_URL="$val"
fi
ping_url() {
  local suffix="${1:-}" body="${2:-}" code attempt
  [ -n "$PING_URL" ] && command -v curl >/dev/null 2>&1 || return 0
  for attempt in 1 2 3; do
    code="$(curl -sS -m 10 -o /dev/null -w '%{http_code}' --data-raw "$body" "${PING_URL%/}${suffix}" 2>/dev/null)" || code="000"
    case "$code" in 2??) return 0 ;; esac
    [ "$attempt" -lt 3 ] && sleep "${PING_RETRY_DELAY:-2}"
  done
  log "WARNING: drill ping failed (http $code)"; return 0
}

for c in docker sha256sum find sort grep sed awk; do command -v "$c" >/dev/null 2>&1 || { echo "required command not found: $c" >&2; exit 2; }; done
[ "$from_r2" = 0 ] || command -v rclone >/dev/null 2>&1 || { echo "rclone is required for --from-r2" >&2; exit 2; }

NAME="medoria-restore-drill-$(date -u +%Y%m%dT%H%M%S)-$$"
mkdir -p "$WORK_ROOT"; chmod 700 "$WORK_ROOT"
WORK="$(mktemp -d "$WORK_ROOT/drill.XXXXXX")"

cleanup() {
  local rc=$?
  trap - EXIT
  docker rm -f "$NAME" >/dev/null 2>&1 || true
  if [ "$keep" = 1 ]; then log "working copy kept: $WORK"; else rm -rf -- "$WORK"; fi
  if [ "$rc" -ne 0 ] && [ "$FAILED" = 0 ]; then echo "RESTORE_DRILL=FAIL (unexpected error, exit $rc)"; FAILED=1; ping_url "/fail" "restore drill crashed (exit $rc)"; fi
  exit "$rc"
}
trap cleanup EXIT

ping_url "/start" "restore drill starting"

# ---- 1. pick + verify the snapshot
if [ "$from_r2" = 1 ]; then
  [ -n "$snapshot" ] || snapshot="$(rclone lsf "$R2_REMOTE" --dirs-only | sed 's#/$##' | grep -E "$SNAP_RE" | sort | tail -n 1)"
  [ -n "$snapshot" ] || { fail RESTORE_DRILL_SNAPSHOT "no snapshot in R2"; echo "RESTORE_DRILL=FAIL"; ping_url "/fail" "no snapshot in R2"; exit 1; }
  log "reading snapshot $snapshot back from the encrypted R2 copy"
  rclone copy "$R2_REMOTE/$snapshot" "$WORK/snap" --transfers 4 --retries 3 --quiet
  SNAP="$WORK/snap"
else
  [ -n "$snapshot" ] || snapshot="$(find "$BACKUP_ROOT" -maxdepth 1 -type d -printf '%f\n' 2>/dev/null | grep -E "$SNAP_RE" | sort | tail -n 1 || true)"
  [ -n "$snapshot" ] || { fail RESTORE_DRILL_SNAPSHOT "no local snapshot in $BACKUP_ROOT"; echo "RESTORE_DRILL=FAIL"; ping_url "/fail" "no local snapshot"; exit 1; }
  [[ "$snapshot" =~ $SNAP_RE ]] || { echo "not a snapshot name: $snapshot" >&2; exit 2; }
  SNAP="$BACKUP_ROOT/$snapshot"
  [ -d "$SNAP" ] || { fail RESTORE_DRILL_SNAPSHOT "missing $SNAP"; echo "RESTORE_DRILL=FAIL"; ping_url "/fail" "snapshot missing"; exit 1; }
fi
echo "RESTORE_DRILL_SNAPSHOT=$snapshot source=$([ "$from_r2" = 1 ] && echo r2-encrypted || echo local)"

for f in manifest.txt checksums.sha256 database-public.dump database-full.dump database-counts.txt; do
  [ -s "$SNAP/$f" ] || { fail RESTORE_DRILL_FILES "missing or empty: $f"; echo "RESTORE_DRILL=FAIL"; ping_url "/fail" "snapshot incomplete: $f"; exit 1; }
done
if ( cd "$SNAP" && sha256sum -c --quiet checksums.sha256 ) >/dev/null 2>&1; then
  pass RESTORE_DRILL_CHECKSUMS "$(wc -l < "$SNAP/checksums.sha256") files"
else
  fail RESTORE_DRILL_CHECKSUMS "a file differs from its recorded checksum (corrupt or tampered backup)"
  echo "RESTORE_DRILL=FAIL"; ping_url "/fail" "checksum mismatch in $snapshot"; exit 1
fi

# ---- 2. throw-away database from the same image as production
IMAGE="${DRILL_IMAGE:-$(docker inspect -f '{{.Config.Image}}' "$DB_CONTAINER" 2>/dev/null || true)}"
[ -n "$IMAGE" ] || { fail RESTORE_DRILL_DATABASE "cannot read the image of $DB_CONTAINER (set DRILL_IMAGE)"; echo "RESTORE_DRILL=FAIL"; ping_url "/fail" "no database image"; exit 1; }
log "starting throw-away database $NAME from the production image (no network, no published port)"
docker run -d --name "$NAME" --network none --memory 2g --cpus 2 -e POSTGRES_PASSWORD="drill-$RANDOM$RANDOM" "$IMAGE" >/dev/null
ready=0
for _ in $(seq 1 "$READY_TIMEOUT"); do
  if docker exec "$NAME" pg_isready -U postgres -d postgres >/dev/null 2>&1; then ready=1; break; fi
  sleep 1
done
[ "$ready" = 1 ] || { fail RESTORE_DRILL_DATABASE "the throw-away database did not become ready in ${READY_TIMEOUT}s"; echo "RESTORE_DRILL=FAIL"; ping_url "/fail" "drill database not ready"; exit 1; }

# ---- 3. restore the public schema
docker cp "$SNAP/database-public.dump" "$NAME:/tmp/database-public.dump"
errs="$WORK/restore.errors"
docker exec "$NAME" pg_restore -U postgres -d postgres --no-owner --no-acl --role=postgres /tmp/database-public.dump >/dev/null 2>"$errs" || true
# the only expected message is that the schema already exists in a fresh database (runbook §22.5); anything else is a failure
unexpected="$(grep -E '^pg_restore: error' "$errs" | grep -vE 'schema "public" already exists' || true)"
if [ -z "$unexpected" ]; then pass RESTORE_DRILL_RESTORE "database-public.dump restored"; else fail RESTORE_DRILL_RESTORE "$(echo "$unexpected" | head -n 3 | tr '\n' ' ')"; fi

# ---- 4. row counts against what the backup recorded
checked=0 mismatches=0
while IFS='=' read -r table expected; do
  [ -n "$table" ] || continue
  case "$table" in storage.objects) continue ;; esac                   # storage rows live in the other dump
  [[ "$table" =~ ^[a-z0-9_]+$ && "$expected" =~ ^[0-9]+$ ]] || { fail RESTORE_DRILL_COUNTS "unreadable counts line: ${table:0:40}"; mismatches=$((mismatches+1)); continue; }
  actual="$(docker exec "$NAME" psql -U postgres -d postgres -At -c "select count(*) from public.\"$table\"" 2>/dev/null || echo "missing")"
  checked=$((checked+1))
  if [ "$actual" != "$expected" ]; then echo "  count mismatch: $table expected $expected, restored ${actual}"; mismatches=$((mismatches+1)); fi
done < "$SNAP/database-counts.txt"
if [ "$checked" -gt 0 ] && [ "$mismatches" -eq 0 ]; then pass RESTORE_DRILL_COUNTS "$checked tables match the backup's own counts"
else fail RESTORE_DRILL_COUNTS "$mismatches mismatch(es) in $checked table(s)"; fi

# ---- 5. storage files and the full dump
want="$(sed -n 's/^storage_files=//p' "$SNAP/manifest.txt" | head -n 1)"
have="$(find "$SNAP/storage" -type f ! -name .gitkeep 2>/dev/null | wc -l | tr -d ' ')"
if [[ "$want" =~ ^[0-9]+$ ]] && [ "$want" = "$have" ]; then pass RESTORE_DRILL_STORAGE "$have files"; else fail RESTORE_DRILL_STORAGE "manifest says ${want:-?}, snapshot has $have"; fi
if docker exec -i "$NAME" pg_restore -l < "$SNAP/database-full.dump" >/dev/null 2>&1; then pass RESTORE_DRILL_FULL_DUMP "readable"; else fail RESTORE_DRILL_FULL_DUMP "pg_restore cannot read database-full.dump"; fi

if [ "$FAILED" = 0 ]; then
  echo "RESTORE_DRILL=PASS"
  ping_url "" "restore drill PASS: $snapshot restored, $checked tables match"
  exit 0
fi
echo "RESTORE_DRILL=FAIL"
ping_url "/fail" "restore drill FAILED for $snapshot (see the script output)"
exit 1
