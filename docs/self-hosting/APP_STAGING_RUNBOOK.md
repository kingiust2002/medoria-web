# Application-only staging runbook

This runbook deploys the Next.js application to a VPS while keeping Supabase Cloud, Vercel production, and production DNS unchanged.

## Safety boundary

- Do not merge this branch into `main` before review.
- Do not change `medoriaco.com` nameservers or remove its Vercel domain assignments.
- Do not change `medoria.co` until GoDaddy access is restored and the new stack is validated.
- Do not rotate or delete Supabase Cloud credentials during app-only staging.
- Do not paste secrets into chat, GitHub, screenshots, issue comments, or shell commands that remain in history.

## Required server baseline

- Ubuntu 24.04 LTS or Debian 12
- Docker Engine and Docker Compose v2
- Public IPv4 address
- inbound TCP 22, 80, and 443
- optional inbound UDP 443 for HTTP/3
- at least 4 vCPU, 8 GB RAM, and 80 GB NVMe for app-only staging

The final combined application and self-hosted Supabase server will be sized separately.

## Temporary staging DNS

Use a non-production hostname such as `staging.medoriaco.com` only after the VPS IP is known.

The current `medoriaco.com` authoritative DNS is hosted by Vercel. Adding one staging `A` record later does not require changing nameservers or existing production records. Do not create or modify any DNS record until the server is ready.

## 1. Secure server access

Use a sudo-capable non-root administrator. Install an SSH public key and test key login from a second terminal before disabling password authentication. Never send the private key to anyone.

```bash
sudo apt update
sudo apt install -y ca-certificates curl git ufw
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 443/udp
sudo ufw enable
sudo ufw status verbose
```

Install Docker Engine and the Docker Compose plugin from Docker's official repository, then verify:

```bash
sudo docker version
sudo docker compose version
```

Membership in the `docker` group is effectively root access. Use `sudo docker` unless that tradeoff is explicitly accepted.

## 2. Check out the staging branch

```bash
git clone --branch infra/self-hosting --single-branch \
  https://github.com/kingiust2002/medoria-web.git
cd medoria-web
```

For a private repository, use a short-lived deploy key or GitHub App credential. Do not place a personal access token in the clone URL.

## 3. Create the server environment file

```bash
cp deploy/.env.example deploy/.env
chmod 600 deploy/.env
nano deploy/.env
```

Rules:

- `STAGING_HOST` is the exact temporary hostname.
- `NEXT_PUBLIC_SITE_URL` is `https://` plus that exact hostname.
- Supabase URL and keys still point to Supabase Cloud during this phase.
- `NEXT_PUBLIC_*` values are embedded during build; changing them requires rebuilding.
- Server-only credentials are loaded at runtime from `deploy/.env`.
- Never commit `deploy/.env`.

Run the preflight check before Docker:

```bash
npm ci
npm run check:self-host-env -- deploy/.env
```

The checker reports variable names and validation failures only. It never prints secret values.

## 4. Prepare staging DNS

After the VPS is reachable and before starting Caddy, add only the temporary staging record in the current DNS provider:

```text
staging.medoriaco.com  A  <VPS_IPV4>
```

Wait until the hostname resolves to the VPS. Production records and nameservers remain unchanged.

## 5. Validate and start the Compose stack

From the repository root:

```bash
sudo docker compose \
  --env-file deploy/.env \
  -f deploy/compose.app.yml \
  config
```

Confirm that port 3000 is not published publicly and that only Caddy binds ports 80 and 443.

Build and start:

```bash
sudo docker compose \
  --env-file deploy/.env \
  -f deploy/compose.app.yml \
  up -d --build
```

Inspect status:

```bash
sudo docker compose \
  --env-file deploy/.env \
  -f deploy/compose.app.yml \
  ps
```

The application must report healthy before Caddy is considered ready.

## 6. Inspect bounded logs

```bash
sudo docker compose \
  --env-file deploy/.env \
  -f deploy/compose.app.yml \
  logs --tail=200 app caddy
```

Compose retains at most five 10 MB JSON log files per service to prevent unbounded disk use.

## 7. External health checks

Run from another machine:

```bash
curl -fsS https://staging.medoriaco.com/api/health
curl -I https://staging.medoriaco.com/
```

The health endpoint must return HTTP 200 with `status: ok` and no cacheable response.

## 8. Application smoke tests

Verify all of the following on the staging hostname:

- gateway `/`
- Health English, Russian, and Tajik routes
- Beauty English, Russian, and Tajik routes
- catalog search, filters, pagination, and product pages
- remote Supabase images and Next.js image transformation through `sharp`
- quote/inquiry submission with valid and invalid CAPTCHA
- Health operator login, secure cookie, session persistence, logout, and protected routes
- Beauty operator login, secure cookie, session persistence, logout, and protected routes
- spreadsheet import only in a non-destructive test
- ISR and revalidation after a controlled content change
- old locale-first redirects
- canonical URLs, sitemap, robots, Open Graph image, and hreflang
- WhatsApp and Telegram handoffs
- Upstash rate limiting without in-memory fallback warnings

Do not perform destructive imports or bulk product entry during app-only staging.

## 9. Observe resources for at least 48 hours

```bash
sudo docker stats --no-stream
sudo docker system df
sudo df -h
sudo free -h
```

Record and investigate:

- any container restart
- sustained memory above 70%
- disk or Docker-volume growth
- slow image transformations
- failed Server Actions
- rate-limit fallback warnings
- secure-cookie or client-IP errors behind Caddy

## 10. Update procedure

```bash
cd /path/to/medoria-web
git fetch origin
git checkout infra/self-hosting
git pull --ff-only
npm ci
npm run check:self-host-env -- deploy/.env
sudo docker compose --env-file deploy/.env -f deploy/compose.app.yml build --pull app
sudo docker compose --env-file deploy/.env -f deploy/compose.app.yml up -d
sudo docker compose --env-file deploy/.env -f deploy/compose.app.yml ps
```

Check health and logs after every update. Keep the previous image until the new container passes smoke tests.

## 11. App-only rollback

This phase does not replace production. Rollback is:

```bash
sudo docker compose --env-file deploy/.env -f deploy/compose.app.yml down
```

Vercel and Supabase Cloud continue serving production.

## Exit criteria for Supabase staging

Do not start database migration until all conditions are true:

- Docker image builds reproducibly.
- health checks remain stable.
- all public and operator routes pass.
- image optimization works with `sharp`.
- proxy client-IP and secure-cookie behavior are verified.
- no production DNS was changed.
- staging runs for at least 48 hours without unexplained restarts.
- the required Supabase services are inventoried.

## Known cleanup before final merge

`@vercel/analytics` is no longer rendered but remains in `package.json` and `package-lock.json` until the lockfile is regenerated in a normal npm environment. It is inert in the self-hosted runtime. Remove it before final merge.
