# Approved deletions that cannot delete something newer (R3, R9, R10)

**Status: complete in code and tests for both houses. Migration 53 is written, tested on a throw-away PostgreSQL 16 and NOT applied anywhere. Nothing is deployed.**
Origin: the independent review of 2026-10-29 (`docs/PANEL_INDEPENDENT_REVIEW_2026-10-29.md` on `review/n1-n13-20261029`), findings R3, R9 and R10 of PR #229.

## What was wrong
| Finding | Old behaviour |
| --- | --- |
| R3 | An approved deletion of customer requests compared `updated_at` in the application, then sent `DELETE … WHERE id IN (…)`. A request answered between the check and the DELETE (the review changed it inside the audit write) was deleted. |
| R9 | The category plan read its products through the API with no paging, so a category with 1,100 products and a 1,000-row API cap was planned and moved with 1,000. |
| R10 | The category approval stored the slug and the product **count**: swapping one member for another kept the count, so the approval moved the new product and deleted the category. The brand approval compared name and slug only and its DELETE was conditioned on the id alone. |

## What happens now
Three steps for every one of these deletions, whether it is approved or direct:
1. **Plan** (read only): the database returns the *basis* — a hash of the whole category (or brand) row, the number of sub-categories, the number of members and a hash of every member product with its version. Members are counted in the database, so no row cap can hide one.
2. **Attempt**: the activity-log entry `<thing>.delete_attempt` is written first; if it cannot be written (no table, no writer, a failure, a thrown error) nothing is deleted (unchanged rule, `auditedDelete.js`).
3. **One transaction** (`operator_delete_*_checked`, migration 53): lock the rows (the category, the destination, every member, in id order), compare with the basis the reviewer saw, and either move the members + delete, or change nothing. Outcome `<thing>.delete` or `<thing>.delete_failed` with the reason (`stale`, `not_found`, `has_children`, `migration_missing`, …).

* An **approved request carries its basis** (`proposed._basis`, or `_versions` for requests) and is executed against *that*, never against a fresh read. A request filed by older code has no basis and is refused as stale — the asker uses "ask again", which files a new basis.
* "Same count, different products" is stale. So is any edit of a member product (its version changed), of the category row (name, image, focus point…) or of the brand row, and a product attached to the category while the approval waits (the lock makes the approval wait for that session and then see its row).
* A category with sub-categories is refused for **both** houses (Beauty's `parent_id` is `ON DELETE CASCADE`, so deleting a parent would silently delete its children).
* Quotes: all or nothing — one changed, answered or missing request means none is deleted. Versions are compared as `timestamptz`, so a one-microsecond difference is a different version (same rule as the approved product deletion).
* **Fail closed without migration 53**: the executors cannot find the function, delete nothing, and write `delete_failed (migration_missing)`.

## Migration 53
`migrations/53_atomic_approved_deletes.sql` — functions only; `service_role` only (`anon` / `authenticated` cannot execute them; tested). Idempotent. Needs the tables of migrations 01/10/12/20/32. Rollback: drop the five functions (header of the file); the application then refuses these deletions.
**Order:** it can be applied at any time after 32; it is required before the first approved or direct category / brand deletion and before the first approved request deletion.

## Tests (permanent)
* `tests/atomic-approved-deletes-migration.test.mjs` — the SQL on a real PostgreSQL, both houses: version exactness to the microsecond, all-or-nothing, 1,500 members, equal-count swap, row and member edits, sub-categories, destination rules, a late insert and a late answer by **really overlapping sessions**, two approvals racing for the same requests, privileges.
* `tests/approved-delete-real-db.test.mjs` — the panels' real executors (`executeApprovedQuoteDelete`, `executeApprovedCategoryDelete`, `executeApprovedBrandDelete`, `planCategoryDelete`) driven through the real functions: the review's R3 scenario (row changed inside the audit write) leaves the newer request and records `delete_failed`; 1,500-product plan and move; the equal-count swap; missing audit writers; missing migration.
* `tests/approval-registry.test.mjs`, `tests/panel-security.test.mjs` — the earlier approval / audit pins, kept; the in-memory stand-in for the five functions is `tests/helpers/atomicDeleteRpc.mjs` (semantics only).
* Limit: no real PostgREST / Supabase API was in the loop (the sandbox cannot run it). The executors call the functions through the same `rpc()` interface the application uses; the HTTP layer is covered by the owner's post-release probe (runbook).
