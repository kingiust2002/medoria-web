// app/[lang]/catalog/CatalogInner.jsx — interactive catalog (client).
"use client";
import { useState, useEffect, useMemo } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { Drawer } from "vaul";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { getProducts, getCategories } from "@/lib/supabase";
import { getTranslations, CATEGORIES, getCategoryName } from "@/lib/i18n";
import { isOnRequest } from "@/lib/price";
import ProductCard from "@/components/catalog/ProductCard";
import CompareDrawer from "@/components/catalog/CompareDrawer";
import QuoteModal from "@/components/product/QuoteModal";
import QuickViewModal from "@/components/product/QuickViewModal";
import Icon from "@/components/shared/Icon";
import Breadcrumb from "@/components/shared/Breadcrumb";
import FancySelect from "@/components/shared/FancySelect";

const BADGES = ["NEW", "TOP", "SALE"];

// Sort <select> index → behaviour
const SORTS = ["default", "newest", "price_asc", "price_desc", "popular", "name"];

export default function CatalogInner({ params }) {
  const { lang } = params;
  const t = getTranslations(lang);
  const searchParams = useSearchParams();

  const [products, setProducts]   = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState("");
  const [cat, setCat]             = useState("all");
  const [brand, setBrand]         = useState("all");
  const [badge, setBadge]         = useState("all");
  const [sortIdx, setSortIdx]     = useState(0);
  const [stockOnly, setStockOnly] = useState(false);
  const [view, setView]           = useState("grid");
  const [visible, setVisible]     = useState(12);
  const [quickView, setQuickView] = useState(null);
  const [quoteFor, setQuoteFor]   = useState(null);
  const [gridParent]              = useAutoAnimate();

  useEffect(() => {
    const q = searchParams?.get("q");
    const c = searchParams?.get("category");
    const b = searchParams?.get("brand");
    if (q) setSearch(q);
    if (c) setCat(c);
    if (b) setBrand(b);
  }, [searchParams]);

  useEffect(() => {
    setLoading(true);
    Promise.all([getProducts(), getCategories()]).then(([p, c]) => {
      setProducts(p);
      setCategories(c);
      setLoading(false);
    });
  }, []);

  // slug → category row (for category_id resolution)
  const catBySlug = useMemo(() => {
    const m = {};
    categories.forEach((c) => { m[c.slug] = c; });
    return m;
  }, [categories]);

  const brands = useMemo(() => {
    const set = new Set();
    products.forEach((p) => { if (p.brand) set.add(p.brand); });
    return Array.from(set).sort();
  }, [products]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const selectedCat = cat === "all" ? null : catBySlug[cat];
    let res = products.filter((p) => {
      const matchSearch = !q
        || (p.name_ru || "").toLowerCase().includes(q)
        || (p.name_tg || "").toLowerCase().includes(q)
        || (p.name_en || "").toLowerCase().includes(q)
        || (p.name_fa || "").toLowerCase().includes(q)
        || (p.sku    || "").toLowerCase().includes(q)
        || (p.brand  || "").toLowerCase().includes(q);
      // Prefer the category_id relation; fall back to the legacy slug string.
      const matchCat = !selectedCat || (
        selectedCat.id != null && p.category_id != null
          ? p.category_id === selectedCat.id
          : p.category === cat
      );
      const matchBrand = brand === "all" || p.brand === brand;
      const matchBadge = badge === "all" || (badge === "none" ? !p.badge : p.badge === badge);
      const matchStock = !stockOnly || p.in_stock;
      return matchSearch && matchCat && matchBrand && matchBadge && matchStock;
    });

    // Price sorts push "request price" (null) items to the end.
    const byPrice = (dir) => (a, b) => {
      const ao = isOnRequest(a), bo = isOnRequest(b);
      if (ao && bo) return 0;
      if (ao) return 1;
      if (bo) return -1;
      return dir * (Number(a.price) - Number(b.price));
    };
    const sort = SORTS[sortIdx];
    if (sort === "newest")     res = [...res].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    else if (sort === "price_asc")  res = [...res].sort(byPrice(1));
    else if (sort === "price_desc") res = [...res].sort(byPrice(-1));
    else if (sort === "popular")    res = [...res].sort((a, b) => (b.views || 0) - (a.views || 0));
    else if (sort === "name")       res = [...res].sort((a, b) => (a[`name_${lang}`] || "").localeCompare(b[`name_${lang}`] || ""));
    return res;
  }, [products, catBySlug, search, cat, brand, badge, sortIdx, stockOnly, lang]);

  const reset = () => setVisible(12);
  const clearAll = () => { setSearch(""); setCat("all"); setBrand("all"); setBadge("all"); setStockOnly(false); reset(); };
  const hasFilters = search || cat !== "all" || brand !== "all" || badge !== "all" || stockOnly;
  const activeCount = (cat !== "all" ? 1 : 0) + (brand !== "all" ? 1 : 0) + (badge !== "all" ? 1 : 0) + (stockOnly ? 1 : 0) + (sortIdx ? 1 : 0);
  const filtersLabel = lang === "fa" ? "فیلترها" : lang === "ru" ? "Фильтры" : lang === "tg" ? "Филтрҳо" : "Filters";

  return (
    <div className="bg-canvas-soft min-h-screen">
      {quoteFor && <QuoteModal product={quoteFor} lang={lang} onClose={() => setQuoteFor(null)} />}
      {quickView && (
        <QuickViewModal
          product={quickView}
          lang={lang}
          onClose={() => setQuickView(null)}
          onRequestQuote={(p) => { setQuickView(null); setQuoteFor(p); }}
        />
      )}

      {/* Page header */}
      <div className="relative overflow-hidden bg-canvas-soft border-b border-line">
        {/* catalog visual accent (theme-aware) */}
        <Image src="/images/catalog-visual-light.webp" alt="" fill sizes="100vw" className="object-cover opacity-60 dark:hidden pointer-events-none" />
        <Image src="/images/catalog-visual-dark.webp" alt="" fill sizes="100vw" className="object-cover opacity-[0.55] hidden dark:block pointer-events-none" />
        {/* scrim keeps the title/breadcrumb readable on the left while the photo shows */}
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-canvas-soft via-canvas-soft/75 to-canvas-soft/25 dark:via-canvas-soft/70 dark:to-transparent" />
        <div className="blob w-[40vw] h-[40vw] -top-1/3 -end-[6%] animate-aurora"
             style={{ background: "radial-gradient(circle, rgba(139,47,247,0.12) 0%, transparent 70%)" }} />
        <div className="blob w-[30vw] h-[30vw] top-0 start-[6%] animate-aurora"
             style={{ background: "radial-gradient(circle, rgba(6,182,212,0.10) 0%, transparent 70%)", animationDelay: "5s" }} />
        <div className="container-x py-8 md:py-12 relative">
          <Breadcrumb lang={lang} className="mb-3" crumbs={[{ label: t.common.home, href: `/${lang}` }, { label: t.catalog.title }]} />
          <h1 className="font-display text-3xl md:text-4xl font-extrabold text-ink tracking-tight mb-2">
            {t.catalog.title}
          </h1>
          <p className="text-[14px] text-ink-muted">{t.catalog.subtitle}</p>
        </div>
      </div>

      <div className="container-x py-8 md:py-10">
        {/* Search + controls */}
        <div className="flex flex-col md:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <Icon name="search" size={16} className="absolute start-4 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); reset(); }}
              placeholder={t.catalog.searchPh}
              className="input w-full h-12 ps-12 pe-10 rounded-2xl shadow-soft"
            />
            {search && (
              <button onClick={() => { setSearch(""); reset(); }} aria-label="Clear search"
                className="absolute end-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink p-1">
                <Icon name="close" size={16} />
              </button>
            )}
          </div>

          <div className="hidden md:flex gap-3">
          {brands.length > 0 && (
            <FancySelect
              ariaLabel={t.common.allBrands}
              value={brand}
              onChange={(v) => { setBrand(v); reset(); }}
              className="min-w-[150px]"
              options={[{ value: "all", label: t.common.allBrands }, ...brands.map((b) => ({ value: b, label: b }))]}
            />
          )}

          <FancySelect
            ariaLabel={t.catalog.sortDefault}
            value={sortIdx}
            onChange={(v) => { setSortIdx(Number(v)); reset(); }}
            className="min-w-[160px]"
            options={[
              { value: 0, label: t.catalog.sortDefault },
              { value: 1, label: t.catalog.sortNewest },
              { value: 2, label: t.catalog.sortPriceAsc },
              { value: 3, label: t.catalog.sortPriceDesc },
              { value: 4, label: t.catalog.sortPopular },
              { value: 5, label: t.catalog.sortName },
            ]}
          />
          </div>
        </div>

        {/* Mobile filter bar — opens a Vaul bottom-sheet */}
        <div className="md:hidden flex gap-2 mb-5">
          <Drawer.Root>
            <Drawer.Trigger className="relative flex-1 input h-12 flex items-center justify-center gap-2 font-semibold text-ink">
              <Icon name="list" size={16} />
              {filtersLabel}
              {activeCount > 0 && (
                <span className="ms-1 min-w-[20px] h-5 px-1.5 rounded-full bg-brand-gradient text-white text-[11px] font-bold flex items-center justify-center">{activeCount}</span>
              )}
            </Drawer.Trigger>
            <Drawer.Portal>
              <Drawer.Overlay className="fixed inset-0 bg-navy/50 backdrop-blur-sm z-[90]" />
              <Drawer.Content className="fixed bottom-0 inset-x-0 z-[91] bg-surface rounded-t-3xl border-t border-line p-5 pb-8 max-h-[86vh] overflow-y-auto focus:outline-none">
                <div className="mx-auto w-10 h-1.5 rounded-full bg-line mb-4" />
                <Drawer.Title className="font-display text-lg font-bold text-ink mb-4">{filtersLabel}</Drawer.Title>

                <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint mb-2">{t.common.categories}</div>
                <div className="flex flex-wrap gap-2 mb-5">
                  <Pill active={cat === "all"} onClick={() => { setCat("all"); reset(); }}>{t.common.all}</Pill>
                  {CATEGORIES.map((c) => (
                    <Pill key={c.slug} active={cat === c.slug} icon={c.icon} onClick={() => { setCat(c.slug); reset(); }}>
                      {getCategoryName(c.slug, lang)}
                    </Pill>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-3 mb-5">
                  {brands.length > 0 && (
                    <select value={brand} onChange={(e) => { setBrand(e.target.value); reset(); }} className="input h-11 px-3 cursor-pointer">
                      <option value="all">{t.common.allBrands}</option>
                      {brands.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                  )}
                  <select value={sortIdx} onChange={(e) => { setSortIdx(+e.target.value); reset(); }} className="input h-11 px-3 cursor-pointer">
                    <option value={0}>{t.catalog.sortDefault}</option>
                    <option value={1}>{t.catalog.sortNewest}</option>
                    <option value={2}>{t.catalog.sortPriceAsc}</option>
                    <option value={3}>{t.catalog.sortPriceDesc}</option>
                    <option value={4}>{t.catalog.sortPopular}</option>
                    <option value={5}>{t.catalog.sortName}</option>
                  </select>
                </div>

                <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint mb-2">{t.catalog.filterBadge}</div>
                <div className="flex flex-wrap gap-2 mb-5">
                  <BadgePill active={badge === "all"} onClick={() => { setBadge("all"); reset(); }} label={t.common.all} />
                  {BADGES.map((b) => (
                    <BadgePill key={b} active={badge === b} onClick={() => { setBadge(b); reset(); }} label={b} variant={b} />
                  ))}
                  <BadgePill active={badge === "none"} onClick={() => { setBadge("none"); reset(); }} label={t.catalog.noBadge} />
                </div>

                <label className="flex items-center gap-2 cursor-pointer select-none mb-6">
                  <div onClick={() => { setStockOnly(!stockOnly); reset(); }}
                    className={["relative w-10 h-6 rounded-full transition-colors shrink-0", stockOnly ? "bg-brand-gradient" : "bg-line"].join(" ")}>
                    <div className={["absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all", stockOnly ? "start-[18px]" : "start-0.5"].join(" ")} />
                  </div>
                  <span className="text-[13px] text-ink-muted">{t.catalog.stockOnly}</span>
                </label>

                <div className="grid grid-cols-2 gap-2">
                  <button onClick={clearAll} className="btn-ghost size-lg">{t.catalog.clearFilters}</button>
                  <Drawer.Close className="btn-primary size-lg">{t.catalog.found(filtered.length)}</Drawer.Close>
                </div>
              </Drawer.Content>
            </Drawer.Portal>
          </Drawer.Root>

          <div className="flex items-center bg-canvas-soft rounded-lg border border-line p-0.5 shrink-0">
            <button onClick={() => setView("grid")} className={["w-10 h-10 rounded-md flex items-center justify-center transition-colors", view === "grid" ? "bg-surface text-primary shadow-soft" : "text-ink-muted"].join(" ")} title={t.catalog.viewGrid}>
              <Icon name="grid" size={16} />
            </button>
            <button onClick={() => setView("list")} className={["w-10 h-10 rounded-md flex items-center justify-center transition-colors", view === "list" ? "bg-surface text-primary shadow-soft" : "text-ink-muted"].join(" ")} title={t.catalog.viewList}>
              <Icon name="list" size={16} />
            </button>
          </div>
        </div>

        {/* Desktop filters (inline) */}
        <div className="hidden md:block">
        {/* Pills row: category */}
        <div className="flex gap-2 mb-3 overflow-x-auto pb-2 no-scrollbar -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap md:overflow-visible">
          <Pill active={cat === "all"} onClick={() => { setCat("all"); reset(); }}>{t.common.all}</Pill>
          {CATEGORIES.map((c) => (
            <Pill key={c.slug} active={cat === c.slug} icon={c.icon} onClick={() => { setCat(c.slug); reset(); }}>
              {getCategoryName(c.slug, lang)}
            </Pill>
          ))}
        </div>

        {/* Pills row: badge + stock + view toggle */}
        <div className="flex gap-2 mb-6 flex-wrap items-center">
          <span className="text-[11px] text-ink-faint uppercase tracking-wide me-1">{t.catalog.filterBadge}:</span>
          <BadgePill active={badge === "all"} onClick={() => { setBadge("all"); reset(); }} label={t.common.all} />
          {BADGES.map((b) => (
            <BadgePill key={b} active={badge === b} onClick={() => { setBadge(b); reset(); }} label={b} variant={b} />
          ))}
          <BadgePill active={badge === "none"} onClick={() => { setBadge("none"); reset(); }} label={t.catalog.noBadge} />

          <div className="flex-1" />

          {/* Stock toggle */}
          <label className="flex items-center gap-2 cursor-pointer select-none me-1">
            <div
              onClick={() => { setStockOnly(!stockOnly); reset(); }}
              className={[
                "relative w-9 h-5 rounded-full transition-colors shrink-0",
                stockOnly ? "bg-primary" : "bg-line",
              ].join(" ")}
            >
              <div
                className={[
                  "absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all",
                  stockOnly ? "start-[18px]" : "start-0.5",
                ].join(" ")}
              />
            </div>
            <span className="text-[11px] text-ink-muted whitespace-nowrap">{t.catalog.stockOnly}</span>
          </label>

          {/* Grid/list toggle */}
          <div className="flex items-center bg-canvas-soft rounded-lg border border-line p-0.5">
            <button
              onClick={() => setView("grid")}
              className={[
                "w-9 h-8 rounded-md flex items-center justify-center transition-colors",
                view === "grid" ? "bg-surface text-primary shadow-soft" : "text-ink-muted hover:text-ink",
              ].join(" ")}
              title={t.catalog.viewGrid}
            >
              <Icon name="grid" size={15} />
            </button>
            <button
              onClick={() => setView("list")}
              className={[
                "w-9 h-8 rounded-md flex items-center justify-center transition-colors",
                view === "list" ? "bg-surface text-primary shadow-soft" : "text-ink-muted hover:text-ink",
              ].join(" ")}
              title={t.catalog.viewList}
            >
              <Icon name="list" size={15} />
            </button>
          </div>
        </div>
        </div>

        {/* Results count + clear */}
        <div className="flex items-center justify-between mb-4 text-[12px]">
          <span className="text-ink-faint">{!loading && t.catalog.found(filtered.length)}</span>
          {hasFilters && !loading && (
            <button onClick={clearAll} className="text-primary font-semibold hover:underline">
              {t.catalog.clearFilters} ×
            </button>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div className={view === "grid" ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-5" : "space-y-3"}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="card overflow-hidden">
                <div className={view === "grid" ? "aspect-[4/3] skeleton" : "h-32 skeleton"} />
                <div className="p-4 space-y-2">
                  <div className="h-3 skeleton w-1/3" />
                  <div className="h-4 skeleton" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty */}
        {!loading && filtered.length === 0 && (
          <div className="text-center py-20">
            <Icon name="search" size={48} className="text-ink-faint mx-auto mb-4" strokeWidth={1.2} />
            <p className="text-base text-ink-muted">{t.common.noResults}</p>
            <button onClick={clearAll} className="mt-4 text-[13px] font-semibold text-primary">
              {t.catalog.clearFilters}
            </button>
          </div>
        )}

        {/* Grid/List */}
        {!loading && filtered.length > 0 && (
          <>
            <div ref={gridParent} className={view === "grid"
              ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-5"
              : "space-y-3"}>
              {filtered.slice(0, visible).map((p) => (
                <ProductCard key={p.id} product={p} lang={lang} view={view} onQuickView={setQuickView} />
              ))}
            </div>

            {visible < filtered.length && (
              <div className="text-center mt-10">
                <button onClick={() => setVisible((v) => v + 12)} className="btn-primary size-lg">
                  {t.catalog.loadMore} ({filtered.length - visible})
                </button>
              </div>
            )}
          </>
        )}
      </div>

      <CompareDrawer lang={lang} />
    </div>
  );
}

function Pill({ active, onClick, children, icon }) {
  return (
    <button
      onClick={onClick}
      className={[
        "shrink-0 px-3.5 h-9 rounded-full text-[12px] font-semibold transition-all whitespace-nowrap flex items-center gap-1.5",
        active
          ? "bg-primary text-white border border-primary shadow-[0_4px_14px_rgba(37,99,235,0.22)]"
          : "bg-surface text-ink-muted border border-line hover:border-brand-violet/40 hover:text-brand-violet",
      ].join(" ")}
    >
      {icon && <Icon name={icon} size={13} strokeWidth={2} />}
      {children}
    </button>
  );
}

function BadgePill({ active, onClick, label, variant }) {
  const variantClass = {
    NEW:  active ? "bg-primary text-white border-primary" : "border-primary/40 text-primary hover:bg-primary/5",
    TOP:  active ? "bg-cyan-600 text-white border-cyan-600" : "border-cyan-600/40 text-cyan-600 hover:bg-cyan-50",
    SALE: active ? "bg-accent-pink text-white border-accent-pink" : "border-accent-pink/40 text-accent-pink hover:bg-accent-pink/5",
  };
  return (
    <button
      onClick={onClick}
      className={[
        "shrink-0 px-3 h-8 rounded-full text-[11px] font-bold tracking-wider uppercase transition-all border-2",
        variant
          ? variantClass[variant]
          : active
            ? "bg-brand-violet text-white border-brand-violet"
            : "bg-surface text-ink-muted border-line hover:border-ink-muted",
      ].join(" ")}
    >
      {label}
    </button>
  );
}
