# Review queue, merge order and what is proven: 2026-10-25

> **Review update, 2026-10-26:** the original queue below is historical. Read **section 7** for the subsequent independent review, merge disposition and deployment hold. No server deployment or migration was performed by this reviewer.

When this queue was written on 2026-10-25, twelve pull requests (#182–#193) were open; #194 adds this document. At that time none was merged or deployed. Sections 1–6 preserve that original plan and its evidence; they are not a claim about the current GitHub or production state.

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


## 7. Independent integration review, 2026-10-26

### 7.1 Merge disposition and production boundary

Selected for `main`: **#182, #186, #183, #184, #188, #190, #191, #192 and #193**, plus this documentation PR (#194). Check the PR merge records for the exact resulting commits. #192 required a normal merge of `main` into its branch to preserve both the owner-confirmed migration-29 record and the migration-33 entry; its history was not rewritten.

**Held: #185, #187 and #189.** #185 has the two reproducible session-security defects below. #187 and #189 contain it in their branch ancestry, so merging them as submitted would bring the held security code into `main`. This is not a rejection of the category-policy fix itself.

No production backup, SSH command, environment edit, migration, form submission, deletion or deployment was run by the reviewer. Read-only public GETs on 2026-10-26 returned 200 for `/api/health`, `/health/en` and `/beauty/en`, and 404 for `/health/en/catalog/operating-room-gown`. This confirms the already-deployed archived page, not any feature in the new PRs. Chatbot behaviour is outside this review; the comments in #190 do not change its implementation.

**Do not use the historical all-PR deployment sequence in section 3 yet.** The selected code contains migration **33** only; migrations **30–32** belong to the held branches. The preferred next step is to fix the review items, review and merge the remaining code, and perform one coordinated production rollout after a fresh verified backup.

### 7.2 Evidence and limits

- Two isolated local candidates were built: the complete original queue with its integration conflicts resolved, and the selected queue without #185/#187/#189. Neither candidate used production credentials or data.
- Complete original queue: production-mode standalone build succeeded; **82 existing browser flows passed**. An additional temporary browser reproduction confirmed that failed server revocation is nevertheless reported as successful logout. Passing the existing suite did not cover that failure mode.
- Selected queue: production-mode standalone build, lint and **67 existing browser flows passed**, including the four-language PDF generation checks. Three additional temporary browser probes reproduced the stale Quotes list, unreachable single-delete confirmation and skipped fixed-element overflow. Those probes asserted the presence of defects; they are not regression tests proving a fix.
- Selected queue unit tests: initial run **173 passed, 12 skipped, 1 failed**. The failure was `runuser: cannot set groups: Operation not permitted` in the working-directory test, a capability limitation of the review environment. With that one test explicitly excluded, 173 passed and 12 were skipped. The PostgreSQL-dependent tests were skipped because server binaries were unavailable here; this review did not independently repeat the author's real-PostgreSQL migration evidence.
- Production dependency audit: **0 vulnerabilities** for the shared selected/complete-candidate lockfile. Added-source pattern scan found no token/private-key matches; this is a pattern check, not a guarantee about every possible secret.
- GitHub checks were read on the actual PR heads. #187 originally had no `validate` check (only Vercel Preview Comments), so the original blanket statement that `validate` ran on every PR was too broad. PR-head checks are also not an Actions run on the final merge commit of `main`.
- The complete candidate initially exposed a stale assertion in `tests/quote-management.test.mjs` after combining #189 and #192 (see item 8). That local reconciliation was not pushed to the held branches.
- No claim is made here about current backup freshness, Docker package state, live price editing, real Telegram delivery of the new notices, real-phone rendering, 2FA configuration or production migration execution.

### 7.3 Reproduced issues to fix

1. **Session validation falls back on a database/cache outage (blocks #185).** In `lib/operator/security.js`, `isMissingTable()` matches the words `schema cache` regardless of error code. A `PGRST002` error such as `Could not query the database for the schema cache. Retrying.` therefore becomes `unavailable`; `getSession()` accepts that status instead of rejecting an unvalidated signed session. Direct reproduction returned `classifiedMissing: true` and `sessionStatus: unavailable`. Restrict the compatibility fallback to actual missing-table errors; database/cache outages must fail closed. Add coverage through both panels' authentication paths, including a signed unknown/revoked session and the login/audit/deletion paths that share this classifier. This finding does not mean an unsigned/random cookie is accepted.

2. **Logout acknowledges a revocation that failed (blocks #185).** `lib/operator/loginFlow.js:handleLogout()` discards the `{ ok: false }` result from `revokeSession()`, clears the browser cookie, writes `auth.logout` and returns HTTP 200 `{ ok: true }`. Browser reproduction: inject HTTP 500 for `PATCH operator_sessions`, log out, remove the injected fault, then reuse the copied cookie: it still opens the panel. Distinguish local cookie clearing from confirmed server revocation, propagate a failure to the user, and test a successful retry. Check both panel shells' handling of a failed logout response too.

3. **The RLS checker reports server errors as privacy success (previous review, still present).** `scripts/check-rls.mjs:selectProbe()` treats every non-2xx as unreadable and failed JSON parsing as an empty array. A local HTTP fixture returned 500 for every private-table and inactive-product probe: the checker printed PASS for them and exited 0. The optional insert probe also treats any failed insert as proof of access denial. Classify explicit permission denial, valid empty results, missing schema, invalid JSON, network failures and 5xx separately. Unknown/server-error responses must not prove privacy; an empty table alone cannot prove that its contents would be private.

4. **Quotes ignores fresh server rows (previous review, still present).** `components/operator/QuotesPanel.jsx` initializes `useState(initial)` once and never reconciles new props. Browser reproduction: insert an additional fake request while Quotes is open, perform a successful bulk archive (which calls `router.refresh()`), and observe that the additional request remains absent. A full reload reveals it. Reconcile fresh server data with optimistic edits and selection; test additions, changes and removals from another session in both panels.

5. **Single-delete controls are unreachable on a short phone (previous review, still present).** `components/operator/DeleteQuoteModal.jsx` has no height bound or vertical scrolling. At 320×568 with normal filled fields and a valid 160-character message excerpt, the confirmation button began at y=571.5 and ended at y=615.5. Scrolling the document did not reveal it. Constrain/scroll the dialog so confirmation, cancel and errors remain reachable; test both width and height with long content. The bulk dialog already has a height/scroll constraint.

6. **Mobile guard has false-green paths (previous review, still present).** `scripts/check-mobile-width.mjs` ignores navigation failures and HTTP status and excludes all fixed-position elements and their descendants. A real local 404 page was reported as PASS with exit 0; a fixed 700px-wide control in a 320px viewport also returned zero offenders. Verify intended page content/status, explicitly account for expected 404 tests, and measure visible fixed headers/menus/dialogs. Check vertical reachability separately. Remove nonexistent default routes or assert their expected outcome instead of silently treating an error page as layout coverage.

7. **Heartbeat confuses failure to inspect Docker with healthy containers.** `scripts/self-host/uptime-heartbeat.sh` suppresses `docker ps` failure with `|| true` and then interprets empty output as healthy. With a fake `docker` that exits 1, a successful site-health response and healthy disk usage, the script exited 0 without reporting a problem. Preserve/check the Docker command's exit status and send a failure/unknown signal when inspection fails. Add a negative test; fake successful alert delivery alone does not cover this case.

8. **#189 needs an integration-test update when combined with #192.** `tests/quote-management.test.mjs` requires `.insert(row).select().single()` literally inside both quote action files. #192 correctly moves this operation into `lib/inquiry/save.js:insertRequest()`. Preserve the saved-row/tracking-code/notice-result behaviour, but test the actual shared insert path and its returned row. Reconcile both quote actions, the Telegram text and dashboard counters, then run tests on the complete combined result rather than only the separate branch heads.

### 7.4 Next owner actions

For now, keep the running application and database unchanged while the held PRs and the reproduced issues are repaired. A read-only server status check can establish the running commit, container health and Docker holds; do not paste environment files, session cookies or credentials.

Before the eventual rollout: take and verify a **fresh** local + encrypted-R2 backup; preserve the current image as a new rollback tag; pull the reviewed `main` as `medoria`; apply only the migrations present in that reviewed release, stopping on any error; deploy deliberately; run the repaired RLS checker and verify forms, each panel and each Telegram destination. Test live price/archive behaviour with a disposable test product and restore it afterwards.

The new backup/heartbeat/restore scripts are not installed into `/home/medoria/bin` by the app deploy script: install them deliberately. Alert setup needs **three** healthchecks-style checks (backup, backup freshness, server heartbeat) plus an outside HTTP monitor; test actual alert delivery and silence. Enable 2FA and reminders only after their reviewed code/schema is live. Cookie rotation and token revocation remain owner actions; inspect the real Compose service before changing its configuration.

### 7.5 Status of the fixes (2026-10-26)

Nothing below is merged or deployed. "Code ready" means: implemented on the PR branch, with a test that failed before the fix and passes after it. "Tested" is local, on the combined tip of #189 (which contains #185 and #187 and the current `main`, `aa5c64c`). "Confirmed on the live site": none of it.

| # | Issue | Fix lives in | Test that failed before the fix |
| --- | --- | --- | --- |
| 1 | `PGRST002` / schema-cache outage read as "table missing" | #185: `isMissingTable()` accepts only `42P01`/`PGRST205` (or a code-less "relation … does not exist" message); outages fail closed | `tests/security-fail-closed.test.mjs` (8 unit tests: session status, registration, revocation, audit, guarded deletes, second factor) and `tests/e2e/security-fail-closed.e2e.mjs` (9 browser tests, both panels: signed unknown/revoked session, login, deletion) |
| 2 | Logout acknowledged a failed revocation | #185: `handleLogout()` answers 503 `{ok:false}`, keeps the cookie and audits `auth.logout_failed`; both shells show an alert with a retry button | same e2e file (fault injected on `PATCH operator_sessions`, then retry succeeds and the copied cookie stops working) |
| 3 | `check:rls` read 500 / bad JSON / empty as PASS | `scripts/check-rls.mjs`: PASS / FAIL / UNKNOWN per probe, exit **0** all pass, **1** a leak, **3** nothing leaked but some probe was unclear (a 5xx, bad JSON, network error), **2** usage; insert probe passes only on 401/403 | `tests/check-rls-script.test.mjs` (mock server in eight modes) |
| 4 | Quotes list ignored fresh server rows | `lib/operator/quotesSync.js` + `QuotesPanel.jsx`: server rows reconcile with local edits (in-flight rows and unsaved notes/assignee are kept), selection pruned, refresh on focus | `tests/quotes-sync.test.mjs`, `tests/e2e/quotes-reliability.e2e.mjs` |
| 5 | Single-delete dialog unreachable at 320×568 | `DeleteQuoteModal.jsx` / `BulkDeleteQuotesModal.jsx`: dialog bounded to the viewport and scrollable, button row sticky | `tests/e2e/quotes-reliability.e2e.mjs` (button inside the viewport, long content) |
| 6 | `check:mobile` passed 404s and ignored fixed elements | `scripts/check-mobile-width.mjs`: checks status and page content, measures fixed layers, opens the menu, checks vertical reachability, 320×568 viewport, `--expect=/path:404`; default routes are the pages that exist per house | `tests/e2e/check-mobile-fixtures.e2e.mjs`, `tests/e2e/check-mobile.e2e.mjs` |
| 7 | Heartbeat hid a failed `docker ps` | `scripts/self-host/uptime-heartbeat.sh`: failure or timeout (`DOCKER_TIMEOUT`, default 20 s) is reported as a problem | `tests/backup-alerts.test.mjs` (stub docker that fails / hangs) |
| 8 | `quote-management` pin vs #192 | #189: pins the shared `insertRequest` and runs the real pipeline (stored row, tracking code, notice with the product list, recorded notice result) with and without the `items` column | `tests/quote-management.test.mjs` |

Also changed while combining: the e2e runner now starts a fresh app for every test file (the in-memory login throttles made the Beauty two-step tests answer 429 once enough other files had logged in first), and a decorative ping ring in the AI assistant button is `aria-hidden` / `pointer-events-none` (the stricter fixed-layer measurement flagged it).

**Combined tip, local results.** `npm run lint`: clean. `npm test`: **265 tests, 265 pass, 0 fail, 0 skipped**. The throw-away PostgreSQL 16 tests are included in that count and **were executed here (none skipped)**: this sandbox can start a cluster as an unprivileged user via `runuser`; the earlier review environment could not, which is why it reported 12 skipped. `npm run build`: succeeds. `npm run test:e2e`: **103 browser tests, 103 pass**, one app start per file.

**Not done / still the owner's.** No merge, no deployment, no migration (30, 31, 32 are still unapplied; 33 is on `main`). Migrations 30–32 and the new scripts must be applied/installed deliberately as described in 7.4. The new `check:rls` exit code 3 must be treated as "not proven", never as a pass. Live behaviour of the new code (2FA with real authenticator, real Telegram delivery, real phone rendering) is unverified.

