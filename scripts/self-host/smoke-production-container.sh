#!/usr/bin/env bash
set -Eeuo pipefail

image="${1:-medoria-web:self-host-ci}"
env_file="${2:-deploy/.env}"
base_url="http://127.0.0.1:3000"

if [[ ! -f "$env_file" ]]; then
  echo "error: environment file not found: $env_file" >&2
  exit 1
fi

container_id="$(
  docker run -d \
    --env-file "$env_file" \
    -p 127.0.0.1:3000:3000 \
    "$image"
)"

cleanup() {
  docker logs "$container_id" || true
  docker rm -f "$container_id" >/dev/null 2>&1 || true
}
trap cleanup EXIT

for attempt in $(seq 1 30); do
  if curl -fsS "$base_url/api/health" | grep -q '"status":"ok"'; then
    break
  fi
  if [[ "$attempt" == "30" ]]; then
    echo "error: container health endpoint did not become ready" >&2
    exit 1
  fi
  sleep 2
done

echo "health endpoint is ready"

curl -fsS -o /dev/null "$base_url/"
curl -fsS -o /dev/null "$base_url/login"
echo "gateway and neutral login routes returned HTTP 2xx"

root_headers="$(curl -fsSI "$base_url/")"
health_headers="$(curl -fsSI "$base_url/api/health")"

if ! grep -qi '^content-security-policy:' <<<"$root_headers"; then
  echo "error: Content-Security-Policy header is missing" >&2
  exit 1
fi
if ! grep -qi '^strict-transport-security:' <<<"$root_headers"; then
  echo "error: Strict-Transport-Security header is missing" >&2
  exit 1
fi
if grep -qi '^x-powered-by:' <<<"$root_headers"; then
  echo "error: X-Powered-By must remain disabled" >&2
  exit 1
fi
if ! grep -qi '^cache-control:.*no-store' <<<"$health_headers"; then
  echo "error: health endpoint must be non-cacheable" >&2
  exit 1
fi

echo "security and health-cache headers verified"

assert_redirect() {
  local host="$1"
  local request_path="$2"
  local expected_location="$3"
  local headers status location

  headers="$(curl -sSI -H "Host: $host" "$base_url$request_path")"
  status="$(awk 'NR==1 {print $2}' <<<"$headers")"
  location="$(awk 'BEGIN{IGNORECASE=1} /^location:/ {sub(/\r$/, "", $2); print $2; exit}' <<<"$headers")"

  if [[ "$status" != "308" ]]; then
    echo "error: expected 308 for host=$host path=$request_path, got $status" >&2
    exit 1
  fi
  if [[ "$location" != "$expected_location" ]]; then
    echo "error: redirect mismatch for host=$host path=$request_path" >&2
    echo "expected: $expected_location" >&2
    echo "actual:   $location" >&2
    exit 1
  fi
}

assert_redirect "medoriaco.com" "/health/en" "https://medoria.co/health/en"
assert_redirect "www.medoriaco.com" "/beauty/en" "https://medoria.co/beauty/en"
assert_redirect "www.medoria.co" "/login" "https://medoria.co/login"

echo "canonical host redirects verified"

locale_headers="$(curl -sSI "$base_url/en")"
locale_status="$(awk 'NR==1 {print $2}' <<<"$locale_headers")"
locale_location="$(awk 'BEGIN{IGNORECASE=1} /^location:/ {sub(/\r$/, "", $2); print $2; exit}' <<<"$locale_headers")"
if [[ "$locale_status" != "308" || "$locale_location" != "/health/en" ]]; then
  echo "error: locale-first redirect mismatch: status=$locale_status location=$locale_location" >&2
  exit 1
fi

echo "legacy locale redirect verified"
echo "production container smoke tests passed"
