# Response to the independent review of 2026-10-28 (`PANEL_INDEPENDENT_REVIEW_2026-10-28.md`)

Status: **all eight blocking findings are fixed on their owning branches, merged forward through the whole stack (#209 → #224), and covered by permanent
tests.** This is not a certificate: the stack is **not merged, not deployed, and no migration was applied**. #208–#224 stay on hold until the corrected
stack is reviewed again. The review's own probe file (`docs/reviews/panel-platform-regressions-20261028.mjs`) is untouched; it now passes 8/8 on the
stack tip — see "How much each fix is proved" for what that does and does not show.

| # | Finding | Owning PR / branch | Fix | Permanent tests |
| --- | --- | --- | --- | --- |
| R1 | Delegation could remove an approval requirement | #208 `feat/panel-authz` (merged forward) | `authz.modeRanks` / `modesAboveActor`: execution modes (denied < approval < direct) are a ceiling on top of the permission ceiling; judged on the **effective** authority (role defaults, custom allow/deny, empty policy), new accounts and updates, both houses; owners may still set any policy | `tests/authz.test.mjs` (R1 ×3) |
| R2 | A limited `users.manage` could reset a stronger non-owner and take the account | #208 + #210 `feat/panel-users-ui` | `authz.targetWithinActor` + error `target_above_actor` for every change to an existing target; password reset and ending sessions go through the same check (they used `change: {}`, which checked nothing) | `tests/authz.test.mjs` (R2), `tests/user-actions-core.test.mjs` (R2 ×2: reset, end sessions, mode-only difference, peers and owners still work, rejected entries logged) |
| R3 | 2FA state read from columns the SELECT did not fetch | #209 `feat/panel-accounts` | server-side `READ_COLUMNS` include the seed / hashes columns; `rowToUser` computes `hasTotp` / `recoveryLeft` and never copies a secret; nothing secret is sent to a browser | `tests/operator-accounts.test.mjs` (R3), `tests/user-actions-core.test.mjs` (R3 through the session path); **the test stand-in now returns only the selected columns** (`tests/helpers/memoryAdmin.mjs`) |
| R4 | Concurrent use of two different recovery codes resurrected a spent code | #209 | `consumeRecoveryCode` is a compare-and-swap on the complete list read (`contains` AND `containedBy`), loser re-reads (bounded retries) | `tests/operator-accounts.test.mjs` (R4: stale list, three codes at once, same code twice), **real PostgreSQL with two overlapping sessions** in `tests/operator-users-migration.test.mjs` |
| R5 | A delegated manager could remove their own 2FA requirement | #208 + #209 | `self_require2fa`; only an owner relaxes anybody's requirement (`require2fa_owner_only`); a change ends the person's sessions (`sessionPolicy`) | `tests/authz.test.mjs` (R5), `tests/operator-accounts.test.mjs` (R5 incl. authz_version bump) |
| R6 | The media library could delete an in-use Beauty brand logo | #216 `feat/panel-media` | real schema (`beauty_brands.name`), every row read page by page, pending change requests counted, **fails closed** on any error/exception (nothing is skipped any more) | `tests/media-library.test.mjs` (fail-closed for five error codes + a throwing client, R6 with a schema-checking stand-in, 2500 rows with a reference past row 1000, pending/decided/other-house/executor-argument requests) |
| R7 | Stock-count closing was not atomic | #220 `feat/warehouse-counts`, migration 41 | `<house>_stock_count_close`: one transaction — lock the count, verify the reviewed snapshot, post every difference through the ledger function, close; all or nothing; closed count = replay | `tests/warehouse-counts-migration.test.mjs` **on real PostgreSQL**: happy path + replay, failure after the first of several movements (nothing left behind), stale snapshot, a save racing the close in both orders, two simultaneous closes, privileges; unit tests for the application layer |
| R8 | An approved deletion ignored `base_updated_at` | #211 `feat/panel-approvals` | `deleteProductGuarded({ expectedUpdatedAt })`: version compared when read and repeated in the delete statement; a request with no basis deletes nothing | `tests/approvals.test.mjs` (R8 ×3 incl. an edit landing between the check and the delete) |

## How much each fix is proved

* **Real PostgreSQL 16, real concurrency:** R4 (the exact compare-and-swap statement) and R7 (the whole close function). These are the strongest results.
* **Unit level against the production modules:** R1, R2, R3, R5, R6, R8. R3 and R6 only became testable once the in-memory stand-in honoured the SELECT
  list (and, for R6, a declared schema): the earlier green tests could not have caught them. R8's "edit between check and delete" is simulated by an audit
  hook that changes the row after the read; the atomic predicate itself is the same `updated_at` equality the update executor already used.
* **The review's probe file passes 8/8 on the stack tip, but two of its probes pass for weaker reasons than the permanent tests:** probe 5 (count) and
  probe 4 (media) run against a promise-only mock, so they pass because the code now **fails closed** or finds no RPC, not because they exercise the real
  close or the real scan. Rely on the permanent tests above, not on the probe file.
* **Not proved:** the PostgREST translation of the recovery-code filters (`cs` / `cd` on `text[]`) was not run against a real PostgREST; the browser tests
  use the project's fake database, whose count-close is a JavaScript stand-in (`tests/helpers/countCloseSim.mjs`) that mirrors the function's shape.

## Changes to a migration that is not applied anywhere

Migration 41 (`41_warehouse_counts.sql`) gained the close functions and their privileges/self-check **in place**, because it has not been applied to any
database (the owner's evidence: only 30–33 on production). If anyone has applied the earlier version of 41 to a throw-away database, re-create it or run
the `CREATE OR REPLACE FUNCTION` blocks of the new file. No other migration changed; R4 needed none.

## Behaviour changes a reviewer should know about

* Closing a stock count is all-or-nothing now: a failing line no longer leaves earlier differences posted (the screen text says so).
* A non-owner account manager can no longer manage (disable, reset, change) an account that is stronger than themself, even for a "harmless" change.
* The media library refuses to say anything when any usage table cannot be read (the screen shows "unavailable"); before, missing tables/columns were skipped.
* Approved deletions need a basis version; older queued delete requests without one will fail as stale and must be re-submitted.

## Also added after the review (permanent coverage, requested by the review's "audit" paragraph)

* `tests/authz.test.mjs` — a **generated cross-house matrix** (every role × house membership × house × operation): nobody acts in a house they are not in,
  membership of the other house never changes the answer here, a custom allow never reaches into another house, deny beats allow.
* `tests/action-permission-pins.test.mjs` — static pins for the **new action cores** (warehouse, counts, site content): every action asks for a permission
  before it touches data; every operation named is in the catalogue; every new export needs its export operation and is logged.

## Still open (unchanged from the review's "Scope still incomplete")

Variants; real server pagination/filtering (the 2000/1500/5000 caps are not pagination); full private draft preview; publication quality gates; advanced
media crop/focus and product documents; lots / expiry / quarantine; saved table preferences and bulk-selection scope; contact / featured content
administration; personal preferences and shortcuts; real backup/restore monitoring and a restore drill; native-speaker review of Tajik/English texts.
The exports and the cross-house matrix of the **older** areas (products, categories, brands, quotes, audit) were not re-audited line by line here;
`tests/panel-permissions.test.mjs` pins that each names an operation.
