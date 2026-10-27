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

// Marks a source text for later translation; does nothing at run time.
export const tr = (s) => s;

function fill(text, vars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k) => (k in vars && vars[k] != null ? String(vars[k]) : m));
}

// translate("tg", dictTg, "متن {n}", { n: 3 }). `dict` maps Persian source -> text in that language.
export function translate(lang, dict, key, vars) {
  if (typeof key !== "string") return key;
  const hit = lang !== DEFAULT_PANEL_LANG && dict && Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : key;
  return fill(typeof hit === "string" && hit ? hit : key, vars);
}

export function makeT(lang, dict) {
  const l = normalizePanelLang(lang);
  return (key, vars) => translate(l, dict, key, vars);
}

// Dates and numbers follow the language: Persian digits and calendar only for Persian.
export function formatDate(lang, value, opts = { dateStyle: "medium", timeStyle: "short" }) {
  try { return new Date(value).toLocaleString(PANEL_LANG_META[normalizePanelLang(lang)].locale, opts); } catch { return "—"; }
}
export function formatNumber(lang, n) {
  try { return Number(n).toLocaleString(PANEL_LANG_META[normalizePanelLang(lang)].locale); } catch { return String(n); }
}
