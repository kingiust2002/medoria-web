#!/usr/bin/env bash
# quote-reminders.sh — host cron entry for the customer-request reminder (docs/QUOTE_MANAGEMENT.md).
#
# Calls POST /api/internal/quote-reminders of the app with the token from deploy/.env. The token is
# handed to curl through stdin (-K -), so it never appears in the process list, in shell history or
# in this script's output. Exit 0 = every house that had something to report was told (or had
# nothing); non-zero = the endpoint refused, failed or could not be reached.
#
# Optional external check (QUOTE_REMINDER_PING_URL in ~/.config/medoria/quote-reminders.env, a
# healthchecks.io-style check URL): ping on success, ping <url>/fail on failure, so a reminder run
# that stops working is reported by a service OUTSIDE this server.
#
# Usage:  quote-reminders.sh            run once
#         quote-reminders.sh --dry-run  show what would be called (no token, no request)
# Env overrides (tests): MEDORIA_ENV_FILE, MEDORIA_BASE_URL, MEDORIA_REMINDER_CONF.
set -u
cd / || exit 2

ENV_FILE="${MEDORIA_ENV_FILE:-/home/medoria/apps/medoria-staging/deploy/.env}"
BASE_URL="${MEDORIA_BASE_URL:-https://medoriaco.com}"
CONF="${MEDORIA_REMINDER_CONF:-$HOME/.config/medoria/quote-reminders.env}"
URL="${BASE_URL%/}/api/internal/quote-reminders"

ping_url=""
if [ -r "$CONF" ]; then
  ping_url="$(sed -n 's/^QUOTE_REMINDER_PING_URL=//p' "$CONF" | tail -n 1 | tr -d '\r"'"'"' ')"
fi
ping() { [ -n "$ping_url" ] && curl -fsS -m 10 --retry 2 -o /dev/null "${ping_url%/}$1" 2>/dev/null; return 0; }
fail() { echo "quote-reminders: $1" >&2; ping /fail; exit "${2:-1}"; }

if [ "${1:-}" = "--dry-run" ]; then
  echo "would POST $URL (token from $ENV_FILE)${ping_url:+, then ping the external check}"
  exit 0
fi

[ -r "$ENV_FILE" ] || fail "cannot read $ENV_FILE" 2
token="$(sed -n 's/^QUOTE_REMINDER_TOKEN=//p' "$ENV_FILE" | tail -n 1 | tr -d '\r"'"'"' ')"
[ -n "$token" ] || fail "QUOTE_REMINDER_TOKEN is not set in $ENV_FILE (the endpoint is off)" 2

ping /start
body="$(mktemp)"; trap 'rm -f "$body"' EXIT
code="$(printf 'header = "Authorization: Bearer %s"\n' "$token" | curl -sS -m 40 -K - -X POST -o "$body" -w '%{http_code}' "$URL" 2>/dev/null)"
case "$code" in
  200) echo "quote-reminders: ok — $(tr -d '\n' < "$body" | cut -c1-400)"; ping ""; exit 0 ;;
  401) fail "the endpoint refused the token (HTTP 401): the app container and deploy/.env disagree" ;;
  404) fail "the endpoint is off (HTTP 404): the app container has not been restarted with the token" ;;
  502) fail "a reminder could not be delivered (HTTP 502): $(tr -d '\n' < "$body" | cut -c1-400)" ;;
  *)   fail "unexpected answer (HTTP ${code:-none}) from $URL" ;;
esac
