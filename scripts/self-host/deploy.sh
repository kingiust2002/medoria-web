#!/usr/bin/env bash
# Deploy the current main to the production VPS, from the VPS.
#
#   cd ~/apps/medoria-staging && bash scripts/self-host/deploy.sh
#
# Deploying is deliberate by design: merging to main does not touch production
# (runbook §1 "Current change workflow"). This script is that deliberate step
# in one command -- it does not add automation, it removes typing.
#
# It refuses to run rather than half-deploy, and it always ends by proving the
# site is actually up. A `docker compose up -d` that prints "Started" is not
# evidence the container stayed running: on 2026-08-18 Caddy crash-looped on an
# ambiguous site definition while compose reported success, and the site was
# down until someone ran `ps`. See the §18.2 execution record.
set -Eeuo pipefail

cd "$(dirname "$0")/../.."

COMPOSE=(docker compose --env-file deploy/.env -f deploy/compose.app.yml)
SITE="https://medoriaco.com"

step() { printf '\n\033[1m== %s\033[0m\n' "$1"; }

step "Checking the working tree is clean"
if [[ -n "$(git status --porcelain)" ]]; then
  echo "error: the checkout has uncommitted changes. Deploy only a clean tree." >&2
  git status --short >&2
  exit 1
fi

branch="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$branch" != "main" ]]; then
  echo "error: on '$branch', expected 'main'." >&2
  echo "       switch deliberately (git checkout main) -- this script will not do it for you," >&2
  echo "       because moving the production checkout between branches is a decision, not a step." >&2
  exit 1
fi

step "Fetching and fast-forwarding main"
git fetch origin main
git pull --ff-only origin main
git log --oneline -1

step "Installing dependencies"
npm ci

step "Validating the environment contract"
npm run check:self-host-env -- deploy/.env

step "Building the application image"
"${COMPOSE[@]}" build --pull app

step "Starting the stack"
"${COMPOSE[@]}" up -d

# Caddy needs a moment to bind and settle before its status means anything.
sleep 8

step "Container status"
"${COMPOSE[@]}" ps

# `docker compose ps` is printed for the operator, but the check below is what
# actually decides: a crash-looping container reports "Restarting", not "Up".
if "${COMPOSE[@]}" ps --format '{{.Name}} {{.State}}' | grep -qiv '^\S* running$'; then
  if "${COMPOSE[@]}" ps | grep -qi restarting; then
    echo >&2
    echo "error: a container is restarting -- the deploy did NOT succeed." >&2
    echo "       logs follow; roll back with:" >&2
    echo "         git checkout staging/self-hosting-sync-20260802" >&2
    echo "         ${COMPOSE[*]} build --pull app && ${COMPOSE[*]} up -d" >&2
    echo >&2
    "${COMPOSE[@]}" logs --tail=40 >&2
    exit 1
  fi
fi

step "Live checks against $SITE"
fail=0
check() {
  local path="$1" expect="$2" code
  code="$(curl -sS -o /dev/null -w '%{http_code}' "$SITE$path" || echo 000)"
  printf '  %-28s %s (expected %s)' "$path" "$code" "$expect"
  if [[ "$code" == "$expect" ]]; then printf '  ok\n'; else printf '  FAILED\n'; fail=1; fi
}
check "/"            200
check "/api/health"  200
check "/health/en"   200
check "/beauty/en"   200

www="$(curl -sS -o /dev/null -w '%{http_code}' https://www.medoriaco.com/ || echo 000)"
printf '  %-28s %s (expected 308)' "www -> apex" "$www"
if [[ "$www" == "308" ]]; then printf '  ok\n'; else printf '  FAILED\n'; fail=1; fi

if [[ "$fail" -ne 0 ]]; then
  echo >&2
  echo "error: the stack is up but the site is not answering correctly." >&2
  echo "       check logs:  ${COMPOSE[*]} logs --tail=60 app caddy" >&2
  exit 1
fi

printf '\n\033[1mDeployed %s and verified live.\033[0m\n' "$(git rev-parse --short HEAD)"
