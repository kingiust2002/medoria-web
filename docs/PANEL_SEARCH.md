# Quick search of the panels (stage S6b)

Press **/** (outside a text field) or **Ctrl/⌘+K** in either panel, or use the "جستجو" button (sidebar on desktop, header icon on a phone).
Type at least two characters; results appear after a short pause, grouped, each a link:

| Group | Searches | Opens | Needs |
| --- | --- | --- | --- |
| محصولات | SKU, names (4 languages), brand | the product's edit page | `products.view` |
| استعلام‌ها | name, organization, tracking code, product; the phone when ≥ 4 digits are typed | the quotes screen, filtered by that request | `quotes.view` |
| دسته‌بندی‌ها / برندها (Beauty) | slug, names | the screen | `categories.view` / `brands.view` |
| کاربران | username, display name — only people of this house | the people screen | `users.view` |

* Each kind is queried **only** if the person may see it (computed on the server from the verified session); a kind they may not see is
  not even asked of the database. A restricted session (must change password / set up 2FA) sees nothing.
* Results are a title, a short line (SKU, tracking code…) and a link: **never a message text**; at most six per group.
* The term is sanitised exactly like the public catalog search (syntax characters stripped, `%` and `_` literal); an unavailable
  source is simply absent. Reads only: nothing is written to the activity log.
* Keyboard: ↓ moves into the results, ↑/↓ between them, Enter opens the first, Esc closes.
* Not covered: warehouse stock, history and media are not searched (their screens have their own filters).

Tests: `tests/panel-search.test.mjs`, `tests/e2e/panel-search.e2e.mjs`.
