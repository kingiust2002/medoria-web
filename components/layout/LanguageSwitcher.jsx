// components/layout/LanguageSwitcher.jsx
"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LANG_META, SWITCHER_LOCALES, DEFAULT_LOCALE } from "@/lib/i18n";
import Icon from "@/components/shared/Icon";

export default function LanguageSwitcher({ lang, white = false, variant = "inline" }) {
  const pathname = usePathname() || "/";
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const buildHref = (newLang) => {
    const parts = pathname.split("/");
    // Replace the locale segment whether it is a switcher locale or a hidden
    // one (e.g. fa reached by direct URL), otherwise inject it.
    if (LANG_META[parts[1]]) parts[1] = newLang;
    else parts.splice(1, 0, newLang);
    return parts.join("/") || `/${newLang}`;
  };

  const handleClick = (code) => {
    try { localStorage.setItem("lang", code); } catch {}
  };

  useEffect(() => {
    if (variant !== "dropdown") return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [variant]);

  // ── Compact pill + dropdown (mobile header) ───────────────────────────
  if (variant === "dropdown") {
    const current = LANG_META[lang] || LANG_META[DEFAULT_LOCALE];
    return (
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Language"
          aria-haspopup="true"
          aria-expanded={open}
          className="inline-flex items-center gap-1 h-9 ps-2.5 pe-2 rounded-full border border-line bg-surface text-ink-muted hover:text-brand-violet hover:border-brand-violet/40 transition-colors"
        >
          <Icon name="globe" size={15} />
          <span className="text-[11px] font-bold uppercase tracking-wide">{current.label}</span>
          <Icon name="chevronDown" size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </button>

        {open && (
          <div className="absolute end-0 mt-2 min-w-[9rem] rounded-xl border border-line bg-surface/95 backdrop-blur-xl shadow-hover p-1 z-[70] animate-fade-up">
            {SWITCHER_LOCALES.map((code) => {
              const active = lang === code;
              return (
                <Link
                  key={code}
                  href={buildHref(code)}
                  onClick={() => { handleClick(code); setOpen(false); }}
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
          </div>
        )}
      </div>
    );
  }

  // ── Inline pill row (desktop header / footer) ─────────────────────────
  return (
    <div className="flex items-center gap-1">
      {SWITCHER_LOCALES.map((code) => {
        const active = lang === code;
        return (
          <Link
            key={code}
            href={buildHref(code)}
            onClick={() => handleClick(code)}
            className={[
              "px-2.5 py-1 rounded-md text-[11px] font-bold transition-colors",
              active
                ? white
                  ? "bg-white/15 text-white border border-white/25"
                  : "bg-primary/10 text-primary border border-primary/20"
                : white
                  ? "text-white/45 hover:text-white border border-transparent"
                  : "text-ink-faint hover:text-primary border border-transparent",
            ].join(" ")}
          >
            {LANG_META[code].label}
          </Link>
        );
      })}
    </div>
  );
}
