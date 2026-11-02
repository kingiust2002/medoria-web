# Independent release review — 2026-11-02

## Scope and current state

Review of the corrected dependency chain #242 → #234 → #235 → #236 → #237 → #238 → #239 → #240. Main was `dccae13` at the start; #228–#233 were already merged before this session. No production commands, migrations, environment changes, cron changes, backups or deployments were performed in this review.

Final acceptance and merge record: **pending final checks**. This document will be completed after reading the final CI results.

## Additional defects reproduced and corrected

* **#242, `24607a3`:** migration 53 is enclosed by BEGIN/COMMIT. Health category deletion also serializes with catalogue writers, because legacy text-only category membership takes no foreign-key lock. A real-PostgreSQL overlap test proves that an uncommitted legacy member is not missed: the reviewed deletion waits, then refuses as stale. The new test passed in GitHub CI, alongside 779 unit tests with zero skips.
* **#238, `8b5ed6e`:** changing already-public material requires the current publication permission/approval. Draft-only edits remain direct when allowed. Combined edit/publication requests also recheck `content.edit` when approved. Five new tests failed before and passed after the fix; 34 focused tests passed.
* **#239, `315fb63`:** bulk approvals retain every reviewed product's filing-time version. Newer prices are preserved. Legacy requests without versions fail closed and must be filed again. Approved imports cannot overwrite a product absent from their filed version map (including a SKU that appeared after filing). Both houses have regression coverage; 88 focused tests passed.
* **#239, `5d5eadc`:** the approval action no longer discards partial execution results. Only bounded numeric counts/IDs reach the result panel; executor payloads and secrets are omitted. A failed multi-chunk operation no longer claims that nothing changed. The action regression failed before the fix; 76 focused tests and lint passed afterward. Two browser regressions also cover a newer product surviving approval, with visible results at 320px.

## Evidence and limits

* The original submitted tip's validate/browser jobs completed successfully. Supplemental fixes require the latest-head checks, recorded below after completion.
* Local full unit run before the final result-display fix: 1031 tests, 813 pass, 217 skipped (no local PostgreSQL), one environmental failure (`runuser: cannot set groups: Operation not permitted`). This is **not a passing full local run**. The unrestricted CI run is the evidence for PostgreSQL and runuser coverage.
* Real Supabase Storage/PostgREST, an encrypted production-backup restore, real alert delivery, real-device appearance and native-speaker translation review remain unproved here. SQL-role tests and a fake HTTP service are not substitutes for those release checks.
* Bulk/import writes span chunks. The current attempt's numeric results are displayed, but a durable per-row execution-result history is not added by this review; existing product history/activity entries remain the durable record.
* Personal settings still lack configurable keyboard shortcuts and account-kept language/theme. Company-contact fields and notification-channel extensions remain owner decisions. This is not a claim that every earlier feature wish is complete.

## Production release boundary

Merging does not deploy. Last owner evidence still leaves migrations **34–56** pending. Follow `PANEL_RELEASE_RUNBOOK.md` with the exact merged files: fresh local + encrypted R2 backup and verification, rollback image, migrations in numeric order (54 before deploying the document-serving code), protected environment setup, deliberate deployment, then API/storage/session/2FA/permissions/forms/Telegram/warehouse checks. Keep `OPERATOR_USERS` off until owner bootstrap is ready. Keep Health positive-read UNKNOWN honest when there are no active products.

Do not run a blind pull/deploy against the old server checkout. Do not delete rollback images or obsolete branches as part of this review.
