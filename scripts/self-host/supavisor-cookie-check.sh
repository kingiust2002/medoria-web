#!/usr/bin/env bash
# Where does the Supavisor (connection pooler) Erlang cookie come from, and can it be rotated?
# READ-ONLY. It never prints the cookie: only whether it is set, where it comes from, and short hashes
# for comparison. Run it on the server as root or as `medoria` (needs docker):
#
#   bash scripts/self-host/supavisor-cookie-check.sh [container-name]
#
# Why: a cookie appeared once in a pasted `ps aux` listing (2026-10-20). Closed ports make it hard to use,
# they do not make a leaked secret safe: anything that can reach the Erlang distribution port of the pooler
# (another container on the same Docker network, a future firewall mistake) could run code with it. The
# remedy is to give the pooler a cookie of OUR choosing (RELEASE_COOKIE) and rotate it. This script tells you
# whether that is already the case. Procedure: docs/SECRETS_AND_ACCESS_CLEANUP.md §2.
set -Eeuo pipefail
cd /

SUP="${1:-${SUPAVISOR_CONTAINER:-}}"
if [ -z "$SUP" ]; then
  SUP="$(docker ps --format '{{.Names}}' | grep -iE 'supavisor|pooler' | head -n 1 || true)"
fi
[ -n "$SUP" ] || { echo "SUPAVISOR_CONTAINER=NOT_FOUND (pass the container name as the first argument)"; exit 2; }
echo "SUPAVISOR_CONTAINER=$SUP"

short() { printf '%s' "$1" | sha256sum | cut -c1-8; }

# 1. a cookie set through the container environment (RELEASE_COOKIE is what Elixir releases read)
env_cookie="$(docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$SUP" 2>/dev/null | sed -n 's/^RELEASE_COOKIE=//p' | head -n 1 || true)"
if [ -n "$env_cookie" ]; then
  echo "RELEASE_COOKIE_ENV=set (length ${#env_cookie}, fingerprint $(short "$env_cookie"))"
else
  echo "RELEASE_COOKIE_ENV=not set"
fi

# 2. the cookie the running Erlang VM was actually started with (docker top = the processes of THIS container only)
proc_cookies="$(docker top "$SUP" -eo args 2>/dev/null | sed -n 's/.*-setcookie[= ]\([^ ]*\).*/\1/p' | sort -u || true)"
count=0; matches_env=0
while IFS= read -r c; do
  [ -n "$c" ] || continue
  count=$((count+1))
  echo "RUNNING_VM_COOKIE=seen (length ${#c}, fingerprint $(short "$c"))"
  [ -n "$env_cookie" ] && [ "$c" = "$env_cookie" ] && matches_env=1
done <<< "$proc_cookies"
[ "$count" -gt 0 ] || echo "RUNNING_VM_COOKIE=not visible in the process arguments (the VM may read it from a file)"

# 3. verdict
if [ "$count" -gt 0 ] && [ "$matches_env" = 1 ]; then
  echo "COOKIE_SOURCE=RELEASE_COOKIE from the container environment: ours, rotatable by changing it (docs §2, step 4)"
  verdict=0
elif [ "$count" -gt 0 ]; then
  echo "COOKIE_SOURCE=NOT set by us (the image's built-in or generated value): treat it as known. Set RELEASE_COOKIE to a value of our own (docs §2)"
  verdict=1
else
  echo "COOKIE_SOURCE=unknown (read the compose file: docs §2, step 1)"
  verdict=1
fi

# 4. exposure: is any distribution port published, or listening beyond localhost?
published="$(docker port "$SUP" 2>/dev/null || true)"
if echo "$published" | grep -qE '(^|[^0-9])(4369|9[0-9]{3})/'; then
  echo "DISTRIBUTION_PORT_PUBLISHED=YES (an Erlang port is published on the host: close it first)"
  verdict=1
else
  echo "DISTRIBUTION_PORT_PUBLISHED=no"
fi
if command -v ss >/dev/null 2>&1 && ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE '(0\.0\.0\.0|\[::\]|\*):4369$'; then
  echo "EPMD_LISTENING_ON_ALL_INTERFACES=YES"
  verdict=1
else
  echo "EPMD_LISTENING_ON_ALL_INTERFACES=no"
fi
exit "$verdict"
