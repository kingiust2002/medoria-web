// components/layout/Header.jsx
"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Brand from "./Brand";
import LanguageSwitcher from "./LanguageSwitcher";
import MobilePrefs from "./MobilePrefs";
import HealthCollectionMegaMenu from "./HealthCollectionMegaMenu";
import { getTranslations } from "@/lib/i18n";
import { bulkInquiryMessage, waLink } from "@/lib/whatsapp";
import Icon from "@/components/shared/Icon";
import ThemeToggle from "@/components/shared/ThemeToggle";
import SearchCommand from "@/components/shared/SearchCommand";
import { useWishlist } from "@/lib/wishlist";

const COLLECTION_COPY = {
  tg: { all: "Дидани ҳама", browseAll: "Дидани тамоми коллексия" },
  ru: { all: "Смотреть все", browseAll: "Вся коллекция" },
  en: { all: "View all", browseAll: "Browse the full collection" },
  fa: { all: "دیدن همه", browseAll: "مشاهده کل کالکشن" },
};

const categoryName = (node) => node?.name || node?.slug || "";

export default function Header({ lang, categoryTree = [] }) {
  const t = getTranslations(lang);
  const pathname = usePathname();
  const { count: wishCount } = useWishlist();
  const [searchOpen, setSearchOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [mobileDepartment, setMobileDepartment] = useState(null);
  const [mobileGroup, setMobileGroup] = useState(null);
  const collectionCopy = COLLECTION_COPY[lang] || COLLECTION_COPY.en;
  const home = `/health/${lang}`;

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setSearchOpen(true); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const isActive = (href) =>
    href === home
      ? pathname === home || pathname === `${home}/`
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
    { href: home,                         label: t.common.home },
    { href: `${home}/categories`,         label: t.common.categories },
    { href: `${home}/about`,              label: t.common.about },
    { href: `${home}/contact`,            label: t.common.contact },
  ];
  const collectionActive = pathname === `${home}/catalog` || pathname.startsWith(`${home}/catalog/`);
  const catalogHref = (slug) => `${home}/catalog?category=${encodeURIComponent(slug)}`;
  const closeMobile = () => {
    setOpen(false);
    setMobileDepartment(null);
    setMobileGroup(null);
  };

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
        <div className={`absolute inset-x-0 top-0 h-[2px] bg-brand-gradient transition-opacity ${scrolled ? "opacity-100" : "opacity-0"}`} />
        <div className="container-x flex h-[4.5rem] items-center justify-between gap-2">
          <Link href={home} className="shrink-0 min-w-0" aria-label="Medoria home">
            <Brand height={30} />
          </Link>

          {/* Desktop navigation. Collection is the same progressive tree pattern
              used by Beauty World: hover/focus, select any level, no page hop. */}
          <nav className="hidden lg:flex items-center gap-1">
            <NavLink item={nav[0]} active={isActive(nav[0].href)} />

            <HealthCollectionMegaMenu
              tree={categoryTree}
              lang={lang}
              home={home}
              label={t.common.catalog}
              active={collectionActive}
              allLabel={collectionCopy.all}
              browseAllLabel={collectionCopy.browseAll}
            />

            {nav.slice(1).map((item) => (
              <NavLink key={item.href} item={item} active={isActive(item.href)} />
            ))}
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            <button onClick={() => setSearchOpen(true)} aria-label="Search" className="grid place-items-center w-9 h-9 rounded-lg text-ink-muted hover:text-brand-violet hover:bg-brand-violet/10 transition-colors">
              <Icon name="search" size={18} />
            </button>
            <Link href={`${home}/wishlist`} aria-label="Wishlist" className="relative hidden md:grid place-items-center w-9 h-9 rounded-lg text-ink-muted hover:text-accent-gold hover:bg-accent-gold/10 transition-colors">
              <Icon name="star" size={18} />
              {wishCount > 0 && (
                <span className="absolute -top-0.5 -end-0.5 min-w-[16px] h-4 px-1 rounded-full bg-accent-gold text-white text-[10px] font-bold grid place-items-center tabular">{wishCount}</span>
              )}
            </Link>
            <div className="hidden md:block"><ThemeToggle lang={lang} /></div>
            <div className="md:hidden"><MobilePrefs lang={lang} /></div>
            <div className="hidden md:block"><LanguageSwitcher lang={lang} /></div>

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
              aria-expanded={open}
            >
              <Icon name={open ? "close" : "list"} size={22} strokeWidth={2} />
            </button>
          </div>
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 top-[4.5rem] z-50 lg:hidden bg-canvas overflow-y-auto">
          <div className="container-x py-6">
            <nav className="flex flex-col">
              <MobileNavLink item={nav[0]} active={isActive(nav[0].href)} onClick={closeMobile} />

              {/* Collection tree: departments, groups and detailed categories are
                  expanded in place, matching Beauty World's mobile browse. */}
              <div className="border-b border-line">
                <Link
                  href={`${home}/catalog`}
                  onClick={closeMobile}
                  className={[
                    "py-3.5 text-base font-semibold flex items-center justify-between",
                    collectionActive ? "text-brand-violet" : "text-ink",
                  ].join(" ")}
                >
                  {t.common.catalog}
                  <span className="text-[11px] font-medium text-brand-violet">{collectionCopy.browseAll}</span>
                </Link>

                {categoryTree.length > 0 && (
                  <ul className="pb-2">
                    {categoryTree.map((department) => {
                      const departmentOpen = mobileDepartment === department.id;
                      const groups = department.children || [];
                      return (
                        <li key={department.id || department.slug} className="border-t border-line/60">
                          <div className="flex items-center">
                            <Link href={catalogHref(department.slug)} onClick={closeMobile} className="flex-1 py-2.5 ps-3 text-[14px] font-medium text-ink-soft">
                              {categoryName(department)}
                            </Link>
                            {groups.length > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  setMobileDepartment(departmentOpen ? null : department.id);
                                  setMobileGroup(null);
                                }}
                                aria-expanded={departmentOpen}
                                className="p-2 text-ink-muted"
                                aria-label={`Expand ${categoryName(department)}`}
                              >
                                <Icon name="chevronDown" size={18} className={`transition-transform ${departmentOpen ? "rotate-180" : ""}`} />
                              </button>
                            )}
                          </div>

                          {departmentOpen && groups.length > 0 && (
                            <ul className="ps-4 pb-2">
                              {groups.map((group) => {
                                const groupOpen = mobileGroup === group.id;
                                const leaves = group.children || [];
                                return (
                                  <li key={group.id || group.slug} className="border-t border-line/40 first:border-t-0">
                                    <div className="flex items-center">
                                      <Link href={catalogHref(group.slug)} onClick={closeMobile} className="flex-1 py-2.5 ps-3 text-[13px] text-ink-muted hover:text-ink">
                                        {categoryName(group)}
                                      </Link>
                                      {leaves.length > 0 && (
                                        <button
                                          type="button"
                                          onClick={() => setMobileGroup(groupOpen ? null : group.id)}
                                          aria-expanded={groupOpen}
                                          className="p-2 text-ink-faint"
                                          aria-label={`Expand ${categoryName(group)}`}
                                        >
                                          <Icon name="chevronDown" size={16} className={`transition-transform ${groupOpen ? "rotate-180" : ""}`} />
                                        </button>
                                      )}
                                    </div>

                                    {groupOpen && leaves.length > 0 && (
                                      <ul className="ps-5 pb-2">
                                        {leaves.map((leaf) => (
                                          <li key={leaf.id || leaf.slug}>
                                            <Link href={catalogHref(leaf.slug)} onClick={closeMobile} className="block py-2 text-[12.5px] text-ink-faint hover:text-brand-violet">
                                              {categoryName(leaf)}
                                            </Link>
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              {nav.slice(1).map((item) => (
                <MobileNavLink key={item.href} item={item} active={isActive(item.href)} onClick={closeMobile} />
              ))}

              <Link
                href={`${home}/wishlist`}
                onClick={closeMobile}
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
              onClick={closeMobile}
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

function NavLink({ item, active }) {
  return (
    <Link
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
}

function MobileNavLink({ item, active, onClick }) {
  return (
    <Link
      href={item.href}
      onClick={onClick}
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
}
