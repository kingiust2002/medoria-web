# Warehouse lots (batches), expiry and quarantine (N4)

**Status: complete in code and tests for both houses; migration 45 is written, tested on a throw-away PostgreSQL 16 and NOT applied anywhere. Not deployed. Alerts are shown in the panel; sending them out (Telegram / e-mail) is NOT built. Tajik / English texts are machine-prepared and need a human read.**

Internal only, like the rest of the warehouse (`WAREHOUSE.md`): nothing here is in a public page, route, search, preview or the printed catalogue (`tests/warehouse-no-leak.test.mjs` names the new tables and functions too).

## What it is

Stock of a product can be kept in **batches** (lots): a batch has a **code**, an optional **expiry date** and a **status** — `active`, `quarantine` or `rejected` (final). A batch is created when goods are received and a batch code is typed (`receive` with a code; the same code again adds to the same batch, a different expiry date for the same code is refused; the batch may arrive straight into quarantine). Stock **without** a batch keeps working exactly as before — nothing is forced, nothing is invented for existing stock.

* **Usable stock** = on hand − reserved − *unusable*, where *unusable* is the stock in batches that are quarantined, rejected or **expired** (an expiry date is the last valid day; expired from the next *team calendar day*, `Asia/Dushanbe`, in the database and in the panel).
* The stock list shows, per product: on hand, reserved, **usable** and **unusable**, the batches (code, quantity, expiry, state); "low stock" is judged on the **usable** quantity.
* The **batches tab** lists every batch that holds stock (soonest expiry first), filterable by *expired / expiring (30 / 60 / 90 days) / quarantine / rejected*, searchable by batch code, SKU or name, per warehouse, with each batch's **history** (who changed its status or date and why, and every movement of it).
* An **alert strip** over the stock and batches tabs counts *expired (with stock) · expiring within N days · in quarantine · rejected · low usable stock*; every counter is a link to the list it counts. Without migration 45 there is no strip and the tab says so.

## Rules the database keeps — for every path (migration 45)

| Rule | How |
| --- | --- |
| lot stock never exceeds the product's balance in a warehouse (the rest is stock without a batch) | `AFTER` trigger on the lot balances + `BEFORE UPDATE` guard on the balances |
| **quarantined / rejected / expired stock can be neither issued, transferred nor reserved** | the guard on `*_stock_balances`: whatever lowers *available* (`quantity − reserved`) cannot take it below the unusable quantity. It protects **the older functions of migration 36 and the count close of 41 as well** — they were not changed, and a script run as the owner is held by it too. The message says how much *is* usable |
| stock kept in a batch leaves through its batch, never as "stock without a batch" | same guard (`lot_stock_protected`) |
| issue / transfer need a usable batch; a write-off (`adjust`, reason required) works on any batch, which is the way out of expired / rejected stock | `*_stock_lot_post` |
| a batch cannot become unusable (quarantine, rejection, an earlier expiry) while reserved stock would be left without usable stock | `*_stock_lot_update` (refuses with `reserved_stock_in_lot`; release the reservations first) |
| a rejected batch is final; a batch's code and product never change; nothing is deleted | guards + `lot_rejected`, `lot_identity_is_fixed`, `never_deleted` |
| the batch of a movement is recorded with it (append-only link), a **reversal puts the stock back into the same batch**; a reversal that cannot (the batch was issued since) is refused and changes nothing | `*_stock_movement_lots`, `*_stock_lot_reverse` |
| **atomic**: ledger posting and batch balance are one transaction — a refusal anywhere (for example a reservation that does not match) rolls the batch back too | the lot functions call the ledger functions of 36 inside their own transaction |
| the same idempotency key twice (also from two sessions at once) posts once; the same key with another batch is refused (`idempotency_key_reused`) | advisory lock + replay check |
| every status / expiry change has a reason, the version the screen showed must still be current, and the change is written to the batch's history | `*_stock_lot_update`, `*_stock_lot_events` (append-only) |
| private: RLS on, no policy, nothing for `anon` / `authenticated`, **no direct writes even for `service_role`** | self-checked at the end of the migration |

## Who may do what

* receive / issue / transfer / adjust / reserve: unchanged rights; naming a batch needs the same right as not naming one. A stock **adjustment that names a batch** goes through the same approval path as any adjustment (the request carries the batch; the approval posts through the batch function with the stored key; an approval whose batch is gone or no longer usable fails as *stale* and posts nothing).
* **Quarantine, release, reject, correct the expiry date**: the new operation `inventory.lot_status` (permission `inventory.quarantine`) — direct only (a quality decision; not offered as an approval option). Warehouse manager and house admin have it; a person who may merely move stock does not.

## Migration 45

* **File**: `migrations/45_warehouse_lots.sql`, **generated** from `scripts/db/gen-warehouse-lots-migration.mjs` (edit the template; `tests/warehouse-lots-migration.test.mjs` fails if the SQL drifts). **Needs** 34 and 36 (41 for counts). **Order**: any time after 41/44; the code that uses it is tolerant of both states.
* **Compatibility**: additive — four tables and a few functions per house, one extra trigger on each balances table, `stock_today()`. No existing row, grant or function of 36 / 41 changes; stock without a batch posts through the same function as before. Idempotent, one transaction, self-checking (aborts and rolls back on any mismatch).
* **Rollback** (only after the deployed code no longer uses batches, and only when the lot rows are not needed): exact statements in the file header. Do not edit an applied migration; add a new one.
* **Without it**: no lot fields, no batches strip; the batches tab says migration 45 is needed; naming a batch is refused with that message; reversals use the older function. A lot table that **exists but cannot be read** is an error — the stock list never shows stock as usable when its batches are unknown.
* **Tests**: `tests/warehouse-lots-migration.test.mjs` runs the file on PostgreSQL 16 for **both houses** (26 tests): needs 36 and changes nothing without it; idempotent and private; receipt into a batch; uniqueness per product, case-insensitive; issue / protection of lot stock by every function; quarantine, release, rejection; expiry on the team calendar; write-off; reserved stock vs. a batch becoming unusable; transfers and reversals with batches; replay, a race of two sessions, rollback after a failure; no direct write by anyone; ledger/lot/balance reconciliation. The tests of 36 and 41 still pass unchanged.

## Tests (application layer and browser)

* `tests/warehouse-lots.test.mjs` (18): the pure rules (state on a day, usable, alerts, input cleaning), which database function a movement uses, the behaviour before migration 45, who may change a batch, the approval of an adjustment that names a batch, what the stock and batches tabs are told (usable vs unusable, low on usable, windows, views, search, history, lot codes on movements), wiring and house separation.
* `tests/e2e/warehouse-lots.e2e.mjs` (real browser, the fake database mirrors the SQL rules): receive into batches and into quarantine, usable vs unusable on screen, the refusal that names the usable quantity, a quarantined batch that cannot be chosen, release with a reason and history, an expiry date corrected so that stock expires, write-off through the batch, Beauty separate, 320 px with a long unbroken code.
* Permission / audit pins (`stock.lot_update`), `scripts/check-rls.mjs` (the four new tables per house must be denied to a stranger), the no-leak test.

## Stated limits

* **Alerts are on screen only.** Nothing is sent to Telegram or e-mail; delivering them would need the owner's decision on recipients and a verified channel — it is not claimed.
* **Stock counts (migration 41) stay per product.** A count that lowers a product's quantity is applied to the stock *without* a batch; if that stock is not enough the close fails as a whole and names the product — write off the batch first, then count. Counting per batch is not built.
* **No automatic first-expiry-first-out picking.** The person chooses the batch (the list is sorted soonest-expiry first); an issue without a batch takes only stock without a batch.
* Batches are not linked to customer requests or to reservations (a reservation holds a quantity of the product; the batch is named when it is issued).
* Variants (N3) are separate products, so each variant has its own batches.
* The "team calendar day" is fixed to `Asia/Dushanbe` in the database (`stock_today()`) and the panel (`teamDay`).
* Existing stock is not turned into batches automatically.

## Owner confirmation

* Tajik and English texts of the new screens are machine-prepared; the Persian term used is «بچ», Tajik «партия», English "batch".
* Whether and where low-stock / expiry alerts should be pushed (Telegram, e-mail) is the owner's decision.
