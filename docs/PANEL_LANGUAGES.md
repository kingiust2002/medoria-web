# The operator panels in three languages

Both panels (Health `/operator`, Beauty `/beauty/operator`) and their login pages (`/login…`) speak **Persian** (the default,
right to left), **Tajik** and **English** (left to right). Russian is not a panel language (it stays on the public site).
The language is chosen with the **FA / TG / EN** switch (bottom of the sidebar, in the phone menu, top corner of the login
pages) and remembered in the `medoria_panel_lang` cookie (one year, only these three values are accepted; anything else
means Persian). It only changes what the person sees: nothing is stored on the server and no session depends on it.

## How a text is translated

The **key is the Persian source text itself**, so Persian needs no dictionary and the code stays readable:

```jsx
const t = useT();                       // client component   (server component: const t = await getT())
<h1>{t("محصولات")}</h1>
t("{count} مورد انتخاب شده", { count })  // placeholders in {braces}
<Trans t={t} k="فقط لوگوی {official} برند…" values={{ official: <b>…</b> }} />   // a sentence with an element inside
```

* `lib/panel/dict/tg.js` and `en.js` map every Persian text to its translation. A text without a translation shows in Persian
  (never empty). Placeholders must be identical in the translation.
* `tr("متن")` marks a text that is translated **later**: lists defined at module level (`NAV`, status labels, option lists)
  and messages returned by server actions. The place that shows it calls `t(…)`. With values, `tr("این دسته {count} محصول دارد.",
  { count })` fills them in on the server; `t()` recognises such a finished message by its pattern and translates it.
* Names of products, categories and brands follow the panel language (`localName(item, lang)`: Persian → fa, en, tg, ru;
  Tajik → tg, en, fa, ru; English → en, tg, fa, ru).
* Dates and numbers follow the language (Persian digits only in Persian). Direction-sensitive Tailwind classes are logical
  (`ps-`, `me-`, `start-`, `border-e`, `text-start`) and arrows flip with `ltr:-scale-x-100`.
* The `dir`, `lang` and font of a panel come from `components/panel/PanelFrame.jsx`; page titles from `generateMetadata`.

## Adding or changing a text

1. Write it with `t("…")` / `tr("…")` in Persian.
2. `node scripts/i18n/extract.mjs --missing tg` (and `en`) lists what has no translation; add the entries to
   `lib/panel/dict/tg.js` and `en.js` with the same placeholders.
3. `npm test` (`tests/panel-i18n.test.mjs`) fails when: a text has no Tajik/English translation, a translation is unused or has
   different placeholders, Tajik/English contain Persian, a Persian text is written in the code outside `t()`/`tr()`, or a
   variable such as `t`/`lang` is undefined in the panel code (`next lint` does not check that). `tests/e2e/panel-i18n.e2e.mjs`
   opens every page of both panels in Tajik and English at 320 px and fails on any Persian text left on screen, wrong
   direction, or anything past the screen edge.

## What is deliberately NOT translated

* The **Excel template** and the words the import understands (`بله`, `خیر`, `فعال`, …): the template and its title check are
  Persian only (`lib/operator/xlsxTemplate.js`, `spreadsheetRows.js`); its column labels on screen are translated.
* Product, category and brand **content** (their names and descriptions are data in four languages, shown as above).
* Technical terms: SKU, slug, Supabase, migration file names, environment variable names.

## Known limits (be honest about them)

* The Tajik and English wording was written by the developer assistant, not by a native speaker. It should be read through by
  a Tajik speaker (and an English one) before the panel is handed to staff; corrections are one-line edits in the dictionaries.
* Server errors that carry a variable part (a name, a number) are translated by pattern: if a message is changed in the code
  without changing its `tr()` key, the translation silently falls back to Persian (the test catches missing keys, not
  re-worded messages).
* Not changed: the Persian-first filter row of the product list stacks in one column on wide screens in all three languages.

## Rollback

Delete the cookie or choose FA: the panel is exactly as before (Persian, right to left). The dictionaries and the language
module can be removed together with the `PanelFrame` wrapper; nothing in the database or the environment is involved.
