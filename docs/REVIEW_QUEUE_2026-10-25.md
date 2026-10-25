# Review queue, merge order and what is proven: 2026-10-25

Twelve pull requests are open for review. **None is merged and nothing is deployed.** This page says which depends on which, in what order to merge and deploy them, what each one needs from the owner, and, claim by claim, what has been shown and how.

## 1. How the pull requests depend on each other

```
main
 ├─ #182 docs: status report 2026-10-25 (runbook §23.9)            independent
 ├─ #184 ops: backup alerts + server heartbeat                      independent
 ├─ #186 deps: safe dev updates + Dependabot config (replaces #176) independent
 ├─ #188 ops: restore drill, Supavisor cookie check, cleanup guide  independent
 └─ #183 test: real-browser e2e + tablet header fix
     ├─ #185 operator security (migration 30)
     │    └─ #187 inactive categories/brands not public (migration 31)
     │         └─ #189 request management (migration 32)
     └─ #190 CI browser job, analytics/CSP/rate-limit decisions, stale refs
          └─ #191 server-side catalog search and paging
               └─ #192 inquiry list (migration 33)
                    └─ #193 printable catalog, completeness markers, documents needs
```

A stacked pull request shows the diff against its parent branch. **Merge bottom-up** (parent first). When GitHub deletes the parent branch after its merge, it retargets the child to `main` by itself; if it does not, change the base by hand before merging the child.

## 2. The twelve, in one line each

| PR | What | Migration | Needs from the owner |
| --- | --- | --- | --- |
| #182 | Runbook §23.9: done items closed, status of the 2026-10-24 rollout | none | read |
| #183 | Real-browser tests (panel → public site, archive → 404, mobile widths) + a real tablet-width header fix found by them | none | none |
| #184 | Backup failure/stop alerts through an outside check, server heartbeat, backup script no longer depends on the working directory | none | create the two outside checks (docs/MONITORING_AND_ALERTS.md) |
| #185 | Panel sessions you can end, activity log, optional two-step login with recovery codes (both panels) | **30** | decide on 2FA; docs/OPERATOR_SECURITY.md |
| #186 | Dev-only dependency updates; Dependabot cannot open major bumps (the red #176 was Tailwind 4) | none | none |
| #187 | A switched-off category or brand was still readable through the public API | **31** | none |
| #188 | Backup restore drill; Supavisor cookie check; token/Docker/cookie clean-up steps | none | run the drill; rotate the cookie; revoke the old GitHub token |
| #189 | Tracking code, assignee, "waiting 24 h" and "notice did not arrive" markers, reminders to Telegram | **32** | set `QUOTE_REMINDER_TOKEN`, cron (optional) |
| #190 | Browser tests run in CI; analytics/CSP/rate-limit/HSTS decisions written down; IPv6 limit fix; stale Vercel/`medoria.tj` references | none | privacy-notice inputs (docs/PRIVACY_AND_ANALYTICS.md) |
| #191 | The catalog stops downloading everything (500-row cap) and pages on the server | none | none |
| #192 | Several products in one request (Health visitor flow; server side for both houses) | **33** | none |
| #193 | Printable multilingual catalog; "what is missing" markers on products; what only the owner can supply | none | product facts, pro-forma inputs |

## 3. Suggested order

1. **Before anything**: a fresh production backup that PASSES locally and in R2 (runbook §22).
2. **Merge** in this order: #182, #186, #183, #184, #188, #185, #187, #189, #190, #191, #192, #193 (the independent ones can go in any order). Resolve the known conflicts below as they appear.
3. **Deploy deliberately** (not automatic) the merged `main`; check `docker compose ps` and a live `curl` afterwards (the 2026-08-18 lesson).
4. **Migrations**, each one is additive, idempotent and aborts as a whole if its own check fails; run them after the matching code is live, or before (all code tolerates the old schema: it retries without the new column, or treats the missing table as before):
   - **30** (#185) together with that deploy: everyone logs in once more afterwards.
   - **31** (#187) policies only.
   - **32** (#189) tracking codes for existing requests.
   - **33** (#192) the `items` column.
   After each: `npm run check:rls` against the live API (the probe knows the new tables and the inactive-category rule).
5. **Owner-only set-up** (§5), then the live confirmations (§4, last column).

### Known conflicts when merging

- **#189 and #192** both change the insert in `lib/actions/quote.js` / `lib/beauty/actions/quote.js`, the notice text in `lib/notify/telegram.js` and the pinned insert expression in `tests/telegram-notify.test.mjs`. Keep both: the shared `insertRequest()` (#192) already reads the stored row back with `.select()`, which is what #189 needs for the tracking code; the notice shows `Code:` and then the product list.
- **#189 and #190** both touch `scripts/check-self-host-env.mjs`, in different places (reminder token vs analytics warning): keep both blocks.
- **#193** adds the "incomplete" stat to the same dashboard grid as #189's two new counters: keep all.

## 4. What is proven, and how (strict)

"Code ready" = written and reviewed by its own tests. "Tested" = the named checks passed here (a sandbox, a fake database, throw-away PostgreSQL 16 clusters, a phone-sized Chromium). "Deployed" and "confirmed on the live site" are **no** for every row except the read-only facts in the last block.

| Claim | Code ready | Tested (evidence) | Deployed | Confirmed on the live site |
| --- | --- | --- | --- | --- |
| Price change in the panel shows on the public page; archive → real 404 → reactivate; Quotes screen; Health ≠ Beauty panels | yes | #183: browser tests, with a negative control (cache purge disabled → they fail) | no | no (owner-run script `scripts/e2e/live-panel-check.mjs`, uses a test product and restores it) |
| Layout at 320–1366 px, menus open, no sideways scroll | yes | #183: ten widths (320–1366 px), public pages + both panels; #189/#191/#192/#193 add a 320 px check for each new screen (long unbroken text included); an **emulated** phone, not a real one | no | no (look at a real phone after the deploy) |
| Backup failure/stop alerts reach you from outside the server | yes | #184: script tests with a stand-in alert server (start/success/fail pings, missing config) | no | **no**: needs the two outside checks and `--alert-test` |
| Sessions, activity log, 2FA with recovery codes, both panels | yes | #185: unit + real-browser + migration 30 on PostgreSQL 16 | no | no |
| Inactive categories/brands not public | yes | #187: migration on PostgreSQL 16 incl. a stray policy and an old schema | no | no (`npm run check:rls` after migration 31) |
| Restore drill works | yes | #188: 8 tests against real PostgreSQL clusters (good backup passes; corrupt file, wrong count, unreadable dump, missing file fail) | no | no: owner runs it once |
| Request tracking, assignee, reminders, notice-failure | yes | #189: unit, migration 32 on PostgreSQL 16 (**caught a defect that would have stopped every form**, fixed), cron script against a real HTTP server, 8 browser flows | no | no; real Telegram delivery of the new texts not tried |
| Browser tests run in CI | yes | #190: the new job ran green on GitHub's runner | no | n/a |
| Server-side catalog search/paging | yes | #191: 10 unit tests (2600-row mock), 6 browser flows | no | no |
| Inquiry list | yes | #192: unit, migration 33 on PostgreSQL 16, 5 browser flows | no | no |
| Printable catalog, completeness markers | yes | #193: 5 unit + 6 browser flows incl. real PDFs in 4 languages | no | no; needs a look with real photos and text |

**Read-only facts about the live site, 2026-10-25** (anyone can repeat them): six pages fetched contain no Google/Yandex tag and no external script; the public pages send no `Set-Cookie`; the sitemap lists one Health product and no Beauty product; the headers are as in `docs/SECURITY_DECISIONS.md`. The Vercel DNS API refused to list `medoriaco.com`'s records (403), so the subdomain list for HSTS is unverified.

## 5. Owner-only actions, collected

1. **Outside alert checks** (healthchecks.io + an uptime monitor), then `--alert-test` and `--alert-test-clear` (docs/MONITORING_AND_ALERTS.md). Until then a stopped server or a failed backup can only be noticed by looking.
2. **Live panel check** with a test product: `scripts/e2e/live-panel-check.mjs` (docs/E2E_TESTS.md).
3. **Migrations 30–33** and the deploy, in the order of §3.
4. **Two-step login**: generate secrets with `scripts/operator-2fa.mjs`, keep the recovery codes, put the variables in `deploy/.env` (docs/OPERATOR_SECURITY.md).
5. **Restore drill** once now, then monthly (docs/SECRETS_AND_ACCESS_CLEANUP.md §4).
6. **Supavisor cookie**: check, rotate, verify (same document §2). **Revoke the old GitHub classic token** (§1).
7. **Reminders** (optional): `QUOTE_REMINDER_TOKEN`, the cron line, an outside check for it (docs/QUOTE_MANAGEMENT.md).
8. **Privacy notice inputs** and the **AI provider** question (docs/PRIVACY_AND_ANALYTICS.md); do not enable analytics before the notice exists.
9. **Subdomain list** from the DNS panel, if `includeSubDomains` for HSTS is ever wanted (docs/SECURITY_DECISIONS.md §3).
10. **Product facts, claims, translation review and the pro-forma inputs** (docs/CATALOG_DOCUMENTS_NEEDS.md).

## 6. Not built, on purpose

A Beauty visitor-facing inquiry list and printable catalog (Beauty has no published products; its server side and panel are ready); a pro-forma invoice and a price list (they need the owner's company, bank, tax and price data); a public tracking-code lookup (reasons in docs/QUOTE_MANAGEMENT.md); Redis for rate limiting; a consent banner (analytics is off); per-person panel accounts (the login is shared, so "assignee" is a typed label).
