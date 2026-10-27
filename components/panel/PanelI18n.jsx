"use client";
// components/panel/PanelI18n.jsx — gives the client components of a panel the language, direction and t().
import { createContext, useContext, useMemo } from "react";
import { PANEL_LANG_META, makeT, formatDate, formatNumber } from "@/lib/panel/i18n";

const Ctx = createContext({ lang: "fa", dict: null });

export function PanelI18nProvider({ lang, dict, children }) {
  const value = useMemo(() => ({ lang, dict }), [lang, dict]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

// const t = useT();  t("متن"), t("{n} مورد", { n: 3 })
export function useT() {
  const { lang, dict } = useContext(Ctx);
  return useMemo(() => makeT(lang, dict), [lang, dict]);
}

// const { lang, dir, date, num } = usePanelLang();
export function usePanelLang() {
  const { lang } = useContext(Ctx);
  return useMemo(() => ({ lang, dir: PANEL_LANG_META[lang].dir, date: (v, o) => formatDate(lang, v, o), num: (n) => formatNumber(lang, n) }), [lang]);
}
