// components/panel/PanelFrame.jsx — server component: the outer wrapper of a panel area (direction, language, font from the
// language cookie) with the i18n provider for everything inside.
import { getPanel } from "@/lib/panel/server";
import { dictionaryFor } from "@/lib/panel/dictionaries";
import { PanelI18nProvider } from "@/components/panel/PanelI18n";

export default async function PanelFrame({ children, className = "", dataVertical }) {
  const { lang, meta } = await getPanel();
  return (
    <div dir={meta.dir} lang={meta.htmlLang} data-panel-lang={lang} {...(dataVertical ? { "data-vertical": dataVertical } : {})}
      className={`${lang === "fa" ? "font-farsi" : "font-sans"} min-h-screen bg-canvas text-ink ${className}`}>
      <PanelI18nProvider lang={lang} dict={dictionaryFor(lang)}>{children}</PanelI18nProvider>
    </div>
  );
}
