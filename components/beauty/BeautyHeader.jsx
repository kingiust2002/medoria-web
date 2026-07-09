"use client";
// components/beauty/BeautyHeader.jsx — mirrors the Health header skeleton:
// sticky 4.5rem glass bar with a gradient hairline, official brand lockup,
// desktop nav, inline language switcher, WhatsApp CTA and a mobile menu.
import { useState, useEffect } from "react";
import Link from "next/link";
import { BeautyWordLockup } from "./BeautyBrand";
import LanguageSwitcher from "@/components/layout/LanguageSwitcher";
import Icon from "@/components/shared/Icon";
import { waLink, bulkInquiryMessage } from "@/lib/whatsapp";
import { getBeautyTranslations } from "./i18n";

export default function BeautyHeader({ lang }) {
  const t = getBeautyTranslations(lang);
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 16);
    fn();
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const nav = [
    { href: "#collections", label: t.nav.collections },
    { href: "#worlds", label: t.nav.worlds },
    { href: "#partnership", label: t.nav.partnership },
    { href: "#contact", label: t.nav.contact },
  ];

  return (
    <>
      <header
        className={[
          "sticky top-0 z-[60] transition-all backdrop-blur-xl",
          scrolled ? "bg-canvas/80 border-b border-line/80 shadow-soft" : "bg-canvas/60 border-b border-transparent",
        ].join(" ")}
      >
        <div className={`absolute inset-x-0 top-0 h-[2px] transition-opacity ${scrolled ? "opacity-100" : "opacity-0"}`}
          style={{ background: "linear-gradient(90deg,var(--v-navy),var(--v-copper),var(--v-brand-to))" }} />
        <div className="container-x flex h-[4.5rem] items-center justify-between gap-2">
          <Link href={`/beauty/${lang}`} className="shrink-0 min-w-0" aria-label="Medoria Beauty">
            <BeautyWordLockup height={20} />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-1">
            {nav.map((item) => (
              <a key={item.href} href={item.href}
                className="group relative px-4 py-2.5 text-[14px] font-medium rounded-lg transition-colors text-ink-muted hover:text-[color:var(--v-accent)]">
                {item.label}
                <span className="pointer-events-none absolute inset-x-3 bottom-1 h-[2px] rounded-full origin-center transition-transform duration-300 scale-x-0 group-hover:scale-x-100"
                  style={{ background: "linear-gradient(90deg,var(--v-navy),var(--v-copper))" }} />
              </a>
            ))}
            <Link href={`/health/${lang}`}
              className="px-4 py-2.5 text-[14px] font-medium rounded-lg transition-colors text-ink-muted hover:text-[color:var(--v-accent)]">
              {t.nav.health}
            </Link>
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="hidden md:block"><LanguageSwitcher lang={lang} /></div>
            <div className="md:hidden"><LanguageSwitcher lang={lang} variant="dropdown" /></div>
            <a href={waLink(bulkInquiryMessage(lang))} target="_blank" rel="noopener noreferrer" className="hidden md:inline-flex btn-primary size-sm">
              <Icon name="chat" size={14} />
              {t.nav.contact}
            </a>
            <button onClick={() => setOpen(!open)} className="lg:hidden -me-1 p-2 text-ink" aria-label="Menu" aria-expanded={open}>
              <Icon name={open ? "close" : "list"} size={22} strokeWidth={2} />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile menu */}
      {open && (
        <div className="fixed inset-0 top-[4.5rem] z-50 lg:hidden bg-canvas overflow-y-auto">
          <div className="container-x py-6">
            <nav className="flex flex-col">
              {nav.map((item) => (
                <a key={item.href} href={item.href} onClick={() => setOpen(false)}
                  className="py-3.5 text-base font-semibold border-b border-line flex items-center justify-between text-ink">
                  {item.label}
                </a>
              ))}
              <Link href={`/health/${lang}`} onClick={() => setOpen(false)}
                className="py-3.5 text-base font-semibold border-b border-line flex items-center justify-between text-ink">
                {t.nav.health}
              </Link>
            </nav>
            <a href={waLink(bulkInquiryMessage(lang))} target="_blank" rel="noopener noreferrer"
              className="btn-primary size-lg w-full mt-6" onClick={() => setOpen(false)}>
              <Icon name="chat" size={16} />
              {t.nav.contact}
            </a>
          </div>
        </div>
      )}
    </>
  );
}
