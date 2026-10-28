// lib/operator/previewView.js — what a visitor sees of a product in one language, from the form's current values (the preview in the
// product form). It follows the PUBLIC pages' own rule: the text of the visitor's language, else the English text (the public product
// page: `name_${lang} || name_en`, `description_${lang} || description_en`). Plain module: unit-tested.
export const PREVIEW_LANGS = ["tg", "ru", "en", "fa"];

const has = (v) => v != null && String(v).trim() !== "";

// → { name, nameFrom, description, descriptionFrom, dir } where `from` is the language the text really comes from ("" when there is none)
export function visitorView(values, lang) {
  const pick = (base) => {
    if (has(values?.[`${base}_${lang}`])) return { text: String(values[`${base}_${lang}`]).trim(), from: lang };
    if (has(values?.[`${base}_en`])) return { text: String(values[`${base}_en`]).trim(), from: "en" };
    return { text: "", from: "" };
  };
  const n = pick("name"), d = pick("description");
  return { name: n.text, nameFrom: n.from, description: d.text, descriptionFrom: d.from, dir: lang === "fa" ? "rtl" : "ltr" };
}

// "tg" → true when the text shown is not the visitor's own language
export const isFallback = (from, lang) => Boolean(from) && from !== lang;
