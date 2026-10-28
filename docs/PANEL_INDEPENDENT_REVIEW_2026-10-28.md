# Independent panel-platform review — 2026-10-28

> Superseded checkpoint: the later independent re-review accepted and merged corrected #208–#224. See [acceptance and production boundary](PANEL_REVIEW_ACCEPTANCE_2026-10-28.md). The findings and red reproductions below remain the original baseline evidence.

## Decision and repository state

The owner requested an independent code review and merging the work that is ready. This review does **not** certify production deployment or the entire platform as complete.

Reviewed stack tip: `b651cade11d1a9dc2fd054b48fffe997ae54359d` (#224). Starting main: `fbf217fc9f251ade4676efa0299e6af3a008d81c`.

The following PRs were merged with their reviewed head SHAs pinned:

| PR | Result | Merge commit |
| --- | --- | --- |
| #204 | Archived-product deletion with typed confirmation and attempt/outcome audit | `8a042618a012418cde3b953c36b9cfb6697e0622` |
| #207 | Fail-closed destructive audit for requests, categories and brands; explicitly retargeted to main before merging | `844ff89d3e90075595ec7f752fbb7f3ea49a09a5` |
| #206 | Persian, Tajik and English panel interface | `b641c101734668df01077afb17c4be51ab3b09b2` |

The resulting application tree is identical to the locally tested integration tree. Existing main changes, including #203's session guards and #205, were preserved. No force push, branch deletion, production mutation, migration, secret change or deployment was performed.

**Hold #208–#224** until the findings below are fixed and the combined stack is reviewed again. #208 is the permission-model root; #209 and later PRs incorporate that model and one another. Do not merge a higher stacked PR into main to bypass a blocked ancestor.

## Evidence and limits

- Read the latest check states for all 20 open PRs. `validate` and `browser-flows` were successful at the reviewed heads; this is evidence about those heads, not an independent security guarantee.
- Read CI validate logs for #204, #207, #206 and #224: respectively **288, 294, 305 and 543 tests passed**, with zero failures/skips. Read #224's browser log: **198 passed, zero failures** across its files.
- Locally combined #204, #207 and #206 with main: production E2E build and lint succeeded. **33 selected browser tests passed**: product-delete 6, panel-i18n 8, panel-session-gate 3, security-fail-closed 9, panel-flows 7. These use the project's fake database, not production.
- The first local panel-flows attempt started before Chromium installation finished and failed to launch a browser. After installation, all 7 tests passed on the same built application. Other selected files completed successfully.
- Local existing unit suite at the safe prefix: **287 pass, 1 environmental failure, 17 skip** (305 total). The failure was the root/runuser/nobody backup test in this executor; PostgreSQL integration tests skipped because PostgreSQL is absent. At the full stack: **476 pass, the same 1 environmental failure, 66 skip** (543 total). Do not report either local run as fully green; CI logs above provide the available PostgreSQL evidence.
- Added **eight separate review probes; all eight fail on the reviewed stack**. They call actual production modules with controlled database responses/interleavings. These are unit-level reproductions; concurrent real-PostgreSQL verification is still required for the fixes.
- No tests were sent to the live customer site. No real authentication-app, Telegram, external backup-alert delivery or restore-drill result was verified here. Native-speaker translation review is outstanding.

## Blocking findings

### R1 — Permission delegation can remove an approval requirement (#208, #209)

`lib/operator/authz.js`, `checkUserChange`: the grant ceiling compares permission names, not execution modes. A product manager with `users.manage` and `products.price` restricted to approval can create another product manager with an empty approval policy. The new account can change prices directly, although its creator cannot.

Fix delegation ceilings for the complete effective authority: denied/approval/direct, both new accounts and policy updates. A non-owner must not delegate a more permissive execution mode than their own. Keep explicit owner policy-setting possible. Test custom `allow`/`deny`, both houses and existing targets, not just role names.

### R2 — Limited user managers can reset a stronger non-owner's password (#210)

`lib/operator/userActionsCore.js`, `resetPersonPassword`: `checkUserChange({change:{}})` checks no newly gained privileges. A viewer with delegated `users.manage` can reset a same-house `house_admin`, receive its temporary password and take over when that target has no second factor. Protecting only the owner role does not prevent this escalation. The session-ending path uses the same empty-change check.

Add an explicit target-management authority ceiling for password reset, forced enrollment/recovery and session administration. Validate all target effective powers and approval restrictions. The regression uses a target without 2FA; no actual password is printed.

### R3 — Personal-account 2FA state disappears after a real SELECT projection (#209)

`lib/operator/accounts.js`: `PUBLIC_COLUMNS` omits `totp_secret_enc` and `recovery_hashes`, while `rowToUser` computes `hasTotp` and `recoveryLeft` from them. `getUser`/`listUsers` therefore report no configured second factor even when the database has one. A required-2FA account is restricted again after login; settings also receive the wrong state.

Return safe enrollment metadata without sending encrypted seeds or recovery hashes to a browser. Fix the tests' database fidelity: `tests/helpers/memoryAdmin.mjs` ignores SELECT columns and returns full rows, concealing this bug. Cover login through subsequent session resolution/settings with real column projection or PostgreSQL/PostgREST.

### R4 — Concurrent recovery-code use can resurrect an already spent code (#209)

`lib/operator/accounts.js`, `consumeRecoveryCode`: with an initial array `[A,B]`, request A writes `[B]`. A request for B that read the old array can still pass `contains(B)` and write `[A]`. A has become usable again. Testing the same code twice does not catch this different-code race.

Use an atomic database removal, a normalized one-use table, or compare-and-swap on the complete prior state with safe retry. Add a real concurrent test consuming different codes and prove neither spent hash reappears. A rejected stale second request is acceptable; restoring the first code is not.

### R5 — A delegated manager can remove their own required-2FA policy (#209, #210)

`checkUserChange`'s self-change guard does not include `require2fa`. `updateUser` maps it to `require_2fa`, so a user with `users.manage` can remove an owner-imposed requirement on their own account. The separate self-service enrollment controls do not repair this policy bypass.

Protect the requirement as an administrative security policy and apply the intended session/version consequences when it changes. Verify self changes and changes to more privileged targets.

### R6 — The media library can delete a Beauty brand logo still in use (#216)

`lib/operator/mediaLibrary.js`: the Beauty brand usage query requests `name_en,name_fa`; the real `beauty_brands` schema in migration 11 has `name`. PostgreSQL returns `42703`. `usageMap` treats that as an optional missing schema and continues with no brand references, so `deleteMedia` removes an attached logo.

Use actual schema columns and fail closed when usage cannot be established. Test against real schema/projection and a referenced logo. Also cover references beyond the API row limit: an unpaginated partial usage scan cannot prove that a file is unused. Review pending proposals and other supported references before claiming safe orphan deletion.

### R7 — Stock-count closing is not atomic with the reviewed snapshot (#220)

`lib/warehouse/countsActions.js`, `applyCount`, and migration 41: comparison, per-product posting and count closing are separate operations. A line can change after comparison while posting is in progress. Reproduction: expected 10, reviewed count 8, approved delta -2; a concurrent valid save changes the count to 6; execution still closes it with ledger balance 8 and saved count 6.

Freeze/lock the reviewed count and its lines, verify the version, post the movements and close consistently in a database transaction, or provide an equally durable state machine. Handle partial posting, retry, cancellation and idempotency explicitly. Require real concurrent PostgreSQL tests, including an injected failure after the first of multiple movements. A unit mock alone is insufficient evidence of the fix.

### R8 — Approved product deletion ignores the reviewed product version (#211)

`lib/operator/approvalExecutors.js`, `products.delete`: unlike update execution, deletion ignores `request.base_updated_at`. A product edited after the request can still be deleted if it remains archived with the same SKU. The generic approval wrapper does not perform the missing product-version check.

Apply the reviewed-version predicate atomically to deletion, alongside archived state and confirmation checks. Return stale when that version changed; leave the newer record intact. Test through the complete approval flow and a concurrent update between read and delete. This concerns the new approval executor, not the direct archived-product deletion merged in #204.

## Reproduction handoff

The companion file is `docs/reviews/panel-platform-regressions-20261028.mjs`. It is deliberately outside `tests/*.test.mjs`: its eight assertions describe required behavior and are currently red on the pending feature stack, not a test suite that should be enabled on main.

To reproduce, copy these two review documents into a throwaway checkout of `b651cade11d1a9dc2fd054b48fffe997ae54359d` (preserving their paths), install dependencies and run:

```sh
node --test docs/reviews/panel-platform-regressions-20261028.mjs
```

Expected baseline: 8 tests, 0 pass, 8 fail. It uses only fake users, dummy hashes/seeds and local memory; it does not contact production. Once the implementation changes, improve the fixtures to match real schema/projection and turn each reproduction into permanent unit/integration/E2E coverage in the owning feature PR. Do not merely weaken assertions to make the review file green.

## Scope still incomplete

The author's report correctly distinguishes several incomplete requirements. Track them as open: variants; real server pagination/filtering (caps of 2000/1500/5000 are not pagination); full private draft preview; publication quality gates; advanced media crop/focus and product documents; lots/expiry/quarantine; saved table preferences/bulk selection scope; contact/featured content administration; personal preferences/shortcuts; actual backup/restore monitoring. Audit new-table exports and the entire cross-house permission matrix after corrections. This review does not certify every one of the 300+ changed files as defect-free.

## Production handoff — staged, not automatic

The last deployment evidenced by the owner in this conversation is `b835da8` on 2026-10-26, with migrations 30–33 committed and RLS 18 pass / 0 fail / 0 unknown. The owner has not supplied evidence of deploying #203 or these newly merged PRs. Verify the actual running commit before making a current-production claim.

For the newly merged safe subset, use the existing production runbook: fresh verified local + encrypted-R2 backup, save the current app image under a new rollback tag, ensure a clean medoria-owned checkout, then deliberately deploy main and verify live health, both authenticated panels, all three interface languages and archived-product deletion using disposable test data. The #203 session fix is already included in main and should reach production through that deployment.

**Do not apply migrations 34–42, enable `OPERATOR_USERS`, add new platform secrets or install a new publishing cron as part of this safe-subset deployment.** They belong to the blocked platform rollout. Migration 30's audit tables are already present according to the owner's supplied successful output. No additional migration or env change is required by #204/#207/#206. Never paste secrets into a chat or commit them.

After corrected stack checks pass, update `PANEL_PLATFORM_PLAN.md`, `PANEL_RELEASE_RUNBOOK.md` and the author's work log with truthful implemented/pending/owner-reported states before proposing a separate platform rollout.
