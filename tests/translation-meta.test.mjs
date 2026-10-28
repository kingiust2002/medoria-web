// Automatic translation must never overwrite a human-written text, and the "automatic, not yet read" status is stored and cleaned.
import test from "node:test";
import assert from "node:assert/strict";
import { cleanTranslationMeta, sameTranslationMeta, planTranslationFill, META_FIELDS } from "../lib/operator/translationMeta.js";

test("the stored meta keeps only known fields marked 'auto', sorted; anything else is dropped", () => {
  assert.deepEqual(cleanTranslationMeta({ name_tg: "auto", description_ru: "auto", name_en: "human", evil: "auto", name_fa: 1 }), { description_ru: "auto", name_tg: "auto" });
  assert.deepEqual(cleanTranslationMeta(null), {}); assert.deepEqual(cleanTranslationMeta([1]), {}); assert.deepEqual(cleanTranslationMeta("x"), {});
  assert.equal(sameTranslationMeta({ name_tg: "auto", name_ru: "auto" }, { name_ru: "auto", name_tg: "auto", junk: 1 }), true);
  assert.equal(sameTranslationMeta({ name_tg: "auto" }, {}), false);
  assert.equal(META_FIELDS.length, 8);
});

const tr = { tg: { name: "T-name", description: "T-desc" }, ru: { name: "R-name", description: "" }, en: { name: "E-name" } };

test("empty fields are filled and marked automatic", () => {
  const r = planTranslationFill({ name_tg: "", description_tg: "  ", name_ru: "" }, tr, new Set());
  assert.deepEqual(r.fill, { name_tg: "T-name", description_tg: "T-desc", name_ru: "R-name", name_en: "E-name" });
  assert.deepEqual([...r.autoNext].sort(), ["description_tg", "name_en", "name_ru", "name_tg"]);
  assert.deepEqual(r.kept, []);
});

test("a human-written text is never overwritten, and is reported as kept", () => {
  const r = planTranslationFill({ name_tg: "my own Tajik name", name_ru: "", description_tg: "" }, tr, new Set());
  assert.equal("name_tg" in r.fill, false);
  assert.deepEqual(r.kept, ["name_tg"]);
  assert.equal(r.fill.name_ru, "R-name");
  assert.equal(r.autoNext.has("name_tg"), false, "it stays human");
});

test("an automatic text may be refreshed; once edited it is human again (the form drops it from the set)", () => {
  const r = planTranslationFill({ name_tg: "old machine text" }, tr, new Set(["name_tg"]));
  assert.equal(r.fill.name_tg, "T-name");
  const afterEdit = planTranslationFill({ name_tg: "old machine text, fixed by Sara" }, tr, new Set());     // the edit removed it from the set
  assert.equal("name_tg" in afterEdit.fill, false);
});

test("the same text as the translation is not reported as kept; unknown languages and empty texts are ignored", () => {
  const same = planTranslationFill({ name_tg: "T-name" }, { tg: { name: "T-name" } }, new Set());
  assert.deepEqual(same.kept, []); assert.deepEqual(same.fill, {});
  const odd = planTranslationFill({}, { xx: { name: "x" }, tg: { name: "" } }, new Set());
  assert.deepEqual(odd.fill, {});
  assert.deepEqual(planTranslationFill({}, null, new Set()).fill, {});
});
