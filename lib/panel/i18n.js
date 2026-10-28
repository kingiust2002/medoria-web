// lib/panel/i18n.js — the operator panels' interface languages (Persian, Tajik, English). Plain module: used by the
// server (lib/panel/server.js), the browser (components/panel/PanelI18n.jsx) and the tests.
//
// How it works: the KEY of a message is its Persian source text, so Persian (the default) needs no dictionary and the
// code stays readable. `t("متن", { n })` looks the text up in the active language's dictionary (lib/panel/dict/*.js),
// falls back to the Persian original when it is missing (never to an empty string), and fills `{name}` placeholders.
// `tr("متن")` marks a text that is translated LATER (module-level lists, messages returned by server actions): it returns
// the Persian text unchanged, and the place that shows it calls t(). scripts/i18n/extract.mjs lists every t()/tr() key and
// tests/panel-i18n.test.mjs fails when a dictionary misses one.

export const PANEL_LANGS = ["fa", "tg", "en"];
export const DEFAULT_PANEL_LANG = "fa";
export const PANEL_LANG_COOKIE = "medoria_panel_lang";

export const PANEL_LANG_META = {
  fa: { label: "فارسی", short: "FA", dir: "rtl", locale: "fa-IR", htmlLang: "fa" },
  tg: { label: "Тоҷикӣ", short: "TG", dir: "ltr", locale: "tg-TJ", htmlLang: "tg" },
  en: { label: "English", short: "EN", dir: "ltr", locale: "en-GB", htmlLang: "en" },
};

export const isPanelLang = (v) => typeof v === "string" && PANEL_LANGS.includes(v);
export const normalizePanelLang = (v) => (isPanelLang(v) ? v : DEFAULT_PANEL_LANG);

function fill(text, vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k) => (k in vars && vars[k] != null ? String(vars[k]) : m));
}

// Marks a source text for later translation. With values it fills the {placeholders} and returns the Persian text:
// that is how the server builds messages that contain a number or a name (tr("این دسته {count} محصول دارد.", { count })).
// The place that shows such a message calls t(message): t() recognises the filled-in text by its pattern (below).
export const tr = (s, vars) => fill(s, vars);

// A message built on the server arrives as finished Persian text ("این دسته 5 محصول دارد."), not as the key. For every
// dictionary entry whose key has {placeholders} we keep a pattern, so t() can still find the translation and put the
// captured values into it. Exact keys always win; patterns are tried longest literal text first.
const PATTERNS = new WeakMap();
function patternsFor(dict) {
  let list = PATTERNS.get(dict);
  if (list) return list;
  list = [];
  for (const key of Object.keys(dict)) {
    if (!/\{\w+\}/.test(key)) continue;
    const names = [];
    let literal = 0;
    const src = key.split(/(\{\w+\})/).map((part) => {
      const m = /^\{(\w+)\}$/.exec(part);
      if (m) { names.push(m[1]); return "([\\s\\S]+?)"; }
      literal += part.length;
      return part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }).join("");
    if (literal < 4) continue;                       // "{n} مورد"-like keys are too loose to guess from
    list.push({ re: new RegExp(`^${src}$`), names, text: dict[key], literal });
  }
  list.sort((a, b) => b.literal - a.literal);
  PATTERNS.set(dict, list);
  return list;
}

// translate("tg", dictTg, "متن {n}", { n: 3 }). `dict` maps Persian source -> text in that language.
export function translate(lang, dict, key, vars) {
  if (typeof key !== "string") return key;
  if (lang === DEFAULT_PANEL_LANG || !dict) return fill(key, vars);
  if (Object.prototype.hasOwnProperty.call(dict, key)) {
    const hit = dict[key];
    return fill(typeof hit === "string" && hit ? hit : key, vars);
  }
  if (!vars) {
    for (const p of patternsFor(dict)) {
      const m = p.re.exec(key);
      if (m && typeof p.text === "string" && p.text) return fill(p.text, Object.fromEntries(p.names.map((n, i) => [n, m[i + 1]])));
    }
  }
  return fill(key, vars);
}

export function makeT(lang, dict) {
  const l = normalizePanelLang(lang);
  return (key, vars) => translate(l, dict, key, vars);
}

// A catalog item (product, category, brand) has a name per site language: show the one that matches the panel language,
// else the closest one. fa -> fa, en, tg, ru; tg -> tg, en, fa, ru; en -> en, tg, fa, ru.
const NAME_ORDER = { fa: ["fa", "en", "tg", "ru"], tg: ["tg", "en", "fa", "ru"], en: ["en", "tg", "fa", "ru"] };
export function localName(item, lang, fallback = "") {
  for (const l of NAME_ORDER[normalizePanelLang(lang)]) {
    const v = item?.[`name_${l}`];
    if (typeof v === "string" && v.trim()) return v;
  }
  return fallback || item?.slug || "";
}

// Dates and numbers follow the language: Persian digits and calendar only for Persian.
export function formatDate(lang, value, opts = { dateStyle: "medium", timeStyle: "short" }) {
  try { return new Date(value).toLocaleString(PANEL_LANG_META[normalizePanelLang(lang)].locale, opts); } catch { return "—"; }
}
export function formatNumber(lang, n) {
  try { return Number(n).toLocaleString(PANEL_LANG_META[normalizePanelLang(lang)].locale); } catch { return String(n); }
}
