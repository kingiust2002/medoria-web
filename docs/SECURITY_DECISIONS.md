# Security decisions: what was weighed, what was kept, what was changed

Written 2026-10-25 for the open items "in-memory rate limit" and "headers left as they are". Each section: the facts (checked in the code or on the live site), the decision, and what would change it. A decision to **keep** something is a decision, not an omission.

## 1. Rate limiting stays in memory (no Redis / Upstash)

**Facts.**
- `lib/security/rateLimit.js` keeps fixed-window counters in a `Map` inside the app process. It guards the public contact forms (5/min and 20/h per visitor), the captcha issuer, the AI chat route and, through its own copy of the same idea, the operator logins.
- On the old host (Vercel serverless) "per instance" meant *many* short-lived instances, so memory counters were close to useless there. That is the situation the original note in `SECURITY-CHECKLIST.md` describes.
- **Production now runs one app container** on one VPS (runbook §20, §22). With one process, "per instance" **is** global: every request meets the same counters.
- Counters are lost when the container restarts (a deploy). The windows are one minute to one hour, so a restart gives an attacker at most one fresh window, once per deploy.
- Every path fails open by design: a limiter problem can never take the forms down.
- Optional Upstash support exists in the code and is unused (no `UPSTASH_*` values in `deploy/.env`).

**Decision: keep memory counters; do not add Redis.** Reasons: it solves a multi-instance problem the deployment does not have; it would add a third-party service, a secret, a network dependency and a new failure mode; and it would send every visitor's address to that third party, which is worse for privacy than the status quo. A self-hosted Redis container would add an operational part (backup, upgrades, monitoring) for no gain with one process.

**Two real weaknesses were found while reading the code and are fixed in this change** (small, tested):
1. *IPv6 visitors were counted per address.* One home or mobile subscriber normally holds a whole `/64` (2^64 addresses), so a per-address limit never limited anybody. Keys now use the IPv4 address, or the `/64` prefix for IPv6 (an IPv4-mapped IPv6 address counts as its IPv4). This also closes the cheap way to fill the store with distinct keys.
2. *A full store wiped every counter.* At 5000 live buckets the old code cleared the whole map, so a flood of distinct keys also reset the counters of everyone else, including a login that was being rate limited. It now drops only the oldest quarter. Negative control: the same scenario run against the previous limiter forgets a blocked caller; the new one keeps it (`tests/analytics-and-headers.test.mjs`).

**What would change the decision:** a second app container (scale-out or blue/green with both live), or evidence of a distributed attack that a single process cannot absorb (then a network-level limit at Caddy or Cloudflare is the first answer, before Redis).

**Residual risk, accepted:** an attacker with thousands of distinct IPv4 addresses can still evict old counters (bounded to the oldest quarter, one window); the math captcha stops bulk bots, not a determined scripted attacker. Both are in `SECURITY-CHECKLIST.md`.

## 2. Content-Security-Policy

**Facts.** `script-src` contains `'unsafe-inline'`; the live header was read on 2026-10-25. Next.js writes small inline bootstrap scripts into every page; a CSP without `'unsafe-inline'` needs a per-request **nonce**, and a nonce means every page is rendered per request. That would switch off ISR/static generation, which is what keeps the catalog pages fast and keeps the database load low.

**Decision: keep `'unsafe-inline'` for scripts.** Compensations that are in place: scripts only from `'self'` (and from a provider only if configured, below); no `'unsafe-eval'` in production; `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`; `frame-ancestors 'self'`; `upgrade-insecure-requests`; user text is rendered through React (escaped) and the few `dangerouslySetInnerHTML` uses are JSON-LD of our own data (escaped by `safeJsonLd`) and a one-line `lang`/`dir` setter whose value is checked against the fixed locale list (`notFound()` otherwise) before it is written. The remaining exposure is an XSS bug that injects an inline script; the answer to that is not having the bug, and the policy still blocks loading attacker scripts from elsewhere and exfiltration to other hosts (`connect-src`).

**Changed:** the policy used to allow Google Tag Manager, Google Analytics, DoubleClick and Yandex hosts **always**, although no analytics id is set in production (checked on the live pages 2026-10-25: no tag, no external script). It now allows a provider only if its id is configured at build time (the ids reach the build as Docker build args, so the policy and `AnalyticsScripts.jsx` always agree). Result today: no third-party host in the policy at all. Tested both ways.

**What would change it:** dropping ISR for the public pages (then nonces become affordable), or the first real need for inline-script-heavy third parties (then hash or nonce them).

## 3. HSTS: `max-age=63072000` without `includeSubDomains` or `preload`

**Facts.** Live header: `strict-transport-security: max-age=63072000` (two years). Known subdomain in use: `api.medoriaco.com` (Supabase), served over HTTPS by Caddy. The complete list of DNS names could **not** be read here (the Vercel DNS API answered 403 for this account), so "every subdomain is HTTPS" is not verified. Public pages set no cookies (live check: no `Set-Cookie`), so the usual benefit of `includeSubDomains` (stopping cookie injection from a sibling subdomain) does not apply to visitors.

**Decision: leave it as is.** `includeSubDomains` is a two-year commitment for names nobody has listed, and `preload` is effectively permanent. The gain is small today; the cost of a mistake (a future `http`-only subdomain unreachable for browsers that saw the header) is high.

**To revisit:** list every record of `medoriaco.com` in the DNS panel, confirm each name that serves web content answers over HTTPS with a valid certificate, then add `includeSubDomains` with a shorter `max-age` first (e.g. one day, then one month, then two years). `preload` only after a deliberate decision to join the list.

## 4. Other headers

`X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN` (matches `frame-ancestors 'self'`), `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` with camera/microphone/geolocation/payment/usb denied, `Cross-Origin-Opener-Policy: same-origin-allow-popups` (needed so the WhatsApp/Telegram hand-off window keeps working) and `poweredByHeader: false` are kept: each has a reason and none has a known problem. `Cross-Origin-Embedder-Policy` is deliberately **not** set (it would break images from the storage host for no benefit here).

## 5. Summary

| Item | Decision | Changed in code |
| --- | --- | --- |
| Memory rate limit | keep (one process) | IPv6 grouped by /64; eviction drops the oldest quarter only |
| CSP `'unsafe-inline'` | keep (ISR) | analytics hosts only if their id is set |
| HSTS `includeSubDomains` / `preload` | keep off until all subdomains are listed | no |
| Other headers | keep | no |
