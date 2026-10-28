# The internal warehouse (stage 4)

Status: **S4a — database + application layer built and tested; no screens yet (S4b), nothing active on any server.**
Migration 36 is additive and inert until the screens are deployed. The plan is `docs/PANEL_PLATFORM_PLAN.md` (decision D7).

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

## Not built yet (S4b and later)

* The screens (overview, per-product stock, movement history with "reverse", locations, reservations, forms).
* Lots, expiry dates, quarantine, low-stock alerts, stock counts and discrepancies, reports and CSV.
* Blocking the permanent deletion of a product that still has stock (today a ledger row simply outlives the product).
* Reversal through the approval queue; reservations linked to customer requests.

## Release (when the screens exist)

1. Fresh production backup; local + R2 chain must PASS.
2. Apply migrations 30, 34, 35 (if not yet) and **36** (one transaction, idempotent, self-checking).
3. Deploy; `docker compose ps` and a live curl.
4. Post-checks: `npm run check:rls` (now also proves anon cannot read the eight `*_stock_*` tables), the public pages unchanged.
5. Rollback: the previous image ignores the new tables; the migration's own rollback note is at its top (only after the code no longer uses it).
