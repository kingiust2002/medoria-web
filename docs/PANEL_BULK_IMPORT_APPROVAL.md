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
