# The approval path is complete (N2)

**Status: complete for the operations listed below. No migration. Not deployed.**

## The rule

"Needs approval" is only a promise if three things exist: an **action that files the request**, a **reviewer who is allowed to decide it**, and an **executor that applies it** after a yes. An operation that lacks any of them is **not an option**:

* it is not offered on the people screen (`approvableFor(house)` in `lib/operator/authz.js`);
* an account change that asks for it is refused (`approval_unsupported`);
* a policy that still lists it (older data) is read as **closed** (`decide()` → `denied`, reason `approval_unsupported`), never as a button that cannot work;
* the role presets list only approvable operations (a test fails otherwise).

## Operations that can really be approved (both houses; brands only in Beauty)

| Operation | Filed by | Executor (what the approval does) | Stale when |
| --- | --- | --- | --- |
| `products.create`, `products.content`, `products.price`, `products.stock_flag`, `products.publish`, `products.archive`, `products.restore_version` | product form, inline edits (price, stock flag, featured, show/hide), duplicate, version revert | update/insert on the exact version (`base_updated_at`) | the product changed after the request, or the slug is taken |
| `products.delete` | delete dialog (typed SKU) | `deleteProductGuarded` with the stored version | product changed or active again |
| `categories.delete` **(new)** | category tree, flat category manager (both houses) | move the products to the chosen destination, delete (attempt first in the history) | the category is gone, has another number of products, a sub-category or another slug |
| `brands.delete` **(new, Beauty)** | brand screen | delete the brand row (products keep their text brand) | the brand was renamed or removed |
| `quotes.delete` **(new)** | request list (one or many) | delete exactly those requests, all or nothing | any of them was changed, answered or removed since (compared by `updated_at`) |
| `media.delete` | media library | remove the file if still unused | file used again |
| `inventory.adjust`, `inventory.count_close` | warehouse | post the adjustment / close the count (single transaction) | counts differ from the reviewed snapshot |

What a request stores: the operation, the thing, the old and the proposed values, the version it was prepared against. For customer requests only the **internal tracking codes** and versions — never a name, phone or message.

## Bugs found and fixed on the way

* **Nobody could approve a request to delete a file or a customer request**: `media` and `quotes` had no `approve` permission, so `canReview` was false even for the owner. Both resources now have it (house admins and owners receive it through their `*` grants). The new test "every approvable operation can be decided by someone" would have caught it.
* **The role defaults listed operations that were never routed to approval** (deleting a category, deleting a request, publishing a document): the action refused with a message that promised approval. Category and request deletion are now real; `documents.publish` was removed from the product manager's defaults until the documents feature exists (item 8) brings its own executor.
* **Inline price/stock edits, "duplicate" and unlinking a brand from a product** refused or — for some screens — reported "saved/deleted" when the answer was "sent for approval". Every delete/edit screen now reads `pending` and says "sent for approval" without changing the list.
* **Bulk edits** used to be refused for a person who needs approval (one request per product would bury the reviewer). **Since N12 a bulk edit or an import files ONE request for the whole change** — see `PANEL_BULK_IMPORT_APPROVAL.md`.
* The approval screen showed "ask again" for requests that cannot be asked again (file deletion, stock correction); it now shows it only where a fresh basis can be read.

## Refusals that hold for every executor (tests)

* a request is decided by someone else: approving your own request → `own`;
* the reviewer needs `<house>.approvals.view` and `<house>.<resource>.approve` of **that** house (a Beauty-only admin cannot decide a Health request, and the Beauty panel cannot see Health requests);
* the requester is read again at approval: disabled, removed from the house, or no longer allowed any of the operations → the request becomes `superseded` and nothing is applied;
* an old request (the record or the set of records changed) → `failed` with `stale`; nothing is applied; the requester can ask again where it makes sense (fresh basis), otherwise files a new one;
* a request for an operation without an executor is refused (`unsupported`) and stays pending (nothing half-applied);
* the executor writes the history under the **reviewer's** session (attempt before the deletion, outcome after).

## Tests

`tests/approval-registry.test.mjs` (registry ⇄ executors ⇄ reviewers ⇄ filing actions; policy handling; behaviour of categories, brands, requests incl. stale / revoked / own / other house / re-ask; every screen reads `pending`), the extended `authz`/`panel-*` pins, and `tests/e2e/accounts-approvals.e2e.mjs` (a request deletion, an inline price edit and a category deletion filed in a real browser and approved by a reviewer).

## Not covered (stated)

Content/banner publication under approval is not built and is **not offered** as an approval option. (Bulk edit/import under approval: N12, `PANEL_BULK_IMPORT_APPROVAL.md`. Document publication: N8.)
