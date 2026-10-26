#!/usr/bin/env bash
# Medoria server heartbeat: "this server is up and the site is healthy", every few minutes.
#
# Run from cron as the `medoria` user (it needs docker access), e.g.
#   */5 * * * * /home/medoria/bin/medoria-uptime-heartbeat.sh >> /home/medoria/backups/production-auto/heartbeat.log 2>&1
#
# It checks, from the server's own point of view:
#   1. the public site answers   (SITE_HEALTH_URL, default https://medoriaco.com/api/health, HTTP 200)
#   2. no container is unhealthy (docker ps --filter health=unhealthy)
#   3. the disk is not nearly full (DISK_MAX_PERCENT, default 90)
# and then pings an external heartbeat URL: "<url>" when all is well, "<url>/fail" with the names
# of the failed checks otherwise. If the server is OFF, or cron / this script stops, no ping arrives
# and the external service alerts you after its grace period: the signal does not depend on the
# failing server being able to speak. A second, independent monitor that requests the site from
# OUTSIDE (see docs/MONITORING_AND_ALERTS.md) covers DNS, certificate and routing problems.
#
# The URL lives in $UPTIME_ALERT_ENV (default ~/.config/medoria/uptime-alerts.env, mode 600):
#   SITE_PING_URL=https://...
# It is never printed. A failing ping never changes the exit code of the checks.
set -Eeuo pipefail
cd /

SITE_HEALTH_URL="${SITE_HEALTH_URL:-https://medoriaco.com/api/health}"
DISK_MAX_PERCENT="${DISK_MAX_PERCENT:-90}"
DISK_PATH="${DISK_PATH:-/}"
ALERT_ENV="${UPTIME_ALERT_ENV:-$HOME/.config/medoria/uptime-alerts.env}"
SITE_PING_URL=""

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

if [ -f "$ALERT_ENV" ]; then
  line="$(grep -E '^SITE_PING_URL=' "$ALERT_ENV" | tail -n 1 || true)"
  val="${line#*=}"; val="${val%\"}"; val="${val#\"}"
  if [[ "$val" =~ ^https?://[^[:space:]]+$ ]]; then SITE_PING_URL="$val"
  elif [ -n "$val" ]; then log "WARNING: SITE_PING_URL in $ALERT_ENV is not a valid http(s) URL; ignored"; fi
fi

ping_url() {
  local base="$1" suffix="${2:-}" body="${3:-}" code
  [ -n "$base" ] || return 0
  local attempt
  for attempt in 1 2 3; do   # own retry loop: curl --retry misbehaves with `-o /dev/null` on 5xx answers (exit 23)
    code="$(curl -sS -m 10 -o /dev/null -w '%{http_code}' --data-raw "$body" "${base%/}${suffix}" 2>/dev/null)" || code="000"
    case "$code" in 2??) break ;; esac
    [ "$attempt" -lt 3 ] && sleep "${PING_RETRY_DELAY:-2}"
  done
  case "$code" in
    2??) ;;
    *)   log "WARNING: heartbeat ping '${suffix:-success}' failed (http ${code:-000})" ;;
  esac
  return 0
}

problems=()

code="$(curl -sS -m 15 -o /dev/null -w '%{http_code}' "$SITE_HEALTH_URL" 2>/dev/null)" || code="000"
[ "$code" = "200" ] || problems+=("site health answered http $code")

if command -v docker >/dev/null 2>&1; then
  unhealthy="$(docker ps --filter health=unhealthy --format '{{.Names}}' 2>/dev/null | tr '\n' ' ' || true)"
  [ -z "${unhealthy// /}" ] || problems+=("unhealthy containers: ${unhealthy% }")
else
  problems+=("docker is not available")
fi

used="$(df -P "$DISK_PATH" 2>/dev/null | awk 'NR==2 {gsub("%","",$5); print $5}')" || used=""
if [[ "$used" =~ ^[0-9]+$ ]]; then
  [ "$used" -lt "$DISK_MAX_PERCENT" ] || problems+=("disk ${used}% full (limit ${DISK_MAX_PERCENT}%)")
else
  problems+=("could not read disk usage")
fi

if [ "${#problems[@]}" -eq 0 ]; then
  ping_url "$SITE_PING_URL" "" "ok: site 200, containers healthy, disk ${used}%"
  exit 0
fi

msg="PROBLEM: $(IFS='; '; echo "${problems[*]}")"
log "$msg"
ping_url "$SITE_PING_URL" "/fail" "$msg"
exit 1
