# Medoria — Production Security Checklist

Living checklist for deploys. Pairs with PR #30 (baseline hardening) and the
"Paranoid security hardening" PR (captcha, strict service role, durable-ready
rate limiting, tests).

## Required production env vars

| Var | Purpose | Strictness |
|-----|---------|------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | required |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public reads only (catalog) | required |
| `SUPABASE_SERVICE_ROLE_KEY` | server-only writes (quotes, operator panel, uploads) | **required in production** — quote submission refuses to fall back to the anon key |
| `OPERATOR_USERNAME` / `OPERATOR_PASSWORD_HASH` / `OPERATOR_SESSION_SECRET` | operator login + signed sessions | required for `/operator` |
| `CAPTCHA_SECRET` | signs captcha challenges | optional — falls back to `OPERATOR_SESSION_SECRET`; set a dedicated value if you ever rotate the operator secret frequently |
| `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` | **optional** durable rate limiting | when both are set, all public rate limits (quotes, captcha minting, AI chat) automatically switch from per-instance memory to global Redis — no code change, no SDK |
| `GEMINI_API_KEY` / `HUGGING_FACE_API_KEY` / `ANTHROPIC_API_KEY` | AI assistant (optional) | route is same-origin + rate-limited + 32KB body cap |
| `GOOGLE_TRANSLATE_API_KEY` | operator auto-translate (optional) | input length-capped |

## Supabase RLS assumptions (the code relies on these)

- `products`, `categories`: RLS enabled, **public SELECT** policies (catalog).
- `quote_requests`: RLS enabled; **no anon SELECT**; anon INSERT must be
  **dropped** via `migrations/09_security_hardening.sql` **step 3** after this
  release is live (the app writes server-side with the service role).
- `import_logs`: RLS enabled, no public policies (service role only).
- `contact_inquiries` (legacy, unused): drop its public-insert policy together
  with migration 09 step 3.
- Storage bucket `product-images`: public read, **no public write** (uploads go
  through the authenticated server action with the service role).

Verify from the outside at any time (uses anon key only):

```bash
NEXT_PUBLIC_SUPABASE_URL=... NEXT_PUBLIC_SUPABASE_ANON_KEY=... npm run check:rls
# add --insert-test once, after running migration 09 step 3
```

## Post-deploy checks (5 minutes)

1. `npm run check:rls` → all PASS.
2. Open the contact page: solve the captcha → submit succeeds; submit a wrong
   answer → localized error + new question, nothing stored.
3. Product page → "request quote" modal: same captcha behavior.
4. Quote appears in `/operator/quotes`.
5. Browse home/catalog/product with DevTools console open — no CSP violations
   (if an analytics asset is blocked, allowlist it in `next.config.js` CSP).
6. `/operator` without a session redirects to `/login/health`; `/beauty/operator` without a session redirects to `/login/beauty`. The old `/operator/login` and `/beauty/operator/login` URLs are retired — both bounce to `/login`, the only entry point, instead of ever rendering a form directly.
7. `/fa` routes render (Persian stays available, noindexed).

## Abuse-protection behavior (current)

- **Captcha**: server-issued HMAC-signed math challenge, 10-min TTL, answer
  hash never leaves the server, single-use after success, Persian/Arabic digit
  input accepted. Required on quote + contact submissions; not bypassable from
  client code. Challenge minting rate-limited (30/min/IP).
- **Honeypot**: hidden `website` field — bots that fill it get a fake success.
- **Rate limits** (per IP): quotes 5/min + 20/hr; captcha mint 30/min; AI chat
  10/min + 60/hr; operator login 5 fails/10 min per IP **and** per username.
- Limits are **per server instance** (reset on cold start) until the Upstash
  env vars are set — then they become global/durable automatically. This is
  the single most valuable future infra upgrade (~free tier covers this site).

## Known residual risks / accepted trade-offs

- Math captcha stops dumb/bulk bots, not a targeted scripted attacker (who is
  then bounded by rate limits). Upgrade path: Cloudflare Turnstile (free,
  privacy-friendly) if targeted spam ever appears.
- Captcha replay guard and memory rate limits are per-instance until Upstash
  is configured.
- CSP keeps `script-src 'unsafe-inline'`: required by Next.js inline runtime +
  GA/Metrica bootstraps without nonce infrastructure; nonces would force every
  page dynamic and defeat ISR. Next stricter step: move GA/YM to tag-manager-
  less, hash the few inline snippets, adopt nonces only if ISR is dropped.
- `npm audit`: remaining advisories are fixed only in Next 15/16 (major). Several are
  platform-mitigated on Vercel (image optimizer, smuggling) or N/A (no CSP
  nonces, no WebSocket upgrades, no Pages-Router i18n). Plan the major bump
  deliberately, not in a hardening hotfix.

## Secrets hygiene

- Never commit `.env*`. Service role key exists ONLY as a Vercel env var.
- `lib/operator/supabaseAdmin.js` and the import engine are `server-only` —
  the build fails if they ever reach a client bundle.
- **Rotate the GitHub classic token that was shared in chat for CI pushes**,
  and rotate `SUPABASE_SERVICE_ROLE_KEY` if it was ever pasted anywhere.
- Rotating `OPERATOR_USERNAME`/`OPERATOR_PASSWORD_HASH` invalidates all
  operator sessions automatically (credential-version fingerprint).
