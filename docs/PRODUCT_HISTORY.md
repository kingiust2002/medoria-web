# Product edits: the lock, the history and "revert" (stage S5c, migration 38)

## The optimistic lock
The edit form remembers the `updated_at` of the product it shows and sends it with the save. The server compares it with the product as
it is *now* (and the write itself is conditional on that exact `updated_at`, so a save that lands between the read and the write
cannot slip through). If somebody saved in between, **nothing is written**; the form shows a banner with who changed it last and when
(from the history) and three choices:

* **Load the latest version** – what the person typed is first stored as a local draft for that product (edit mode now has a
  draft too), so after the reload a banner offers the text back;
* **Save anyway** – takes the current version as the new basis and saves again (the other change is replaced, and stays readable in the history);
* **See the history**.

Covered: the full edit form of both houses. Not covered: the inline edits in the list (price, stock, featured, archive), bulk edit and
CSV/Excel import — they change one field at a time or are explicit mass operations; they *are* recorded in the history (except import).

## The history (`product_versions`, `beauty_product_versions`)
One row per change: the **changed fields only** (old and new value), the person (account id + label), the kind (`update | quick |
approval | restore`), the approval request id when it came through the queue, and the time. Append-only (the database refuses update,
delete and truncate for everybody), private (RLS, service role may read and append only), no foreign key to the product tables — the
history of a deleted product stays. Writing it is best effort: a missing table or a failed insert never undoes a saved change (the
activity log still has the before/after). Page: `/operator/products/<id>/history` in both panels (needs `products.view`).

## Revert this change
Writes the **old values back as a new change** (recorded as `restore`, pointing at the version it reverts; the activity log gets
`product.restore` with before/after). History is never rewritten.

* Only fields that differ from the current product are written; fields changed *again* since are flagged in the confirmation dialog.
* `slug`, `sku` and database-maintained fields are never written back.
* Same rules as an edit: reverting a price needs the price right, a visibility change needs publish/archive; a person whose policy says
  "approve" files a change request instead (executed against the exact version, like any other).
* The call carries the `updated_at` the page showed; a stale page gets the conflict answer.
* Needs the right `products.restore_version` (product editors have it through `products.edit`).

## "View on site"
The edit form links to the live public page of an active product (`/health/tg/catalog/<slug>`, `/beauty/tg/catalog/<slug>`). A private
preview of a draft/archived product is **not** built (the public pages read only active products by design).

## Release
Migration 38 needs 34. The panel works without it (no history; the history page says so; saves are never blocked).
