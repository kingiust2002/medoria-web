// components/layout/MobilePrefs.jsx
// Compact mobile-only control that combines the language switcher and the
// theme toggle into a single glass pill + dropdown, so the mobile header keeps
// only: logo · search · this control · menu (no horizontal overflow).
"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { LANG_META, SWITCHER_LOCALES, DEFAULT_LOCALE } from "@/lib/i18n";
import Icon from "@/components/shared/Icon";

export default function MobilePrefs({ lang }) {
  const pathname = usePathname() || "/";
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const ref = useRef(null);
  const { resolvedTheme, setTheme } = useTheme();
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const buildHref = (newLang) => {
    const parts = pathname.split("/");
    // Replace the locale segment whether it is a switcher locale or a hidden
    // one (e.g. fa reached by direct URL), otherwise inject it.
    if (LANG_META[parts[1]]) parts[1] = newLang;
    else parts.splice(1, 0, newLang);
    return parts.join("/") || `/${newLang}`;
  };
  const handleLang = (code) => { try { localStorage.setItem("lang", code); } catch {} setOpen(false); };

  const current = LANG_META[lang] || LANG_META[DEFAULT_LOCALE];
  // Current language first, then the rest. Persian (fa) is never an option;
  // if the page itself is fa, just show the selectable locales in order.
  const ordered = SWITCHER_LOCALES.includes(lang)
    ? [lang, ...SWITCHER_LOCALES.filter((c) => c !== lang)]
    : SWITCHER_LOCALES;

  const isDark = mounted && resolvedTheme === "dark";
  const themeLabel = isDark
    ? (lang === "fa" ? "حالت روشن" : lang === "ru" ? "Светлая тема" : lang === "tg" ? "Равшан" : "Light mode")
    : (lang === "fa" ? "حالت تیره" : lang === "ru" ? "Тёмная тема" : lang === "tg" ? "Торик" : "Dark mode");

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Language and theme"
        aria-haspopup="true"
        aria-expanded={open}
        className="inline-flex items-center gap-1 h-9 ps-2.5 pe-2 rounded-full border border-line bg-surface text-ink-muted hover:text-brand-violet hover:border-brand-violet/40 transition-colors"
      >
        <Icon name="globe" size={15} />
        <span className="text-[11px] font-bold uppercase tracking-wide">{current.label}</span>
        <Icon name="chevronDown" size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute end-0 mt-2 min-w-[11rem] rounded-xl border border-line bg-surface/95 backdrop-blur-xl shadow-hover p-1 z-[70] animate-fade-up">
          {ordered.map((code) => {
            const active = lang === code;
            return (
              <Link
                key={code}
                href={buildHref(code)}
                onClick={() => handleLang(code)}
                className={[
                  "flex items-center justify-between gap-3 px-3 py-2 rounded-lg text-[12px] font-semibold transition-colors",
                  active ? "bg-brand-violet/10 text-brand-violet" : "text-ink-muted hover:bg-brand-violet/5 hover:text-brand-violet",
                ].join(" ")}
              >
                <span>{LANG_META[code].name}</span>
                {active && <Icon name="check" size={14} />}
              </Link>
            );
          })}

          <div className="my-1 h-px bg-line" />

          <button
            type="button"
            onClick={() => setTheme(isDark ? "light" : "dark")}
            aria-label={themeLabel}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] font-semibold text-ink-muted hover:bg-brand-violet/5 hover:text-brand-violet transition-colors"
          >
            {mounted ? <Icon name={isDark ? "sun" : "moon"} size={15} /> : <span className="w-[15px] h-[15px]" />}
            <span>{mounted ? themeLabel : ""}</span>
          </button>
        </div>
      )}
    </div>
  );
}
