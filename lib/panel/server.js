// lib/panel/server.js — SERVER ONLY. The panel language of this request (a cookie) and a t() bound to it.
import "server-only";
import { cookies } from "next/headers";
import { PANEL_LANG_COOKIE, PANEL_LANG_META, normalizePanelLang, makeT } from "@/lib/panel/i18n";
import { dictionaryFor } from "@/lib/panel/dictionaries";

export async function getPanelLang() {
  try {
    return normalizePanelLang((await cookies()).get(PANEL_LANG_COOKIE)?.value);
  } catch {
    return "fa";   // outside a request
  }
}

// const { t, lang, dir } = await getPanel();
export async function getPanel() {
  const lang = await getPanelLang();
  return { lang, dir: PANEL_LANG_META[lang].dir, meta: PANEL_LANG_META[lang], t: makeT(lang, dictionaryFor(lang)) };
}
export async function getT() {
  return (await getPanel()).t;
}
