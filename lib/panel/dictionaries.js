// lib/panel/dictionaries.js — the dictionaries by language. Persian is the source text, so it has none.
import tg from "./dict/tg.js";
import en from "./dict/en.js";

export const DICTIONARIES = { tg, en };
export const dictionaryFor = (lang) => DICTIONARIES[lang] || null;
