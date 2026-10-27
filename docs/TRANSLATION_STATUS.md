# Translation status of product texts (stage S5f, migration 40)

**The problem it fixes**: the "translate" button used to overwrite the other languages' name and description with machine text, silently,
even where a person had written (or corrected) them.

**Now**
* A text that is **empty** is filled by the translator and marked *automatic, not reviewed* (a note under the field).
* A text that is **automatic** may be refreshed by translating again.
* A text a person wrote or **edited** is *human*: it is **never overwritten**. After translating, the form says how many texts were
  translated and how many human texts were left untouched.
* Editing an automatic text removes the mark. Saving stores the remaining marks as `translation_meta` (`{"name_tg":"auto"}`), per
  product, in both houses. A text that is not listed is human — including everything that existed before this feature.
* The change of marks is part of the product's history and the approval diff ("وضعیت ترجمه"); it needs no right beyond editing the content.
* Written only when it changes: a product without marks saves exactly as before, also on a database that has not applied migration 40
  (then the marks are not remembered between visits, but the "never overwrite a human text" rule still holds inside one form session).

**Not covered**: CSV/Excel import does not read or set the marks; Persian/English fields with their own hints show the mark only for the
Russian/Tajik fields and the descriptions; no list filter "only automatic translations" yet.

Tests: `tests/translation-meta.test.mjs`, `tests/translation-meta-migration.test.mjs` (PostgreSQL 16), `tests/e2e/translation-status.e2e.mjs`.
