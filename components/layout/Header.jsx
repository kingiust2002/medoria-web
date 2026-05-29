// components/layout/Header.jsx
"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import Logo from "./Logo";
import LanguageSwitcher from "./LanguageSwitcher";
import { getTranslations } from "@/lib/i18n";
import { bulkInquiryMessage, waLink } from "@/lib/whatsapp";
import Icon from "@/components/shared/Icon";

export default function Header({ lang }) {
  const t = getTranslations(lang);
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 16);
    fn();
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const nav = [
    { href: `/${lang}`,            label: t.common.home },
    { href: `/${lang}/catalog`,    label: t.common.catalog },
    { href: `/${lang}/categories`, label: t.common.categories },
    { href: `/${lang}/about`,      label: t.common.about },
    { href: `/${lang}/contact`,    label: t.common.contact },
  ];

  return (
    <>
      <header
        className={[
          "sticky top-0 z-[60] transition-all backdrop-blur-xl",
          scrolled
            ? "bg-white/95 border-b border-line shadow-soft"
            : "bg-white/90 border-b border-transparent",
        ].join(" ")}
      >
        <div className="container-x flex h-16 items-center justify-between">
          <Link href={`/${lang}`} className="shrink-0">
            <Logo size={36} variant="icon" showText />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-1">
            {nav.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="px-3.5 py-2 text-[13px] font-medium text-ink-muted rounded-lg hover:text-primary hover:bg-tint-blue transition-colors"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-3">
            <div className="hidden md:block">
              <LanguageSwitcher lang={lang} />
            </div>

            <a
              href={waLink(bulkInquiryMessage(lang))}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden md:inline-flex btn-primary size-sm"
            >
              <Icon name="chat" size={14} />
              {t.common.contactUs}
            </a>

            <button
              onClick={() => setOpen(!open)}
              className="lg:hidden -mr-1 p-2 text-ink"
              aria-label="Menu"
            >
              <Icon name={open ? "close" : "list"} size={22} strokeWidth={2} />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile menu */}
      {open && (
        <div className="fixed inset-0 top-16 z-50 lg:hidden bg-white overflow-y-auto">
          <div className="container-x py-6">
            <nav className="flex flex-col">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="py-3.5 text-base font-semibold text-ink border-b border-line"
                >
                  {item.label}
                </Link>
              ))}
            </nav>

            <div className="mt-6">
              <LanguageSwitcher lang={lang} />
            </div>

            <a
              href={waLink(bulkInquiryMessage(lang))}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary size-lg w-full mt-6"
              onClick={() => setOpen(false)}
            >
              <Icon name="chat" size={16} />
              {t.common.contactUs}
            </a>
          </div>
        </div>
      )}
    </>
  );
}
