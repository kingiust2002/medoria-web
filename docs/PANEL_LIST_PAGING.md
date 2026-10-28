# Server-side paging of the panel lists (N1)

**Status: complete for the lists named below. Needs migration 43 for two features (the completeness filter/count and the full customer file); everything else works without it. Not deployed.**

## Why

Until now the product list loaded the 2,000 most recently changed products, the request list the newest 1,500 requests, the dashboard computed its numbers from the newest 5,000 rows of each, and the warehouse stock tab searched inside the 500 most recently changed balances. Everything was then filtered, sorted and counted **in the browser**. Rows beyond the cap could not be reached except through the quick search, every number was computed from a partial list, and — because the API also stops silently at 1,000 rows per request — even "read everything" queries (counts per category, stock-count snapshots, CSV exports) lost rows without any error.

## What a list is now

The whole state of a list lives in the **address**: `?page=&size=&q=&cat=&world=&stock=&status=&complete=&sort=` for products, `?tab=&q=&status=&who=&attention=&page=&size=` for requests. The server reads it (`lib/operator/listQuery.js`: every value is checked against an allow-list or a strict pattern; page 1–100000; size 25/50/100; search text has PostgREST syntax stripped and LIKE wildcards escaped, 80 characters), asks the database to filter, sort and count (`select … count=exact` + `range`), and returns one page. Every sort ends with the id, so neighbouring pages never overlap or skip a row. A page past the end answers the last page that exists. A failed read is shown as an error — never as an empty list or a zero.

| Screen | Server-side now | Notes |
| --- | --- | --- |
| Products, both houses | text search (4 names, SKU, brand), category, Beauty world, stock, active/archived, completeness, sort (updated / newest / name in the panel language / category), exact total | "category" sort groups by category (id order); the old alphabetical-by-category order needed a join. A link `?brand=` from the Beauty brands screen still pre-fills the search. |
| Customer requests, both houses | tab (active / archived / spam / all), text search (name, phone, product, organization, tracking code, assignee), status, assignee / unassigned, "needs follow-up" (unanswered 24 h · notice failed · follow-up due), exact count of every tab, every status and the follow-up badge | the "needs follow-up" rule is the old in-browser rule, proved equal on 2,600 generated requests |
| Customer file (same phone) | one indexed query on `phone_key` for the people on the page | without migration 43 it knows only the page's own rows and the data says so (`customerFile: "page_only"`) |
| Dashboard, both houses | exact head counts (total, active, archived, no price, no image, incomplete, new / total / overdue requests, failed notices), newest 6 products and 8 requests | a block the person may not see is not read at all |
| Categories, brands: product counts | every product read in chunks of 1,000 (`readAll`); a failed read stops the page instead of showing "0 products" (the delete screens trust the count) | |
| Beauty brand roster | the brand's products and a search over the others come from the database (a modal action), no whole-catalogue prop | |
| Warehouse stock | every balance row read in chunks, grouped per product, filtered (search over the whole catalogue, low stock, one warehouse), ordered by SKU, cut into pages of 50 with an exact total | one narrow read per view; fine at this scale, a database function can replace it when a house passes ~100k balance rows |
| Warehouse reservations, count list | paged (50) with previous/next | |
| Approval queue | "waiting for you": every pending request the person may decide (read in chunks — the old read stopped at 200 *before* filtering by who may decide, so a long queue hid requests and under-counted the menu badge); "my requests": pages of 25 with an exact total | |
| People (users) list, activity-log CSV | every row (chunked); the activity viewer was already paged by the database | |
| Stock-count snapshot, count lines, minimum levels, CSV exports (stock, movements, requests), the quote report | all rows, read in chunks; an unreadable chunk or more than 200,000 rows is an **error** (the count is cancelled; the export fails), never a silently partial snapshot or file | |

Removed: `lib/operator/listLimits.js`, the "only N newest shown" notice, the 5,000-row dashboard bound, the 5,000-row CSV cut.

## Migration 43 (`migrations/43_panel_list_paging.sql`)

* `gap_count(products)` and `gap_count(beauty_products)` — a PostgREST **computed column**: the number of gaps of a product page, with exactly the rule of `lib/operator/completeness.js` (image, SKU, category, 4 names, 4 descriptions, specs; blank = NULL or only whitespace; specs empty = not an object or `{}`). Executable by `service_role` only (`REVOKE … FROM PUBLIC, anon, authenticated`). The panel filters `gap_count > 0` / `= 0` and counts incomplete active products with it.
* `phone_key` — a **generated stored column** on `quote_requests` and `beauty_quote_requests` (last 9 digits of the phone when it has ≥ 7 digits; same rule as `phoneKey()` in `lib/operator/quoteOps.js`), indexed. The request tables stay private (RLS on, no policy, no grants — the self-check asserts it).
* Indexes for the list orders: `(updated_at DESC, id DESC)` on both product tables, `(status, created_at DESC, id DESC)` on both request tables.

**Order of execution:** after migrations 01/10/32 (the tables and the request columns), at any point before or with the release that uses the new lists. **Compatibility:** the migration is additive and idempotent; the old code ignores the new objects. Without it the new code still pages, searches and counts everything; only "incomplete/complete" (a visible message) and the cross-page customer file are unavailable. **Rollback** (only after the deployed code no longer uses them): the `DROP FUNCTION … / DROP COLUMN phone_key / DROP INDEX` lines at the top of the file. No existing migration was edited.

## How it is proved

* `tests/panel-list-paging-migration.test.mjs` — real PostgreSQL 16: the SQL `gap_count()` equals `productGaps(row).length` for ~3,000 generated rows in each table (every mix of null / empty / whitespace / one-space / specs shapes), `anon` and `authenticated` cannot execute it, `phone_key` equals `phoneKey()` for many formats and is NULL under 7 digits and cannot be written, the request tables stay unreadable by public roles, re-running changes nothing.
* `tests/list-paging.test.mjs` — the readers against an in-memory client that **drops rows beyond 1,000 silently like the API**: 3,500 products and 2,600 requests are reachable page by page with exact totals, no duplicate and no gap; every filter equals the old in-browser rule; hostile search text cannot add a filter; both houses touch only their own tables; failed reads are errors; dashboard numbers equal the old definitions over 6,200 / 5,300 rows (the old code stopped at 5,000); chunked reads versus the naive select (negative control); warehouse stock, count snapshot and exports complete; source pins (no remaining cap, every screen uses the pager and the address, the readers check the permission before the database).
* `tests/e2e/list-paging.e2e.mjs` — real Chromium against the fake database (which also caps at 1,000 rows and understands the full PostgREST filter grammar): see the file.
* Not proved: the filters against a **real PostgREST** (the grammar is the documented one and the test doubles reject anything outside it; computed-column filtering relies on PostgREST's documented support), and performance with a very large catalogue (indexes added, not measured).

## Limits that remain (deliberate, stated)

* The **stock-count worksheet** (one count's lines) shows all lines of one warehouse snapshot on one screen — complete, but a very large snapshot makes a large page. The close step verifies the reviewed difference list, which needs the whole list on screen; paging it would need a different review design.
* Category sort is by category id, not alphabetical by name.
* The assignee dropdown lists the active people of the house, the name in the current filter, and the names on the current page; older typed names are found through the search box (it searches the assignee column over all requests).
* Activity log, approvals and users: see their own sections of this file when changed (the activity log is filtered by the database and already bounded per query; its viewer and CSV are listed in the work log).
