// lib/operator/translationMeta.js — which texts of a product were written by the automatic translator and not yet read by a person.
// Stored as `translation_meta` (migration 40): { "name_tg": "auto", … }; a text that is not listed is human (typed, or edited after the
// translation, or there from before this feature). Automatic translation never overwrites a human text; it may refresh an "auto" one.
// Plain module (usable in the browser): unit-tested.
export const META_FIELDS = ["name_fa", "name_en", "name_ru", "name_tg", "description_fa", "description_en", "description_ru", "description_tg"];
const isField = (k) => META_FIELDS.includes(k);

// anything → a clean { field: "auto" } with sorted keys (so equal meta compares equal)
export function cleanTranslationMeta(input) {
  const out = {};
  if (input && typeof input === "object" && !Array.isArray(input)) {
    for (const k of Object.keys(input).sort()) if (isField(k) && input[k] === "auto") out[k] = "auto";
  }
  return out;
}
export const sameTranslationMeta = (a, b) => JSON.stringify(cleanTranslationMeta(a)) === JSON.stringify(cleanTranslationMeta(b));

// What the translator may write into the form.
//   current:      { name_tg: "...", description_tg: "..." }  the texts in the form now
//   translations: { tg: { name, description }, ru: {...}, ... } what the translator returned (the source language is not in it)
//   auto:         Set of fields that are currently automatic
// → { fill: { field: text }, kept: [field], autoNext: Set }   `kept` = human texts that were NOT overwritten
export function planTranslationFill(current, translations, auto) {
  const fill = {}, kept = [];
  const nextAuto = new Set(auto);
  for (const [lang, vals] of Object.entries(translations || {})) {
    for (const [kind, text] of [["name", vals?.name], ["description", vals?.description]]) {
      const key = `${kind}_${lang}`;
      if (!isField(key) || !text) continue;
      const now = String(current?.[key] ?? "").trim();
      if (now && !auto.has(key)) { if (now !== String(text).trim()) kept.push(key); continue; }      // a person's text stays
      fill[key] = text;
      nextAuto.add(key);
    }
  }
  return { fill, kept, autoNext: nextAuto };
}
