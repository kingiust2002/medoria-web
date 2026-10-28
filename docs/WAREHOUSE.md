# The internal warehouse (stage 4)

Status: **S4a (database + application layer) and S4b (the screens) built and tested; nothing active on any server.**
Migration 36 is additive; the menu entry "انبار" appears only for people with `inventory.view`. The plan is `docs/PANEL_PLATFORM_PLAN.md` (decision D7).

## Rules that cannot be broken from the application

* **Internal only.** Warehouse data is never in a public page, public API route, shared component, search, preview or the printed
  catalogue. Protected twice: by the data structure (separate private tables, RLS on, no policy, nothing for `anon` / `authenticated`,
  not even EXECUTE on the functions) and by a code test that fails if any public file names a warehouse table or function
  (`tests/warehouse-no-leak.test.mjs`). Nothing is added to `products` / `beauty_products`.
* **The public "in stock" flag is a separate human decision.** Migration 36 never writes the product tables or `in_stock`.
* **Health and Beauty are separate warehouses**: `health_stock_*` and `beauty_stock_*`, separate permissions, separate sessions.
* **Stock is never negative and never more reserved than present** (CHECK constraints on the balance row, checked under a row lock).
* **The ledger is append-only.** No UPDATE, DELETE or TRUNCATE for anybody (including a superuser's plain SQL: triggers refuse).
  A mistake is corrected by a **reversal**: opposite rows that point at the original; each movement is reversed once, a reversal is
  never reversed.
* **Balances and the ledger change only through the four functions** (`SECURITY DEFINER`, executable by `service_role` alone). Even
  `service_role` has no INSERT / UPDATE / DELETE on the ledger, balances or reservations; a trigger also requires the functions' own
  transaction flag. The balance always equals the sum of its ledger rows, and every row records `balance_after`
  (both asserted by tests).
* **Every operation has an idempotency key.** The same key with the same request answers the same result and changes nothing; the same
  key with a different request is refused (`idempotency_key_reused`). Two sessions with the same key at the same moment produce one
  movement (advisory lock). A double click, a retry after a timeout or an approval executed twice cannot post twice.
* **A transfer moves both legs or neither** (one transaction, two ledger rows with one `group_id`; balances are locked in a fixed
  order, so opposite transfers cannot deadlock — tested with real concurrent sessions).

## What exists

| Piece | Where |
| --- | --- |
| Tables, functions, guards, privileges, self-check | `migrations/36_warehouse.sql` — **generated** from `scripts/db/gen-warehouse-migration.mjs` (edit the template; `tests/warehouse-migration.test.mjs` fails if the SQL drifts) |
| Names, input cleaning, error translation | `lib/warehouse/core.js` |
| Reads and function calls (service client) | `lib/warehouse/store.js` |
| The actions: permission → clean → function → activity log | `lib/warehouse/actionsCore.js`; the panel files `lib/operator/warehouseActions.js` and `lib/beauty/operator/warehouseActions.js` |
| Approval of stock adjustments | `makeWarehouseExecutors` (wired in both `approvalActions.js`) |

Per house: `*_stock_locations` (code fixed, deactivate only when empty, optimistic `version`), `*_stock_balances`,
`*_stock_movements` (kinds `receive | issue | transfer | adjust | reversal`), `*_stock_reservations`
(`active → released | consumed`, once), and `*_stock_post / _reverse / _reserve / _release`.

* **receive / issue / transfer**: quantity > 0 with at most 3 decimals; **adjust**: signed, a reason of ≥ 3 characters is mandatory.
* **Reservations** hold stock: reserved quantity cannot be issued or transferred by anybody else; an issue may *consume* a reservation
  (its quantity must equal the reservation's); a reservation is released with its own key.
* The SKU in the ledger is read from the product at posting time (a snapshot, not trusted from the caller). A ledger row survives the
  product's deletion.

## Permissions

`inventory.view / receive / issue / transfer / reserve / adjust / count / approve / report / export` plus (new) `inventory.locations`
(create / edit warehouses). `warehouse_manager` has all of them except approve/export; a **stock adjustment is on its default approval
list**: it is filed as a change request (reviewer reads "5 → 3" and the reason), and the approval posts it with the stored idempotency key.
If the stock no longer allows it at approval time the request fails safely as *stale* and the requester files a new adjustment
(stock requests cannot be "resubmitted"). Reversals need `inventory.adjust` and are direct (no approval path yet).
Every action writes an activity-log line (`stock.receive`, `stock.issue`, `stock.transfer`, `stock.adjust`, `stock.reverse`,
`stock.reserve`, `stock.release`, `stock.location_create`, `stock.location_update`); the ledger itself is the durable record.

## The screens (S4b) — "انبار" in both panels

`/operator/warehouse` and `/beauty/operator/warehouse` (permission `inventory.view`; each house its own session and data). Four tabs:
**stock** (one row per product, per-warehouse quantities and reserved, search, warehouse filter, buttons per row), **movements** (the
ledger, 50 per page, SKU/warehouse filter, "reverse" where allowed), **reservations** (active ones, release), **warehouses** (create /
edit, activate / deactivate). Forms open as dialogs: receive, issue, transfer, adjust (signed, reason required; for a person whose policy
says "approve", the button reads "send for approval" and a note says so), reserve. The product is typed as its **SKU** (any case) or taken
from the row's button. Every form creates its idempotency key when it opens, so a double click or retry cannot post twice. Buttons exist
only for the operations the person has (`useCan`); the server decides again on each action. Layout is fluid (card rows, wrapped text; the
mobile e2e runs it at 320–1366 px with long unbroken SKUs and names). Tested end to end: `tests/e2e/warehouse.e2e.mjs` (both houses,
refusal changes nothing, reservations, no leak into public responses, anon cannot call the functions) and
`tests/e2e/accounts-permissions.e2e.mjs`.

## Stock counts, minimum levels and reports (S4c) — migration 41

**Migration 41** (`migrations/41_warehouse_counts.sql`, needs migration 36): per house `*_stock_levels` (a minimum per product),
`*_stock_counts` (one physical count of ONE warehouse: `open → closed | cancelled`, decided once) and `*_stock_count_lines` (per product:
`expected` = what the system held when the count started, `counted`). Private like the rest (RLS on, no policy, nothing for anon /
authenticated). Database guards: **one open count per warehouse** (partial unique index); a closed or cancelled count and its lines are
frozen (`stock:count_closed`) — also against a screen that was open before it was closed; `expected` never changes; counts are never
deleted. Proved on PostgreSQL 16: `tests/warehouse-counts-migration.test.mjs`.

* **Count tab** ("شمارش"): *New count* snapshots a warehouse (every product with a balance row there). The person types the counted
  quantity per line (an empty cell = not counted = left alone; **0 is a count**); a product that is on the shelf but not on the list is
  added by SKU (expected 0). The difference is shown while typing. *Save* stores the entries; *Cancel* ends the count without posting.
* **Closing is ONE database transaction** (`<house>_stock_count_close`, migration 41; review finding R7). The function locks the count row (every
  concurrent save of a counted quantity waits for it, and a save that committed first is simply part of what it reads), verifies the **reviewed
  snapshot** when one is given (an approval carries the exact differences; if the count says something else now, nothing is posted — "stale"),
  posts one `adjust` movement per line whose counted quantity differs from `expected` (key `count-<count>-<product>`) through the ledger function of
  migration 36, and marks the count closed. **All or nothing**: if any difference cannot be posted (for example the stock is now reserved), every
  movement of the close is rolled back, the count stays open and the screen names the product. The difference is `counted − expected`, applied to the
  **current** balance: stock that moved after the snapshot is preserved. Closing a closed count is a harmless replay (nothing posted, not logged
  twice); a request for a different snapshot than the closed one is "stale". Proved on real PostgreSQL, including two sessions racing a save against the
  close, two simultaneous closes, and an injected failure after the first of several movements (`tests/warehouse-counts-migration.test.mjs`).
  Closing is the operation `inventory.count_close`: direct, or — for a person whose policy says "approve" (warehouse manager by default) —
  a change request carrying the exact differences; the reviewer's approval posts them as the requester, and an approval whose count
  changed after it was filed fails as *stale* and posts nothing (`makeCountExecutors`).
* **Minimum levels** (operation `inventory.level`, right `inventory.locations`): a minimum quantity per product across the whole house.
  Below it the stock row shows a *low stock* badge and the stock tab can filter to *low stock only*. Empty removes the level; 0 never flags.
  Without migration 41 the stock tab still works (no minimums, no button).
* **Reports** (right `inventory.export`; each export is written to the activity log as `stock.export`): stock CSV (SKU, name, warehouse,
  quantity, reserved, available, minimum, low), movements CSV, one count's CSV (SKU, expected, counted, difference). Every cell is
  formula-safe (`toCsv`); at most 5000 rows, with a note when cut.
* Code: `lib/warehouse/countsCore.js` (pure), `countsStore.js`, `countsActions.js`; screen `components/operator/warehouse/CountsTab.jsx`.
  Tests: `tests/warehouse-counts.test.mjs`, `tests/e2e/warehouse-counts.e2e.mjs` (both houses).

## Not built yet

* Lots, expiry dates, quarantine, and e-mail / Telegram low-stock alerts (the badge and the filter exist).
* Blocking the permanent deletion of a product that still has stock (today a ledger row simply outlives the product).
* Reversal through the approval queue; reservations linked to customer requests.

## Release (when the screens exist)

1. Fresh production backup; local + R2 chain must PASS.
2. Apply migrations 30, 34, 35 (if not yet), **36**, and — for counts and minimum levels — **41** (one transaction each, idempotent, self-checking).
3. Deploy; `docker compose ps` and a live curl.
4. Post-checks: `npm run check:rls` (now also proves anon cannot read the eight `*_stock_*` tables), the public pages unchanged.
5. Rollback: the previous image ignores the new tables; the migration's own rollback note is at its top (only after the code no longer uses it).
