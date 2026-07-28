#!/usr/bin/env bash
set -Eeuo pipefail

required_cpu="${MIN_VCPU:-8}"
required_ram_mb="${MIN_RAM_MB:-15000}"
# Providers advertise decimal GB. A 160 GB disk is about 149 GiB before
# partition/filesystem overhead, so 145 GiB is the correct acceptance floor.
required_disk_gib="${MIN_DISK_GIB:-145}"
failures=0
warnings=0

pass() { printf 'PASS  %s\n' "$*"; }
warn() { printf 'WARN  %s\n' "$*"; warnings=$((warnings + 1)); }
fail() { printf 'FAIL  %s\n' "$*"; failures=$((failures + 1)); }

printf 'Medoria VPS preflight (read-only)\n'
printf '================================\n'

if [[ -r /etc/os-release ]]; then
  # shellcheck disable=SC1091
  source /etc/os-release
  printf 'OS: %s\n' "${PRETTY_NAME:-unknown}"
else
  fail '/etc/os-release is unavailable'
  ID=unknown
  VERSION_ID=unknown
fi

architecture="$(dpkg --print-architecture 2>/dev/null || uname -m)"
printf 'Architecture: %s\n' "$architecture"
case "$architecture" in
  amd64|x86_64) pass 'x86_64/amd64 architecture' ;;
  *) fail "unsupported purchase target: expected amd64/x86_64, got $architecture" ;;
esac

case "${ID:-}:${VERSION_ID:-}" in
  ubuntu:24.04|debian:12) pass "supported OS baseline: ${ID} ${VERSION_ID}" ;;
  *) warn "tested baseline is Ubuntu 24.04 or Debian 12; detected ${ID:-unknown} ${VERSION_ID:-unknown}" ;;
esac

cpu_count="$(nproc)"
printf 'vCPU: %s\n' "$cpu_count"
if (( cpu_count >= required_cpu )); then
  pass "vCPU >= $required_cpu"
else
  fail "vCPU $cpu_count is below required $required_cpu"
fi

ram_mb="$(awk '/MemTotal:/ { printf "%d", $2 / 1024 }' /proc/meminfo)"
printf 'RAM: %s MB\n' "$ram_mb"
if (( ram_mb >= required_ram_mb )); then
  pass "RAM >= ${required_ram_mb} MB"
else
  fail "RAM ${ram_mb} MB is below required ${required_ram_mb} MB"
fi

root_disk_bytes="$(df -B1 --output=size / | tail -n 1 | tr -d ' ')"
root_disk_gib="$((root_disk_bytes / 1024 / 1024 / 1024))"
printf 'Root filesystem size: %s GiB\n' "$root_disk_gib"
if (( root_disk_gib >= required_disk_gib )); then
  pass "root filesystem >= ${required_disk_gib} GiB"
else
  fail "root filesystem ${root_disk_gib} GiB is below required ${required_disk_gib} GiB"
fi

filesystem_type="$(findmnt -n -o FSTYPE / 2>/dev/null || true)"
printf 'Root filesystem type: %s\n' "${filesystem_type:-unknown}"
case "$filesystem_type" in
  ext4|xfs) pass "supported root filesystem: $filesystem_type" ;;
  *) warn "unusual root filesystem: ${filesystem_type:-unknown}" ;;
esac

if command -v systemd-detect-virt >/dev/null 2>&1; then
  virtualization="$(systemd-detect-virt 2>/dev/null || true)"
  printf 'Virtualization: %s\n' "${virtualization:-none/unknown}"
fi

if timedatectl show -p NTPSynchronized --value 2>/dev/null | grep -qx yes; then
  pass 'system clock is NTP-synchronized'
else
  warn 'system clock is not confirmed NTP-synchronized'
fi

if command -v docker >/dev/null 2>&1; then
  docker_version="$(docker --version 2>/dev/null || true)"
  printf 'Docker: %s\n' "${docker_version:-installed but inaccessible}"
  if docker info >/dev/null 2>&1 || sudo -n docker info >/dev/null 2>&1; then
    pass 'Docker daemon is reachable'
  else
    warn 'Docker is installed but daemon access was not verified'
  fi
else
  warn 'Docker Engine is not installed yet'
fi

if docker compose version >/dev/null 2>&1 || sudo -n docker compose version >/dev/null 2>&1; then
  pass 'Docker Compose v2 is available'
else
  warn 'Docker Compose v2 is not available yet'
fi

for port in 80 443; do
  if ss -H -ltn "sport = :$port" 2>/dev/null | grep -q .; then
    warn "TCP port $port is already listening"
  else
    pass "TCP port $port is free"
  fi
done

if ss -H -ltn 'sport = :5432' 2>/dev/null | grep -q '0.0.0.0\|\[::\]'; then
  fail 'PostgreSQL port 5432 is listening on all interfaces'
else
  pass 'PostgreSQL is not publicly listening on TCP 5432'
fi

if ss -H -ltn 'sport = :6543' 2>/dev/null | grep -q '0.0.0.0\|\[::\]'; then
  fail 'pooler port 6543 is listening on all interfaces'
else
  pass 'pooler is not publicly listening on TCP 6543'
fi

printf '\nSummary: %d failure(s), %d warning(s)\n' "$failures" "$warnings"

if (( failures > 0 )); then
  exit 1
fi
