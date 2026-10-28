# Saved list views and "all filtered results" for bulk actions (N9)

**Status: complete in code and tests for both houses. Migration 49 (saved views) is written, tested on a throw-away PostgreSQL 16 and NOT applied anywhere; until it is applied the lists simply show no "views" row. The bulk scope needs no migration. Not deployed. Tajik / English panel texts are machine-prepared and need a human read.**

## 1. Saved views

On the **product list** and the **request list** of both panels, a row under the filters: a menu of **my views**, **Save these filters** (shown only when some filter or search is on screen) and **Delete view** (shown when the filters on screen are exactly a saved view). A view is a name plus the filters the list keeps in its address — text, category, world, stock, status, completeness, sort, size; for requests tab, status, assignee, "needs attention". It **never holds a page number**; applying one is only a navigation to the list's own address.

| Rule | How |
| --- | --- |
| A view belongs to **one person and one house and one list**. Nobody else sees it, lists it or deletes it; every read and delete is bound to `user_id` + house + list. The person always comes from the verified session, never from the browser | `lib/operator/savedViewsCore.js`, `savedViewActions.js` (both houses) |
| The **old shared login has no person**, so it keeps no views: the row is not shown and a save is refused in words | `savedViewsOf` returns `null` |
| What is stored passes through the **same parser as the page** (`parseProductParams` / `parseQuoteParams`) and loses defaults and the page; it is cleaned again on the way out, so a hand-edited row can only become a filter the page itself accepts | `lib/operator/savedViews.js` |
| Name: 1–40 characters, one line, unique per person/house/list (case-insensitive); at most **20** per person/house/list; a view that filters nothing is refused | core + migration |
| Needs the right to **see that list** (`products.view` / `quotes.view`) in that house. A view changes no data | `mayView` |
| Views are created and deleted, never edited in place | migration guard |

### Migration 49

`migrations/49_operator_saved_views.sql`: private table `operator_saved_views` (user → `operator_users` ON DELETE CASCADE, house and list CHECKs, name 1–40, `params` a JSON **object** ≤ 2 KB, unique `(user_id, house, list, lower(btrim(name)))`, a trigger that refuses a 21st view and any UPDATE), RLS on with no policy, nothing for `anon` / `authenticated`, `service_role` may select / insert / delete only. **Needs 34.** One transaction, idempotent, self-checking. **Rollback** (only after the deployed code no longer uses it): the DROP statements in the file header. `scripts/check-rls.mjs` asserts the table is denied to anon.

## 2. Bulk scope: "this page" or "all filtered results"

Ticking the select-all box ticks the rows **on the current page**. When more rows match the filters, the bulk bar offers **"Select all N filtered results"** (and **"This page only"** to go back). Choosing all N and then an action opens a dialog that says the action name, the **exact number** and **the filters**; only the confirmed yes runs it.

| Rule | How |
| --- | --- |
| The **server resolves the ids itself** by running the same filtered query the list runs (`productScope` is the list's own function; requests use `applyQuoteFilters` + the tab). The browser sends the filters and the number it saw, **never ids** | `lib/operator/bulkScope.js` |
| If the count now is **not the count the screen showed**, nothing is applied ("the list changed, refresh") | `scopeChanged` |
| Ceiling **2,000** rows; above it, nothing is applied and the person is told to narrow the filter. An empty result and a failing read are refusals too | `SCOPE_MAX` |
| After that the ids go through the **ordinary bulk runner**: the same session check, the same right (`products.bulk`, `quotes.status`), the same publish quality rules (N6), the same history entry, the same "a person whose policy says *needs approval* cannot do it in bulk" rule | `bulkUpdateFilteredProducts`, `updateFilteredQuotesStatus` |
| Requests: **archive / spam / restore** only. **Deleting** requests stays on the ticked rows of the page | `QuotesPanel` |
| A selection never survives a change of page, filter or tab | the list key resets it |

## 3. Tests

* `tests/bulk-scope.test.mjs` (8): the scope equals the union of all pages of the same filters (five filter sets over 130 products); a moved count applies nothing and returns no ids; ceiling / empty / failing read; both houses use their own tables; the request tab and filters; the filter sentence; source pins (session first, ids never from the client, ordinary runner) and that both lists wire the notice and the dialog.
* `tests/saved-views.test.mjs` (9): names, cleaning, hrefs, save / list / delete as own rows only (other person, other house, other list), every refusal, a missing table, the 20 limit, tampered rows, wiring in both houses.
* `tests/saved-views-migration.test.mjs` (6, real PostgreSQL): needs 34, idempotent, private, constraints, case-insensitive unique name, 20 limit, no update, cascade.
* e2e `bulk-scope` (4): page → all 60 filtered → cancel changes nothing → confirm changes every match incl. pages 2–3 and leaves a product outside the filters; a list that changed during the dialog is refused; "this page only"; requests archive-all; the shared login sees no views row; 320 px bar, offer and dialog. e2e `accounts-saved-views` (3): save / apply / duplicate refused / delete; another person sees nothing; requests views; each house its own; 320 px with a 40-character name.

## 4. Stated limits

* Views are personal; sharing a view with a team is not built.
* The dialog's filter sentence for products lists text, category, stock, status and completeness; the sort and page size are not part of "what will change".
* The 2,000 ceiling is a safety limit for one confirmed action, not a performance claim.
* Deleting requests, bulk price change and bulk category change on all filtered results are **not** offered (category change and price work only on ticked rows, as before).
* Migration 49 is unapplied. Tajik / English texts need a human read.
