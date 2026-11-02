# Bulk edits and imports under approval and the same rules (N12)

**Status: complete in code and tests for both houses, no migration. Not deployed. Tajik / English panel texts are machine-prepared and need a human read.** (Content banners/FAQ under approval remain a separate, still-unbuilt item — see the limits.)

## What changed

Until N12 a person whose policy said "needs approval" got a **refusal** for a bulk edit or an import ("cannot be done in bulk"), because one request per product would bury the reviewer. Now the **whole change is ONE request**:

* **Bulk edit** (tick rows, or "all filtered results" from N9; activate / deactivate / ask-for-price / change category — and brand in Beauty). `products.bulk` and `products.import` are now approvable operations (a stored policy listing them used to be treated as closed). The product manager's role defaults are unchanged — an owner chooses per person.
* **Import** (Excel/CSV wizard and the manual bulk-add grid). The person can read the file, see the server's dry run and download the template as usual (`gateAsk`: allowed when they may do it directly **or** may ask); only the **write** differs: the validated file travels as one request.

| Rule | How |
| --- | --- |
| Nothing changes while the request is pending | the filing action only inserts the request |
| A request that could never be applied is **not filed** (bulk: every product would be held back by the publish rule; import: nothing to create or update, strict mode with errors, over 500 rows, too large) | `fileBulkChange`, `submitImport` |
| The server fixes the ids now (a filtered selection is resolved by the server, as in N9) and stores only the change's own few columns; a stored request is cleaned again at execution, so it cannot smuggle a slug, a price or another house's column | `cleanBulkPatch`, `cleanAllowedColumns`, `cleanIds` |
| **Approval applies the change through the SAME function as a direct change** (`applyBulkChange`): the publish quality rule (N6) is judged per product **at that moment** — the ones that pass go live, the rest stay as they are; if none can, the request fails safely as "quality" | `bulkCore.js`, executor `products.bulk` |
| An approved import is **planned and written again now**, in chunks of 200, against today's catalogue by the same engine and rules as a direct import (existing SKUs, the new-category limit, an incomplete row saved as an inactive draft), and logged in the import history with source "approval" | `importApproved.js`, executor `products.import`, `importRunner` |
| The reviewer sees a **summary**, not the rows: how many products and which fields change; how many rows, the mode, the counts of the dry run | `proposedView` in `approvalActionsCore.js` |
| The requester can't approve their own request; the requester's rights are re-read at approval; a request is claimed once; the house is fixed by the request | existing approval rules (`approvals.js`) |
| Bulk and import requests are **not "asked again"** with a button (a stale basis is meaningless for "apply this to those rows"); the requester files a new one | `canResubmit` unchanged |
| Direct people are unaffected: same actions, same results | tests + e2e |

## Screens

* Product list (both houses): the bulk bar keeps its buttons for a person who would need approval, each marked **"needs approval"**; only a *denied* operation hides its button. A result of "filed" is shown as such (nothing changed), and the "all filtered results" dialog says the action is sent for approval.
* Import wizard and bulk-add grid: the button reads **"Send for approval"**, a badge says the import needs approval, a confirmation explains nothing changes until approval, and a success message is shown after filing.

## Tests

* `tests/bulk-import-approval.test.mjs` (10): cleaning; the decision for a person who must ask; one request carrying ids and change, nothing changed while pending, own approval refused, exactly the listed rows changed; the quality rule judged at approval time (and a request that could never be applied is not filed); house separation and tampered requests; the direct path (counts, held-back rows, database failure); import filing (cleaned columns, dry run only, one request), its refusals, the approval writing in chunks with a log line, a failing chunk, no runner, a strict abort; wiring pins in both houses.
* Updated pins (they described the old "cannot be approved" rule): approval registry (executors and filing for the two new operations, both houses), publish-rule gate pins (the gate now lives in `bulkCore.js`), permission and activity-log pins (`gateAsk`, `submitImportForApproval`).
* e2e `accounts-bulk-import-approval` (5): a bulk edit is filed as one request and applied on approval; a direct person still acts at once; an import is read, dry-run, filed and imported only when approved; Beauty's bulk edit through the same path with Health untouched; 320 px.

## Stated limits

* Applying an approved bulk edit/import is **not transactional across rows**: chunks already written stay written if a later chunk fails (the request is then marked failed with its reason). A direct import behaves the same way.
* The change is applied to the ids **as those rows are at approval**, not to the version the requester saw (a bulk edit sets a state — "inactive", "ask for price" — rather than editing text). The reviewer's summary shows the count and fields, not each row's before/after.
* An import's rows are stored in the request (≤ 500 rows, ≤ 1.5 MB). Image files are not part of an import.
* Content banners / FAQ under approval (the other "not offered" item of `PANEL_APPROVAL_PATH.md`) is still not built; documents under approval is N8 (done).

## Round 3 (independent review R5, R6, R7, R11) — what changed and how it is proved
**Status: complete in code and tests for both houses; no migration. Not deployed.** Some limits remain (listed last).

### R5 — an import was authorised as a whole by `products.import`
The import operation only maps to `products.create`; a product manager has it *direct* while the price and publication need approval, yet the engine wrote `price` and `is_active` from the file. Now the engine (`lib/operator/importRun.js`, shared by both houses) works out the operations the rows **really** need and asks `options.authorize(ops)` before it writes anything:
* new row → `products.create` (+ `products.publish` when it is saved active — the template's default is active — or has a publish date, + `products.archive` for an unpublish date); changed row → `products.content` (+ `products.price`, `products.publish` / `products.archive`, `products.stock_flag` **only when the stored value really changes**; a file without a price column, or with the same price, asks for nothing); automatic categories → `categories.create`. The same names and rule as the single-product screens.
* **direct run:** every operation must be *direct*; one that needs approval ⇒ the **whole file** is refused (`needsApproval`, nothing written, not even the harmless rows) and the wizard / bulk grid switch to "send for approval" (the preview already says so); one that is denied ⇒ the file is refused. **No authoriser = nothing is written** (fail closed; a caller cannot forget it).
* **approved run:** the **requester's** current rights are checked (`makeImportAuthorizer({ requester })`): an operation that needed approval is satisfied by the approval, one the requester may no longer do refuses the run; the reviewer's own power is never borrowed. The framework passes the requester to the executor (`approveRequest` → `exec({ …, requester })`).
* The request records the full union of operations (`__ops`), so "ask for X" is refused at filing if any is denied, and a right taken away before approval supersedes it.

### R6 — no product versions, no stale protection
* Each **update** is written only against the version it was planned on (`updated_at`, microsecond exact, inside the same statement). A product edited meanwhile — or since the reviewer saw it (`bases`, carried in the request: product id → `updated_at` at filing) — is reported (`stale`, `staleIds`) and **not overwritten**. A row identical to what is stored writes nothing and records nothing.
* Every changed or created product gets a **history entry** (before / after, who, the request id when approved); `recordVersion` stays best-effort (the count of entries that could not be written is returned, `versionsLost`).
* **Bulk edits**: each product is written in the same statement as its own version condition (`or(and(id.eq.N,updated_at.eq.T)…)`, 40 per statement); products changed meanwhile are listed and left alone; one history entry per changed product (one insert per 100). A database error stops the run and the answer says exactly **how many were done and how many were not** (the audit entry records `done` / `notDone`; a retry skips what already has the value). **There is still no transaction across the whole selection** — chunk-level partial success is explicit, not hidden.
* An approved import reports `staleIds` / failed rows and writes a `product.import_partial` entry when some rows were not applied; the request is "approved and executed" for the rows that were.

### R7 — generated translations looked human
`importTranslateCore.fillTranslations` marks every text it generates `translation_meta[field] = "auto"` (migration 40). It still fills **only empty** fields, never overwrites a text. An update that carries a text in the file replaces an "auto" mark (it is a person's text now) and leaves the other marks. A database without migration 40 still saves the texts (the insert is retried without the marks).

### R11 — the bulk quality gate judged the old row
`planBulkChange` judges every row on the row it **will be** (the stored row with the whole cleaned patch laid over it): publishing while clearing a required category is blocked; a category-only patch on a live product is judged too (clearing a required field is blocked, moving it is fine); a product that already lacked the field keeps the documented exception. The same plan is used when a request is filed (a request that could never be applied is not filed) and when it is approved.

### Tests (permanent; both houses)
`tests/import-bulk-rules.test.mjs` (31): the real planner / runner / bulk code against an in-memory database — the review's scenarios (price 10 → 999 and activation by a product manager; no history; stale; auto translation; bulk publish + clear category) now fail closed and are green; plus the requester re-check, `bases`, partial outcomes, retry. Earlier tests were kept; three pins moved with the code (the engines are thin wrappers over `importRun.js`; `planBulkChange` replaced `gateBulkPublish`; unchanged rows are not written).

### Limits that remain (said plainly)
* Not transactional across chunks of 40 products / 25–200 import rows: a failure leaves the earlier chunks written (exactly listed).
* A new product imported with the template default (active) is a **publication**: a product manager's new rows need approval unless the file says `is_active = no` — consistent with the single-product screen, but a change of habit for them. **Owner decision**, if they would rather let new rows be created as drafts: a one-line change in `opsOfPlan` (would have to be paired with forcing `is_active=false` for them).
* Images are not part of an import; a fully atomic file (all rows or none) is not offered.
