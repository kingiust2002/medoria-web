# Panel platform — release runbook (stage S6c)

The one place that says **what to do, in which order, and how to go back** for the multi-user panel work (migrations 30–56). It does not
replace `docs/PRODUCTION_MIGRATION_AND_OPERATIONS.md` (the infrastructure truth: VPS, Caddy, Supabase, backups, DNS — read it before touching
production) — it points into it. Nothing here is automatic: **a merge deploys nothing**, and every step below is done by a person.

## 0. What is where
| Topic | Document |
| --- | --- |
| The plan and the status of every stage | `docs/PANEL_PLATFORM_PLAN.md` |
| Personal accounts, roles, approvals, activity log v2, release flag | `docs/OPERATOR_ACCOUNTS.md` |
| Warehouse | `docs/WAREHOUSE.md` · Product history/lock/revert `docs/PRODUCT_HISTORY.md` · Image library `docs/MEDIA_LIBRARY.md` |
| Scheduled publishing · Translation status · Quick search | `docs/SCHEDULED_PUBLISHING.md` · `docs/TRANSLATION_STATUS.md` · `docs/PANEL_SEARCH.md` |
| Customer requests, Telegram, reminders, follow-up, report | `docs/QUOTE_MANAGEMENT.md`, `docs/QUOTE_NOTIFICATIONS.md` |
| Migrations, one row each | `migrations/README.md` |
| Backups, restore, server replacement, security review | `docs/PRODUCTION_MIGRATION_AND_OPERATIONS.md` §7, §22, §23 · `docs/MONITORING_AND_ALERTS.md` |

## 1. The migrations of this work
All are additive, one transaction each, idempotent and self-checking (they abort and roll back on a mismatch). Apply **in order**, stop on the
first error.

| # | Needs | If it is NOT applied the app… | Rollback (only after the code no longer uses it) |
| --- | --- | --- | --- |
| 30 operator security (sessions, 2FA state, activity log) | – | refuses panel logins (fails closed) | see the file's header |
| 34 personal accounts | 30 | works in the old single-login mode while `OPERATOR_USERS` is empty | header |
| 35 approval queue, append-only log | 30, 34 | approvals/log v2 unavailable (honest message) | header |
| 36 warehouse (both houses) | 34 + product tables | warehouse screen says "unavailable" | header |
| 37 request follow-up | 32, 34 | follow-up save answers "apply migration 37" | header |
| 38 product history | 34 | no history; saves never blocked | header |
| 39 scheduled publishing | product tables | dates cannot be stored; cron skips the house | header |
| 40 translation status | product tables | marks are not remembered; saving works | header |
| 41 warehouse counts and minimum levels | 36 | the count tab says "unavailable"; stock tab works without minimums | header |
| 42 site content (banner, FAQ) | 34 | no banner / FAQ on the public pages and the content screen says "unavailable"; the site is unaffected | header |
| 43 list paging (computed columns, indexes) | product + request tables | the completeness filter says "needs migration 43"; see `docs/PANEL_LIST_PAGING.md` for the rest | header |
| 44 product variants | product tables | no variants; the variant screens say "unavailable"; products unaffected | header |
| 45 warehouse lots, expiry, quarantine | 36, 41 | the lot features report that they need the migration; see `docs/PANEL_WAREHOUSE_LOTS.md` | header |
| 46 publish quality rules | 34 | the rule cannot be saved; with no rule nothing is blocked (as before) | header |
| 47 category / brand picture focus | category tables | focus points cannot be saved; see `docs/PANEL_CATEGORY_IMAGES.md` | header |
| 48 product documents | 34, product tables | the documents section says "unavailable"; the public page shows none | header |
| 49 saved list views | 34 | the lists show no "views" row | header |
| 50 personal start page and shortcuts | 34 | the settings card says so; no shortcuts | header |
| 51 contact details and featured products (kinds of site content) | 42 | the two new tabs cannot save; the public pages use the built-in defaults / starred products | header |
| 52 what the server scripts reported | – | the System status screen says everything is **unknown** (never green) | header |
| **53 approved deletions that check the reviewed version (quotes, categories, brands)** | the tables it reads (01/10/12/20/32) | **approved and direct deletion of a category / brand and approved deletion of requests are REFUSED** (fail closed, "migration 53 missing" in the log) — nothing is deleted without it | header (drop 5 functions) |
| **54 private product documents** | 48 + the `storage` schema | uploading a document fails and says so; the public pages list no documents. **Apply BEFORE the application that serves documents is deployed** (the app uploads to the private buckets) | header |
| 55 my columns of the lists | 34 | no "my columns" chooser; the lists keep their default fields | header |
| 56 rows per page and dashboard blocks | 50 | the settings card says so; start page and shortcuts keep working | header |
| **57 archive of accounts** | 34 | the "Archive user" button is refused by the database (status check) and says so; every other account feature works as before. **Apply BEFORE deploying the release that has the archive button** | header (rollback: restore archived accounts first) |

**Which migrations are still pending.** Production is proven only at `5ac0592`, and the independent review (2026-10-29) confirmed: **34–42 are pending as well as 43–56.** Nothing of 34–56 is applied anywhere; each is written, tested on a throw-away PostgreSQL 16 and documented in `migrations/README.md`. (30–33 belong to the earlier work: check them on the target before the release — the System status screen's migrations table does — rather than assuming.) Applying them is one release with this order: **numeric order, 34 → 56, stop on the first error.** The only cross-dependencies that are not simply "lower number first": 41 needs 36; 45 needs 36 + 41; 48 needs 34; **54 needs 48**; 56 needs 50. The files already merged into `main` carry migrations 43–46; 47–56 are on the open PRs (see section 7).


Before applying any of them on production: **fresh production backup and the local + R2 chain must PASS** (`scripts/self-host/production-backup.sh`;
runbook §7). A migration is applied by the person doing the release, never by the application.

## 2. Environment (never printed, never committed)
| Variable | Purpose | Required when |
| --- | --- | --- |
| `OPERATOR_USERS` | `on` switches to personal accounts | the owner is ready (step 5 below) |
| `OPERATOR_DATA_KEY` | 32 random bytes base64 (`openssl rand -base64 32`), encrypts 2FA seeds; **back it up** | `OPERATOR_USERS=on` |
| `OPERATOR_BOOTSTRAP_USERNAME` | only if the old username is not 3–64 `a-z0-9._-` | rarely |
| `SCHEDULE_TOKEN` | ≥ 24 chars (`openssl rand -hex 32`): lets the cron apply scheduled publishing | scheduling is wanted |
| `QUOTE_REMINDER_TOKEN` | same kind: the daily request reminder | reminders are wanted |
| `OPS_REPORT_TOKEN` | same kind: lets the server's own scripts report backup / restore-drill / heartbeat results to the panel's System status screen (`docs/PANEL_SYSTEM_STATUS.md`); also set `OPS_REPORT_URL` + the same token in the two alert env files on the server | the System status screen should show real reports instead of "unknown" |

`node scripts/check-self-host-env.mjs deploy/.env` checks all of them (and refuses half-configured states) without printing values.

## 3. Release order (a release that contains migrations)
1. Merge the reviewed PRs (stack order is in `docs/PANEL_PLATFORM_PLAN.md`). **Nothing is deployed by merging.**
2. **Backup**: fresh production backup; local + R2 chain PASS.
3. Apply the release's migrations in order (section 1). **54 before the deploy** (the new code uploads documents to the private buckets); after applying 54, if migration 48 was EVER applied and used on that database, follow `docs/PANEL_PRODUCT_DOCUMENTS.md` "Moving files" (the migration prints a WARNING with the number of rows).
4. Add the new environment values (section 2); run the env checker.
5. Deploy deliberately (runbook §9): then **`docker compose ps` and a live curl** — "Started" is not proof the container stayed up.
6. Post-checks:
   * `npm run check:rls` (now also proves anonymous callers cannot read the warehouse tables, including the stock counts and levels) — privacy denials must be proved; retain FAIL/UNKNOWN exit semantics. The current Health positive-read probe is UNKNOWN because there are no active Health products; record it honestly rather than weakening the checker or publishing unwanted data;
   * `npm run check:rls` now also proves: the five functions of migration 53 refuse an anonymous caller (or are "not found" before the migration), the two document buckets answer "Bucket not found" to an anonymous address, and `operator_table_columns` is private — **these are the real-Storage / real-API proofs the sandbox could not run**; record the output;
   * a draft document is not served: as an anonymous visitor `curl -s -o /dev/null -w "%{http_code}" https://medoriaco.com/api/documents/health/<id of a DRAFT document>` must print 404, a published one 200 `application/pdf`; hide it in the panel and the same address answers 404 at once;
   * the public pages answer and look as before; no warehouse/schedule data in a public response;
   * the owner logs in; one permission-denied probe (a viewer account cannot open `/operator/users`);
   * after `OPERATOR_USERS=on`: the activity log shows `auth.bootstrap_owner` once.
7. Cron lines (host): `quote-reminders` (daily) and `scheduled-publishing` (every 5 minutes) with an outside failure ping; verify one manual call
   answers 200 with counts only.
8. **Rollback**: empty `OPERATOR_USERS` and restart (the old env login works again); redeploy the previous image tag; remove the cron lines.
   The migrations stay (they are additive and ignored by the previous code); each file's header has the exact undo for the day it is wanted.

## 4. Monitoring — what to watch
* The container stays up (`docker compose ps`), the health route answers, the backup job reports PASS (`docs/MONITORING_AND_ALERTS.md`).
* Activity log (panel → تاریخچه, filter result = failure/rejected): spikes of `access.denied`, `auth.login_failed`, `approval.*` failures,
  `stock.*` failures, `product.scheduled`.
* Cron health: the scheduled-publishing answer is `{ ok: true, … }`; `502` means a house could not be read.
* Telegram: requests with a failed notice are flagged in the panel ("send again" exists); the reminder counts them.
* Warehouse integrity (read-only SQL, any time): `balance = sum(delta)` per (location, product) — the query is in `tests/warehouse-migration.test.mjs`.

## 5. Restore drill (do it before relying on any of this)
Follow runbook §7/§22 end to end on a **scratch** host or database, never on production: restore the latest encrypted R2 backup, run the migrations
of section 1 that are newer than the backup, start the app against it, log in as the owner, and check: products/quotes present, history and
warehouse tables present and append-only (an `UPDATE` on a ledger table must fail), `check:rls` PASS. Record the date and result at the end of the
runbook's §17 baseline. Known limit recorded in CLAUDE.md/§22: data written after the restored snapshot is missing — the drill measures how
much that is.

## 5a. After the independent review (2026-10-28)

* The corrected implemented stack was independently re-reviewed and #208–#224 merged on 2026-10-28 (`PANEL_REVIEW_ACCEPTANCE_2026-10-28.md`). The safe subset (#203/#204/#206/#207) is owner-reported live at `5ac0592`. The platform itself is NOT reported deployed; continue only through a separate planned rollout, after the owner's agreed remaining code work. Do not blindly reuse the earlier safe-subset deploy command.
* **Migration 41 changed before ever being applied** (it now contains the transactional close functions); apply the version from the corrected stack only. If
  a throw-away database got the old 41, re-run the new file's `CREATE OR REPLACE FUNCTION` blocks.
* Approved product deletions now need a basis version; old queued delete requests fail as stale and must be re-submitted.
* Extra post-checks for the platform rollout, in addition to section 3: with a disposable manager account holding `users.manage` and a **viewer** role,
  confirm it cannot reset the password of a house admin; confirm a stock-count close that cannot post one line leaves the count open and the ledger unchanged.

## 6. Not done / owner decisions (reconciled 2026-11-02; the earlier text of this section was out of date and is replaced)
Built since the first version of this section: server-side paging (N1), the complete approval path (N2), variants (N3), warehouse lots / expiry / quarantine with on-screen alerts (N4), a private preview of a draft on the real page (N5), owner-chosen publish rules (N6), category / brand pictures (N7), product documents (N8), saved views, "my columns" and the all-filtered-results scope (N9), start page / shortcuts / rows per page / dashboard blocks (N10), editable contact details and featured items with approval of publication (N11), import and bulk edits under the same rules (N12), the System status screen and the restore-drill tooling (N13). See `docs/PANEL_PLATFORM_PLAN.md` for the status of each (complete / partial / needs the owner).

Still **not done**, honestly:
* No native-speaker review of the Tajik/English panel texts (all screens, all new ones included); machine preparation is not a review.
* **Warehouse**: stock counts stay per product (not per lot); low-stock / expiry alerts are on screen only — Telegram / e-mail delivery is not built.
* **Variants**: an unsaved variant is not part of a draft preview.
* **Personal settings**: keyboard-shortcut customisation and server-kept language / light-dark mode are NOT built — they need the owner's decision (`docs/PANEL_PERSONAL_SETTINGS.md`, "Owner decisions").
* **Contact details**: the gateway's e-mail is not editable; address / hours / social links do not exist on the site; defaults still come from the environment — which company details should exist is an owner decision.
* **Documents**: the PDF check is a heuristic, not an antivirus; the first Storage proof is the post-release `check:rls` run above.
* **Backup / monitoring**: the System status screen shows UNKNOWN until migration 52 and the report token / URL are configured. The owner has since supplied a verified production backup (section 9); **a real restore drill, heartbeat and alert delivery remain unproved** — the restore tool is tested against a throw-away PostgreSQL only (`tests/restore-drill.test.mjs`), not against an encrypted production snapshot.
* **Bulk / import** are not transactional across chunks (exact done / not-done lists are returned, retries are safe).
* The `check:mobile` checker is run per release on the built site (this section's date: see `docs/PANEL_REVIEW_RESPONSE_2026-11-02.md` for the last run).

## 7. Merged release state (2026-11-02)

#228–#233 were already merged before this acceptance. The independent review then merged **#242 → #234 → #235 → #236 → #237 → #238 → #239 → #240** normally, ending the feature release at `ed64315`. Exact merge commits, supplemental corrections, test provenance and limits are in `PANEL_REVIEW_ACCEPTANCE_2026-11-02.md`.

**Merged is not deployed.** The last owner-reported production state still leaves **34–56 pending**; apply the exact files from the accepted release, in numeric order, after a fresh verified backup. The corrected migration 53 is transactional and also protects legacy Health category membership. Old bulk approval requests without filed product versions fail as stale and must be refiled. Editing already-public content requires publication permission/approval; a draft-only edit can remain direct when permitted.

The staged order in section 3 still applies: prepare `OPERATOR_DATA_KEY` securely, initially keep `OPERATOR_USERS` off, apply 54 before deploying document serving, then deliberately deploy and verify the real API/storage and owner session before enabling personal accounts. Real restore/alert/heartbeat proofs and the owner decisions in section 6 remain open. No server action was performed by this merge review.


## 8. Production migration checkpoint — 2026-11-02

Owner-supplied terminal output: backup `20261102T131300Z` passed local/encrypted-R2 verification; rollback image `rollback-before-20261102T131300Z` was saved. The clean checkout advanced from `5ac0592` to `1f71d28`; npm installation and environment preflight passed. **Migrations 34–43 committed. Migration 44 failed and rolled back because the legacy Health table has no `currency` column; 45–56 were not run. The app container was not deployed by this batch.**

Migration 44 now treats Health currency as optional in both public variant RPCs, returning NULL when the column is absent (the existing application fallback applies), and preserving stored values when present. It does not add a column or rewrite product currency. A real-PostgreSQL regression covers the missing-column schema, repeat application, both RPCs, unchanged row counts and preserved explicit currency. Resume from corrected **44**, then 45–56; require each transaction to pass, reload PostgREST schema, and complete the environment/deployment/post-check sequence above.

The owner’s full npm audit reported 19 moderate findings. Their production/development split has not yet been established; inspect `npm audit --omit=dev` before deployment. Do not run an automatic audit fix on the production checkout.

## 9. Owner-reported deployment checkpoint — 2026-11-02

This supersedes the pending/failed migration state in sections 7–8. Supplied terminal output shows corrected migration 44 and migrations 45–56 committed, following the earlier successful 34–43. The schema reload completed and `npm audit --omit=dev` reported zero vulnerabilities.

Environment preparation passed with `OPERATOR_USERS=off`; the data-encryption key was preserved or generated without displaying its value. Fresh snapshot `20261102T134626Z` passed local backup, encrypted-R2 upload/read-back verification and retention. The saved app environment was byte-compared with the current file (`ENV_BACKUP=PASS`). The three host scripts were installed. The rollback image `rollback-before-20261102T131300Z` remains the pre-release target.

The owner then built and deployed `dd808ed4e9f5808f726156ce947e85403df79233`. The app reported healthy; `/`, `/api/health`, `/health/en` and `/beauty/en` answered 200 and the www redirect answered 308. These are owner-supplied terminal observations, not an independent SSH inspection.

The first post-deploy RLS run was **53 PASS, 0 FAIL, 5 UNKNOWN; exit 3**, not a complete pass. One UNKNOWN is the empty public Health product list. Four private-table probes (`publish_rules`, `operator_preferences`, `operator_table_columns`, `ops_status`) answered HTTP 400: inspection found the checker selected nonexistent `id` columns. The corrected probes select real columns from migrations 46/50/55/52 and retain the same strict denial/FAIL/UNKNOWN rules. Schema-aware regression fixtures reproduce the four UNKNOWN results before the correction, preserve UNKNOWN for genuine 400 errors, and preserve the empty-Health UNKNOWN. **Rerun the corrected checker on the VPS before activating personal accounts; the real API result after correction is still pending.** No migration or container rebuild is needed for this checker-only correction.

Real draft/published/hidden-document delivery, owner bootstrap and limited-account checks, scheduling/reminder calls, monitoring reports, actual restore drill and alert delivery still need their release checks. No account activation or monitoring proof is implied by the successful build.

## 10. Owner report («گزارش مالک») — 2026-11-03

Owner-supplied observations, recorded as reported (not independently verified by the author):

* **Personal accounts are enabled** (`OPERATOR_USERS=on`); the owner bootstrap happened and people sign in with their own accounts.
* Fresh backup **`20261103T072609Z`** was taken and verified (local + encrypted R2).
* Post-deploy row-level-security check: **57 PASS, 0 FAIL, 1 UNKNOWN** — the single UNKNOWN is the empty public Health product list (nothing to probe), not a failure.
* The owner confirmed the SSH connection to the **new** system (the VPS that replaced the one lost in September).
* Migrations 34–56 are committed in production per section 9. **Migration 57 (archive of accounts) is NOT applied yet** — apply it after the next verified backup, before deploying the archive release.

**Still needing the owner's own confirmation (nothing below is claimed done):**

1. Live test of a *limited* user with two-step login and a recovery code (sign in, work, end the session, recovery code once).
2. Live test of private documents: a draft stays closed, a published one opens, a hidden one closes again.
3. A real backup-restore drill (`scripts/self-host/restore-drill.sh`) and external alerts for backups and site monitoring.
4. Human review of the Tajik and English texts (machine-written; lower urgency).

This is a delivery record, not a security audit: it does not claim the panel has no holes.
