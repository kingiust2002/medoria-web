// components/layout/Header.jsx
"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Brand from "./Brand";
import LanguageSwitcher from "./LanguageSwitcher";
import MobilePrefs from "./MobilePrefs";
import { getTranslations } from "@/lib/i18n";
import { bulkInquiryMessage, waLink } from "@/lib/whatsapp";
import Icon from "@/components/shared/Icon";
import ThemeToggle from "@/components/shared/ThemeToggle";
import SearchCommand from "@/components/shared/SearchCommand";
import { useWishlist } from "@/lib/wishlist";

export default function Header({ lang }) {
  const t = getTranslations(lang);
  const pathname = usePathname();
  const { count: wishCount } = useWishlist();
  const [searchOpen, setSearchOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearchOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const isActive = (href) =>
    href === `/health/${lang}`
      ? pathname === `/health/${lang}` || pathname === `/health/${lang}/`
      : pathname === href || pathname.startsWith(`${href}/`);

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
    { href: `/health/${lang}`,            label: t.common.home },
    { href: `/health/${lang}/catalog`,    label: t.common.catalog },
    { href: `/health/${lang}/categories`, label: t.common.categories },
    { href: `/health/${lang}/about`,      label: t.common.about },
    { href: `/health/${lang}/contact`,    label: t.common.contact },
  ];

  return (
    <>
      <header
        className={[
          "sticky top-0 z-[60] transition-all backdrop-blur-xl",
          scrolled
            ? "bg-canvas/80 border-b border-line/80 shadow-soft"
            : "bg-canvas/60 border-b border-transparent",
        ].join(" ")}
      >
        {/* gradient hairline */}
        <div className={`absolute inset-x-0 top-0 h-[2px] bg-brand-gradient transition-opacity ${scrolled ? "opacity-100" : "opacity-0"}`} />
        <div className="container-x flex h-[4.5rem] items-center justify-between gap-2">
          <Link href={`/health/${lang}`} className="shrink-0 min-w-0" aria-label="Medoria home">
            <Brand height={30} />
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-1">
            {nav.map((item) => {
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={[
                    "group relative px-4 py-2.5 text-[14px] font-medium rounded-lg transition-colors",
                    active ? "text-brand-violet" : "text-ink-muted hover:text-brand-violet",
                  ].join(" ")}
                >
                  {item.label}
                  <span
                    className={[
                      "pointer-events-none absolute inset-x-3 bottom-1 h-[2px] rounded-full bg-brand-gradient origin-center transition-transform duration-300",
                      active ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100",
                    ].join(" ")}
                  />
                </Link>
              );
            })}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button onClick={() => setSearchOpen(true)} aria-label="Search" className="grid place-items-center w-9 h-9 rounded-lg text-ink-muted hover:text-brand-violet hover:bg-brand-violet/10 transition-colors">
              <Icon name="search" size={18} />
            </button>
            {/* Wishlist/star — tablet/desktop only; on mobile it lives in the drawer */}
            <Link href={`/health/${lang}/wishlist`} aria-label="Wishlist" className="relative hidden md:grid place-items-center w-9 h-9 rounded-lg text-ink-muted hover:text-accent-gold hover:bg-accent-gold/10 transition-colors">
              <Icon name="star" size={18} />
              {wishCount > 0 && (
                <span className="absolute -top-0.5 -end-0.5 min-w-[16px] h-4 px-1 rounded-full bg-accent-gold text-white text-[10px] font-bold grid place-items-center tabular">{wishCount}</span>
              )}
            </Link>
            {/* Standalone theme toggle — tablet/desktop only (mobile uses MobilePrefs) */}
            <div className="hidden md:block">
              <ThemeToggle lang={lang} />
            </div>
            {/* Combined language + theme control — mobile only */}
            <div className="md:hidden">
              <MobilePrefs lang={lang} />
            </div>
            {/* Inline language row — tablet/desktop */}
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
              className="lg:hidden -me-1 p-2 text-ink"
              aria-label="Menu"
            >
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
              {nav.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={[
                      "py-3.5 text-base font-semibold border-b border-line flex items-center justify-between transition-colors",
                      active ? "text-brand-violet" : "text-ink",
                    ].join(" ")}
                  >
                    {item.label}
                    {active && <span className="w-2 h-2 rounded-full bg-brand-gradient" />}
                  </Link>
                );
              })}

              {/* Wishlist/favorites — moved here from the mobile top header */}
              <Link
                href={`/health/${lang}/wishlist`}
                onClick={() => setOpen(false)}
                className="py-3.5 text-base font-semibold border-b border-line flex items-center justify-between text-ink transition-colors"
              >
                <span className="flex items-center gap-3">
                  <Icon name="star" size={20} className="text-accent-gold" />
                  {{ fa: "علاقه‌مندی‌ها", ru: "Избранное", tg: "Дӯстдошта", en: "Favorites" }[lang] || "Favorites"}
                </span>
                {wishCount > 0 && (
                  <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-accent-gold text-white text-[11px] font-bold grid place-items-center tabular">{wishCount}</span>
                )}
              </Link>
            </nav>

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

      <SearchCommand lang={lang} open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
