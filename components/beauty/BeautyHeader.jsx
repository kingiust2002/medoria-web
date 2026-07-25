"use client";
// components/beauty/BeautyHeader.jsx — Health-parity top bar for Beauty:
// sticky 4.5rem glass bar with a copper gradient hairline, official Beauty
// lockup, real-route desktop nav (home / collection / worlds / about /
// contact), active-link underline, inline language switcher, WhatsApp CTA and
// a mobile drawer. The cross-vertical link lives at the page bottom (footer),
// not here — so the bar reads exactly like Health's own nav.
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BeautyWordLockup } from "./BeautyBrand";
import LanguageSwitcher from "@/components/layout/LanguageSwitcher";
import Icon from "@/components/shared/Icon";
import ThemeToggle from "@/components/shared/ThemeToggle";
import { waLink, bulkInquiryMessage } from "@/lib/whatsapp";
import { getBeautyTranslations } from "./i18n";
import BeautyMegaMenu from "./BeautyMegaMenu";

const MEGA = {
  tg: { all: "Дидани ҳама", viewAll: "Ҳамаи дунёҳо" },
  ru: { all: "Смотреть все", viewAll: "Все категории" },
  en: { all: "View all", viewAll: "Browse everything" },
  fa: { all: "دیدن همه", viewAll: "همه‌ی دنیاها" },
};
// Pre-resolved for the active locale by getBeautyNavTree (see the layout).
const megaName = (c) => c?.name || c?.slug || "";

export default function BeautyHeader({ lang, categoryTree = [] }) {
  const t = getBeautyTranslations(lang);
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [mobileDept, setMobileDept] = useState(null);
  const mega = MEGA[lang] || MEGA.tg;

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

  const home = `/beauty/${lang}`;
  // Collection + Worlds are merged into one "دنیاها/World" browse entry powered
  // by the category mega-menu.
  const nav = [
    { href: home, label: t.nav.home },
    { href: `${home}/brands`, label: t.nav.brands },
    { href: `${home}/about`, label: t.nav.about },
    { href: `${home}/contact`, label: t.nav.contact },
  ];

  const isActive = (href) =>
    href === home ? pathname === home || pathname === `${home}/` : pathname === href || pathname.startsWith(`${href}/`);
  const worldActive = pathname.startsWith(`${home}/worlds`) || pathname.startsWith(`${home}/catalog`);

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
          <Link href={home} className="shrink-0 min-w-0" aria-label="Medoria Beauty">
            {/* The official Beauty wordmark is navy-toned (no white variant), so
                on the dark header it sits on a light plate — like the footer. */}
            <span className="inline-flex items-center rounded-full dark:bg-white/95 dark:px-3 dark:py-1.5">
              <BeautyWordLockup height={30} />
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-1">
            {(() => { const item = nav[0]; const active = isActive(item.href); return (
              <Link href={item.href} aria-current={active ? "page" : undefined}
                className={["group relative px-4 py-2.5 text-[14px] font-medium rounded-lg transition-colors",
                  active ? "text-[color:var(--v-accent)]" : "text-ink-muted hover:text-[color:var(--v-accent)]"].join(" ")}>
                {item.label}
                <span className={["pointer-events-none absolute inset-x-3 bottom-1 h-[2px] rounded-full origin-center transition-transform duration-300",
                  active ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100"].join(" ")}
                  style={{ background: "linear-gradient(90deg,var(--v-navy),var(--v-copper))" }} />
              </Link>
            ); })()}

            <BeautyMegaMenu tree={categoryTree} lang={lang} home={home} label={t.nav.worlds}
              active={worldActive} allLabel={mega.all} viewAllLabel={mega.viewAll} />

            {nav.slice(1).map((item) => {
              const active = isActive(item.href);
              return (
                <Link key={item.href} href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={[
                    "group relative px-4 py-2.5 text-[14px] font-medium rounded-lg transition-colors",
                    active ? "text-[color:var(--v-accent)]" : "text-ink-muted hover:text-[color:var(--v-accent)]",
                  ].join(" ")}>
                  {item.label}
                  <span className={[
                    "pointer-events-none absolute inset-x-3 bottom-1 h-[2px] rounded-full origin-center transition-transform duration-300",
                    active ? "scale-x-100" : "scale-x-0 group-hover:scale-x-100",
                  ].join(" ")}
                    style={{ background: "linear-gradient(90deg,var(--v-navy),var(--v-copper))" }} />
                </Link>
              );
            })}
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="hidden md:block"><ThemeToggle lang={lang} /></div>
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
              {/* Home */}
              <Link href={nav[0].href} onClick={() => setOpen(false)}
                aria-current={isActive(nav[0].href) ? "page" : undefined}
                className={["py-3.5 text-base font-semibold border-b border-line flex items-center justify-between transition-colors",
                  isActive(nav[0].href) ? "text-[color:var(--v-accent)]" : "text-ink"].join(" ")}>
                {nav[0].label}
              </Link>

              {/* World — department accordion (merged Collection + Worlds) */}
              <div className="border-b border-line">
                <Link href={`${home}/worlds`} onClick={() => setOpen(false)}
                  className={["py-3.5 text-base font-semibold flex items-center justify-between",
                    worldActive ? "text-[color:var(--v-accent)]" : "text-ink"].join(" ")}>
                  {t.nav.worlds}
                </Link>
                {categoryTree.length > 0 && (
                  <ul className="pb-2">
                    {categoryTree.map((d) => {
                      const exp = mobileDept === d.id;
                      const kids = d.children || [];
                      return (
                        <li key={d.id} className="border-t border-line/60">
                          <div className="flex items-center">
                            <Link href={`${home}/catalog?cat=${encodeURIComponent(d.slug)}`} onClick={() => setOpen(false)}
                              className="flex-1 py-2.5 ps-3 text-[14px] text-ink-soft">{megaName(d)}</Link>
                            {kids.length > 0 && (
                              <button type="button" onClick={() => setMobileDept(exp ? null : d.id)} aria-expanded={exp}
                                className="p-2 text-ink-muted" aria-label="expand">
                                <Icon name="chevronDown" size={18} className={`transition-transform ${exp ? "rotate-180" : ""}`} />
                              </button>
                            )}
                          </div>
                          {exp && kids.length > 0 && (
                            <ul className="ps-5 pb-2">
                              {kids.map((g) => (
                                <li key={g.id}>
                                  <Link href={`${home}/catalog?cat=${encodeURIComponent(g.slug)}`} onClick={() => setOpen(false)}
                                    className="block py-2 text-[13px] text-ink-muted hover:text-ink">{megaName(g)}</Link>
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {/* Brands / About / Contact */}
              {nav.slice(1).map((item) => {
                const active = isActive(item.href);
                return (
                  <Link key={item.href} href={item.href} onClick={() => setOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={[
                      "py-3.5 text-base font-semibold border-b border-line flex items-center justify-between transition-colors",
                      active ? "text-[color:var(--v-accent)]" : "text-ink",
                    ].join(" ")}>
                    {item.label}
                    {active && <span className="w-2 h-2 rounded-full" style={{ background: "var(--v-copper)" }} />}
                  </Link>
                );
              })}
            </nav>
            <div className="mt-6"><ThemeToggle lang={lang} withLabel className="w-full justify-center" /></div>
            <a href={waLink(bulkInquiryMessage(lang))} target="_blank" rel="noopener noreferrer"
              className="btn-primary size-lg w-full mt-3" onClick={() => setOpen(false)}>
              <Icon name="chat" size={16} />
              {t.nav.contact}
            </a>
          </div>
        </div>
      )}
    </>
  );
}
