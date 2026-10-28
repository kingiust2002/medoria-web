# Publish quality rules (N6)

**Status: complete in code and tests for both houses; migration 46 is written, tested on a throw-away PostgreSQL 16 and NOT applied anywhere. Not deployed. Tajik / English texts are machine-prepared and need a human read. Which gaps should block is the owner's decision — the rule starts EMPTY (no blocking), exactly as before.**

## What it is

The panel already pointed at what a product page lacks (`lib/operator/completeness.js`: image, SKU, category, a name and a description in each of the four languages, specs). N6 lets the **main manager choose, per house, which of those gaps BLOCK publishing** — and applies that one rule to **every way a product can become public**:

| Way a product becomes public | Where the rule is applied |
| --- | --- |
| a form save (new product live, or an edit that switches it on) | `createProduct` / `updateProduct` (both houses), before anything is written or filed |
| the on/off switch of the list, the quick edit | `setProductActive`, `quickUpdateProduct` |
| bulk "activate" | `bulkUpdateProducts` → `gateBulkPublish`: the products that pass are published, the others are **listed with what they lack** |
| an approved request | filed only if it passes **now** (an impossible request is never filed), and judged **again** when a reviewer approves (`approvalExecutors` → the request fails with `exec_error = quality` and nothing changes) |
| a scheduled publication | the scheduler judges at the moment of publishing; a blocked product stays inactive **with its date kept** and is tried again at the next run (fixing it publishes it); saving an incomplete draft **with a publish date** is refused like a publication |
| file import / bulk add | the plans go through `applyRulesToPlans` before the dry-run preview and the write: an incomplete row is still **saved — as an inactive draft** that says what it lacks (nothing is lost, nothing incomplete becomes public) |
| restoring an old version | `restoreVersion` judges the result |

Not judged, by design: **variants** (a variant is not a page of its own — N3), drafts that have no publish date, archiving.

## The rule

* One function: `lib/operator/publishRules.js` (`publishBlockers`, pure) applied by `lib/operator/publishGate.js` (`gateOne`, `gateItems`, `gateBulkPublish`, `applyRulesToPlans`). A change "becomes public" when the resulting row is active **or carries a publish date**.
* **A product already live is not punished for gaps it already had**: only a gap an edit **newly creates** blocks that edit (so a long-standing gap never freezes a price update, but clearing a required name does).
* **Fail closed**: if the rules exist but cannot be read, nothing is published ("the rules could not be read") — drafts still save. A change that publishes nothing never reads the rules.
* **Before migration 46** there is no rule: publishing behaves exactly as before, and the settings card says migration 46 is needed.

## Choosing the rule

* A card **«قوانین کیفیت انتشار»** on the settings page of each panel (checkbox per gap, grouped; «برداشتن همهٔ قوانین»). Everybody who may see products reads it; changing it needs the new permission **`products.rules`** (operation `products.publish_rules`, **direct only**, never an approval — a rule that decides what may go public is not waiting for someone else). The owner and the house administrator have it; a product manager does not (the card is read-only for them, the server refuses a forged save).
* Optimistic lock (`version`), first save creates the row, every change is in the activity log (`publish_rules.update`, old and new list). Health and Beauty have **separate** rules.
* The product form shows **before the save** what the server would refuse to publish (`data-testid="publish-gaps"`); the server enforces the same rule again. Lists, bulk and import show the same words in the panel's language.

## Migration 46

`migrations/46_publish_rules.sql` — one private table `publish_rules` (`house`, `blocking text[]` with a CHECK accepting only the known codes, `version`, `updated_*`), a guard trigger (version bump, house fixed, **never deleted**), RLS on with no policy, nothing for `anon` / `authenticated`, `service_role` may select / insert / update only. Needs 34. Additive, idempotent, one transaction, self-checking. **Rollback** (only after the deployed code no longer uses it): `DROP TABLE public.publish_rules; DROP FUNCTION public.publish_rules_guard();`. `scripts/check-rls.mjs` now also checks that `anon` cannot read it.

## Tests

* `tests/publish-rules-migration.test.mjs` (5, real PostgreSQL): needs 34 / idempotent; private; only known codes, one row per house; version bump, house fixed, no delete (not even by the owner role); the code list agrees with the application's.
* `tests/publish-rules.test.mjs` (16): the pure rule (grandfathering, schedules, variants, drafts), the words in fa / en / tg (no Persian leaks into en / tg), reading the rule in all states, the gate (no read when nothing goes public, fail closed), approval executors, scheduler (blocked keeps its date, retry, unreadable rule), bulk, import plans, restore, saving the rule (right, lock, audit, both houses), the new permission, source pins that **every** product-writing path goes through the gate and that the list of modules that write product rows is exact.
* `tests/e2e/publish-rules.e2e.mjs` (2, real browser): choose the rule on the settings page; the list refuses an incomplete activation in words; the form shows the gap before saving and refuses the save but still saves the draft; a live product with an old gap can still be edited, a new gap is refused; bulk publish lists what was stopped; the cron endpoint leaves a blocked product with its date; Beauty has its own rule; the card fits 320 px. `tests/e2e/accounts-publish-rules.e2e.mjs` (2, personal accounts): read-only for a product manager, "changed by" shown; a request to publish an incomplete product is not filed; a product that became incomplete before the approval fails the request safely.

## Stated limits

* **The choice of blocking gaps is the owner's** — the rule starts empty. A sensible first set would be image, SKU, category and the English name/description, but that is a suggestion, not a default.
* Already-live products are not re-judged until they are edited; there is no report of "live products that would fail the rule" (the existing completeness filter shows gaps).
* Enforcement is in the application. A script that writes the table directly (service role) is not stopped by a database constraint.
* A scheduled product that stays blocked is retried at every run silently apart from the counters / activity-log entry `product.scheduled_blocked`; there is no badge on the list yet.
* Import: an incomplete row becomes an inactive draft rather than being rejected (so no data is lost); the person must open the draft to finish it.
