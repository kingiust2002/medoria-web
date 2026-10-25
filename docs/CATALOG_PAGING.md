# Catalog search and paging (server-side)

## What changed

| Place | Before | Now |
| --- | --- | --- |
| Health catalog (`/health/{lang}/catalog`) | downloaded **every** product (silently capped at 500), filtered, sorted and sliced in the browser | the database filters, sorts and counts; the browser holds 24 per page; "load more" fetches the next page; the exact total is shown |
| Header search palette (⌘K) | downloaded all products on first open | asks for 6 matches as you type (250 ms debounce); the answer for old text is ignored |
| Beauty catalog (`/beauty/{lang}/catalog`) | one unpaginated list (≤ 500) | 24 per page with plain links (works without JavaScript, every page crawlable); filters keep their values, a filter change returns to page 1 |
| Sitemap, Health category pages | `getProducts()`: first 500 products only | `getAllProducts()` / `getAllBeautyProducts()`: every active product, read in chunks of 1000 |

Without this, product number 501 would have vanished from the catalog, the search and the sitemap with no error.

## Rules (`lib/catalogQuery.js`, tested in `tests/catalog-query.test.mjs` and `tests/e2e/catalog-search.e2e.mjs`)

- 24 per page (max 60); `?page=` is parsed strictly (digits only, 1–500); anything else is page 1.
- **Every sort ends with the id**, so neighbouring pages never overlap or skip a row.
- Sorts: suggested, newest, price ↑/↓ (price on request last), most viewed, name (in the page language; an unknown language falls back to English).
- A page past the end answers page 1 (the Beauty page redirects to it), whether PostgREST says 416 or returns an empty page.
- Search text cannot change the query: PostgREST syntax characters are stripped, `%`/`_` escaped, 80 characters at most; exactly one OR group is built from it.
- Archived products never appear (`is_active`), as before. In the Health catalog an inactive **category** still hides its products; products with **no category** stay visible in the unfiltered list (inside a chosen category they are not, as before).

## Behaviour that is deliberately the same

URLs (`?q=`, `?category=`, `?brand=` on Health; `?cat=`, `?q=`, `?brand=`, `?sort=` on Beauty), the look of both catalogs, quick view, compare, quote buttons.

## Known limits (not changed here)

- Home-page pieces that read `getProducts()` (hero, featured products, the category grid's per-category counts) still see at most the first 500 products. With a few hundred products that is invisible; the category-grid counts would become approximate beyond 500. A grouped count (a small database view or RPC) is the fix when the catalog approaches that size.
- The Health catalog's filters live in component state, not in the address bar (as before): a filtered view cannot be bookmarked, and "load more" is not a link. Beauty is fully link-based.
- Full-text search/typo tolerance is not added: matching is a case-insensitive "contains" on names (4 languages), SKU and brand, as before.
