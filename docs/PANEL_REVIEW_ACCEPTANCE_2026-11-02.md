# Independent release review — 2026-11-02

## Scope and current state

Review of the corrected dependency chain #242 → #234 → #235 → #236 → #237 → #238 → #239 → #240. Main was `dccae13` at the start; #228–#233 were already merged before this session. No production commands, migrations, environment changes, cron changes, backups or deployments were performed in this review.

**Accepted for merge; all eight PRs were merged in dependency order on 2026-11-02. Production was not changed.**

| PR | Merge commit |
| --- | --- |
| [#242](https://github.com/kingiust2002/medoria-web/pull/242) | `f644482` |
| [#234](https://github.com/kingiust2002/medoria-web/pull/234) | `1325f7e` |
| [#235](https://github.com/kingiust2002/medoria-web/pull/235) | `056061a` |
| [#236](https://github.com/kingiust2002/medoria-web/pull/236) | `e91d286` |
| [#237](https://github.com/kingiust2002/medoria-web/pull/237) | `29e04c5` |
| [#238](https://github.com/kingiust2002/medoria-web/pull/238) | `5b9eccf` |
| [#239](https://github.com/kingiust2002/medoria-web/pull/239) | `76e5069` |
| [#240](https://github.com/kingiust2002/medoria-web/pull/240) | `ed64315` |

Bases were explicitly changed to `main`; normal merge commits used the reviewed head SHAs. The merged feature tree `ed64315` differs from the fully tested integrated tip `4b3b1b7` **only in the document test's synchronization assertions**. Application code, dependencies, migrations and deployment scripts are identical. The test-only change passed all four focused scenarios with an injected response delay before merge.

**CI provenance:** both full integrated jobs on `4b3b1b7` passed before the last feature merges. At the time #235 and #239 were merged, their extra per-PR CI repetitions were still running (the earlier #239 validate failure was in the Google font loader, after all 1009 unit tests passed; #235 had the proven DOM-readiness race above). They were not described as green or required to repeat the already-passing full integrated application check. The remaining runs continue normally; their live state is on the PR pages. No individual-PR all-green claim is made for that merge-time snapshot.

## Additional defects reproduced and corrected

* **#242, `24607a3`:** migration 53 is enclosed by BEGIN/COMMIT. Health category deletion also serializes with catalogue writers, because legacy text-only category membership takes no foreign-key lock. A real-PostgreSQL overlap test proves that an uncommitted legacy member is not missed: the reviewed deletion waits, then refuses as stale. The new test passed in GitHub CI, alongside 779 unit tests with zero skips.
* **#238, `8b5ed6e`:** changing already-public material requires the current publication permission/approval. Draft-only edits remain direct when allowed. Combined edit/publication requests also recheck `content.edit` when approved. Five new tests failed before and passed after the fix; 34 focused tests passed.
* **#239, `315fb63`:** bulk approvals retain every reviewed product's filing-time version. Newer prices are preserved. Legacy requests without versions fail closed and must be filed again. Approved imports cannot overwrite a product absent from their filed version map (including a SKU that appeared after filing). Both houses have regression coverage; 88 focused tests passed.
* **#239, `5d5eadc`:** the approval action no longer discards partial execution results. Only bounded numeric counts/IDs reach the result panel; executor payloads and secrets are omitted. A failed multi-chunk operation no longer claims that nothing changed. The action regression failed before the fix; 76 focused tests and lint passed afterward. Two browser regressions also cover a newer product surviving approval, with visible results at 320px.

* **#235, `1445737` (test synchronization only):** the document-flow test waited for a database write and then read the DOM before the action response refreshed it. A one-second controlled response delay reproduced the original expiry assertion failure. The corrected test waits for the upload/edit form to close and the new title/expiry badge to render, waits for asynchronous file cleanup and ISR listing refresh, and adds an **immediate 404 download assertion for the draft PDF**. The same delayed-response control passed all four document scenarios. The delay probe is temporary and is not committed; the bounded state assertions are permanent. Application code is unchanged.

## Latest verified checks

Code tip: `4b3b1b7d6ea973ad0f00cf64fffcc1be0bfea565` (#240).

* GitHub [`validate`](https://github.com/kingiust2002/medoria-web/actions/runs/41439583053/job/125257783781) job `125257783781`: **1032 / 1032 unit tests, zero failures and zero skips**, lint, standalone build, production-container build/scan/runtime and smoke checks passed. This includes real PostgreSQL coverage that was unavailable locally.
* Manual `npm run check:mobile` on the final code's local production build, with invented database fixtures: **305 / 305 page loads**, 61 public routes at 320×800, 360×800, 390×800, 430×800 and 320×568. This is not a real-phone or live-production claim. Authenticated panel layouts have separate browser tests.
* Integrated focused unit run: **90 / 90**.
* Full integrated GitHub [`browser-flows`](https://github.com/kingiust2002/medoria-web/actions/runs/41439583053/job/125257783900) job `125257783900`: **276 / 276**, zero failures/skips.
* Local full browser run before the outcome-display-only changes: **274 / 274**, zero failures/skips. The outcome-display file on the final application code/build separately passed **8 / 8**, including both new 320px cases. The delayed-response document regression passed **4 / 4** after the test correction (old assertion: one failure under the same controlled delay).

## Evidence and limits

* The original submitted tip's validate/browser jobs completed successfully. The supplementary application fixes are covered by the full integrated checks above; the later test-only synchronization correction has the separate focused evidence and CI provenance described above.
* Local full unit run before the final result-display fix: 1031 tests, 813 pass, 217 skipped (no local PostgreSQL), one environmental failure (`runuser: cannot set groups: Operation not permitted`). This is **not a passing full local run**. The unrestricted CI run is the evidence for PostgreSQL and runuser coverage.
* Real Supabase Storage/PostgREST, an encrypted production-backup restore, real alert delivery, real-device appearance and native-speaker translation review remain unproved here. SQL-role tests and a fake HTTP service are not substitutes for those release checks.
* Bulk/import writes span chunks. The current attempt's numeric results are displayed, but a durable per-row execution-result history is not added by this review; existing product history/activity entries remain the durable record.
* Personal settings still lack configurable keyboard shortcuts and account-kept language/theme. Company-contact fields and notification-channel extensions remain owner decisions. This is not a claim that every earlier feature wish is complete.

## Production release boundary

Merging does not deploy. Last owner evidence still leaves migrations **34–56** pending. Follow `PANEL_RELEASE_RUNBOOK.md` with the exact merged files: fresh local + encrypted R2 backup and verification, rollback image, migrations in numeric order (54 before deploying the document-serving code), protected environment setup, deliberate deployment, then API/storage/session/2FA/permissions/forms/Telegram/warehouse checks. Keep `OPERATOR_USERS` off until owner bootstrap is ready. Keep Health positive-read UNKNOWN honest when there are no active products.

Do not run a blind pull/deploy against the old server checkout. Do not delete rollback images or obsolete branches as part of this review.
