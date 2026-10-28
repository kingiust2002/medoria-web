# Editable contact details and featured products (N11)

**Status: complete in code and tests for both houses, with the limits listed below. Migration 51 is written, tested on a throw-away PostgreSQL 16 and NOT applied anywhere; until it is applied the two new tabs cannot save and the public pages behave exactly as before (built-in defaults, starred products). Not deployed. Tajik / English panel texts are machine-prepared and need a human read.**

Both are two new **kinds** of the existing site content (migration 42), so they reuse its rights, version lock, publish switch, schedule, activity log and public policy — on the **Content** screen of each panel, tabs "Contact details" and "Featured products on the home page".

## 1. Contact details (per house)

One set per house: **phone**, **WhatsApp number**, **Telegram user name**, **e-mail**. Every empty field keeps the built-in default (the environment values, as before). Values are normalised (spaces, `00`→`+`, `@`, `t.me/` links) and then judged: phone `+` and 7–15 digits, WhatsApp digits only, Telegram 5–32 letters/digits/`_`, e-mail a plain address ≤120 characters; an unknown key is dropped. The same shapes are enforced by the database.

| Where it shows | How |
| --- | --- |
| Each house layout reads the live row once per request (`getHouseContact`, `lib/contactLive.js`, falls back to the defaults on any failure) and provides it to client components (`ContactProvider` / `useContact()`); server components (footers, call-to-action blocks, about / brands / catalog pages, print catalog, top bar) read it directly | `lib/contactLinks.js` builds the WhatsApp / Telegram links from it |
| Header and floating contact menu, product and quote buttons, quick view, sticky quote panel, compare, inquiry list and contact forms (phone, WhatsApp, Telegram, mailto), footers, schema.org phone | every former use of the build-time constants (a test pins it) |
| The AI assistant's system prompt (WhatsApp / Telegram lines) | both chat routes |
| Pinned by a test: no component or page reads `NEXT_PUBLIC_PHONE / WA_NUMBER / TG_USERNAME / EMAIL_*` or imports the constant link builders any more | `tests/contact-featured.test.mjs` |

Rights are the content rights (`content.create / edit / publish / schedule`); nothing here goes through approval (content has no approval executor, as before). The log records the kind and the changed fields, not the values.

## 2. Featured products (per house)

An ordered list of up to **12** products for the home page. An entry is added by **SKU** (an exact match inside the same house; an ambiguous or unknown SKU is refused, never guessed; a variant or another house's product is refused; a product appears once). Order, schedule window and the published switch work like a banner's. The home pages (Health hero + featured section, Beauty hero card + featured section) show the **live** entries that are **active products**, in the chosen order; **with none live they use the old rule** (the products starred with `is_featured`; Health: the first products), so nothing changes until someone publishes an entry. An inactive product stays listed in the panel with a notice and is never shown.

## 3. Migration 51

`migrations/51_site_content_contact_featured.sql`: extends the `kind` check to `contact` / `featured`, one contact row per house, one featured row per product and house, and a shape trigger for both kinds (contact keys and value shapes; featured = a single numeric `product_id`). The public policy and column grants of migration 42 are unchanged (the public sees live rows' `id, house, kind, data, sort_order` only). **Needs 42.** One transaction, idempotent, self-checking. **Rollback** (only after the deployed code no longer uses the kinds): the statements in the file header.

## 4. Tests

* `tests/contact-featured.test.mjs` (9): contact cleaning and every refusal, the new kinds in `cleanContent`, what the public takes (defaults, judged again, newest wins), link builders, the featured id order / repeats / limit, the actions (one contact per house, optimistic lock, rights, SKU lookup, variants, other house, repeats, limit, product fixed on edit, no values in the log), house isolation and wiring pins.
* `tests/site-content-contact-featured-migration.test.mjs` (7, real PostgreSQL): needs 42, idempotent, kinds, one contact per house, shapes, one featured per product and house, public sees only live rows and public columns, house/kind fixed.
* e2e `contact-featured` (5): contact details written in the panel appear in the public footer / contact page / call-to-action (server HTML) and not in the other house; a bad phone is refused in words; unpublishing restores the defaults; Beauty's own; featured: SKU added, order, inactive never shown, repeat and unknown SKU refused, other house's SKU refused, deleting all returns to the old rule; 320 px. Existing content, public-page and panel e2e were rerun with this tree.

## 5. Stated limits

* The **gateway** (`/`, the neutral parent page) keeps its build-time e-mail; its parent address is not editable here (stated on the screen).
* The built-in defaults still come from the environment; changing a default needs a deploy, as before.
* Contact **address / opening hours / social links / per-language texts** are not part of this (no such fields exist on the public pages today).
* Featured: products only (no categories, no custom cards); added by SKU, not by a picker; ordering by a number, not by drag and drop.
* Migration 51 is unapplied. Tajik / English texts need a human read.
