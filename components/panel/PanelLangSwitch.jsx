"use client";
// components/panel/PanelLangSwitch.jsx — the language switch (FA / TG / EN) of the panels and their login pages.
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { PANEL_LANGS, PANEL_LANG_META } from "@/lib/panel/i18n";
import { setPanelLang } from "@/lib/panel/actions";
import { usePanelLang } from "@/components/panel/PanelI18n";

export default function PanelLangSwitch({ className = "" }) {
  const { lang } = usePanelLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  function pick(next) {
    if (next === lang || pending) return;
    start(async () => { await setPanelLang(next); router.refresh(); });
  }
  return (
    <div role="group" aria-label="Language" dir="ltr" className={`inline-flex items-center rounded-xl border border-line bg-surface p-0.5 ${className}`}>
      {PANEL_LANGS.map((l) => (
        <button key={l} type="button" onClick={() => pick(l)} aria-pressed={l === lang} lang={PANEL_LANG_META[l].htmlLang} title={PANEL_LANG_META[l].label} disabled={pending}
          className={`h-8 min-w-9 px-2 rounded-lg text-[12px] font-bold tracking-wide transition-colors disabled:opacity-60 ${l === lang ? "bg-brand-violet/15 text-brand-violet" : "text-ink-muted hover:bg-line-soft hover:text-ink"}`}>
          {PANEL_LANG_META[l].short}
        </button>
      ))}
    </div>
  );
}
