// app/health/[lang]/catalog/CatalogInner.jsx — interactive catalog.
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAutoAnimate } from "@formkit/auto-animate/react";
import { Drawer } from "vaul";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { getCategories, getProductsPage, getProductBrands } from "@/lib/supabase";
import { getTranslations } from "@/lib/i18n";
import {
  buildHealthCategoryTree,
  findHealthCategory,
  flattenHealthCategoryTree,
  getHealthCategoryPath,
  getHealthDescendantIds,
  getHealthDescendantSlugs,
  healthCategoryName,
} from "@/lib/health/categories";
import ProductCard from "@/components/catalog/ProductCard";
import CompareDrawer from "@/components/catalog/CompareDrawer";
import QuoteModal from "@/components/product/QuoteModal";
import QuickViewModal from "@/components/product/QuickViewModal";
import Icon from "@/components/shared/Icon";
import Breadcrumb from "@/components/shared/Breadcrumb";
import FancySelect from "@/components/shared/FancySelect";

const BADGES = ["NEW", "TOP", "SALE"];
const SORTS = ["default", "newest", "price_asc", "price_desc", "popular", "name"];
const PAGE = 24;
const LOAD_ERROR = {
  fa: "بارگذاری محصولات ممکن نشد.", ru: "Не удалось загрузить товары.", tg: "Боркунии маҳсулот иҷро нашуд.", en: "Could not load products.",
};
const PRINT_LABEL = { fa: "کاتالوگ قابل چاپ (PDF)", ru: "Каталог для печати (PDF)", tg: "Каталог барои чоп (PDF)", en: "Printable catalog (PDF)" };
const RETRY = { fa: "تلاش دوباره", ru: "Повторить", tg: "Бори дигар", en: "Try again" };

export default function CatalogInner({ params }) {
  const { lang } = params;
  const t = getTranslations(lang);
  const searchParams = useSearchParams();

  // The database filters, sorts, counts and pages (lib/catalogQuery.js); the browser holds only the pages
  // it has shown, not the whole catalog.
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [categories, setCategories] = useState([]);
  const [brands, setBrands] = useState([]);
  const [categoriesReady, setCategoriesReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [cat, setCat] = useState("all");
  const [brand, setBrand] = useState("all");
  const [badge, setBadge] = useState("all");
  const [sortIdx, setSortIdx] = useState(0);
  const [stockOnly, setStockOnly] = useState(false);
  const [view, setView] = useState("grid");
  const [quickView, setQuickView] = useState(null);
  const [quoteFor, setQuoteFor] = useState(null);
  const [gridParent] = useAutoAnimate();
  const requestId = useRef(0);   // only the newest request may write the state (typing fast must not show old results)

  useEffect(() => {
    const q = searchParams?.get("q");
    const c = searchParams?.get("category");
    const b = searchParams?.get("brand");
    if (q) { setSearch(q); setDebouncedSearch(q); }
    if (c) setCat(c);
    if (b) setBrand(b);
  }, [searchParams]);

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(id);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getCategories(), getProductBrands()]).then(([categoryRows, brandRows]) => {
      if (cancelled) return;
      setCategories(categoryRows);
      setBrands(brandRows);
      setCategoriesReady(true);
    });
    return () => { cancelled = true; };
  }, []);

  const categoryTree = useMemo(() => buildHealthCategoryTree(categories, { activeOnly: true }), [categories]);
  const flatCategories = useMemo(() => flattenHealthCategoryTree(categoryTree), [categoryTree]);
  const selectedCategory = useMemo(() => cat === "all" ? null : findHealthCategory(categoryTree, cat), [categoryTree, cat]);
  const selectedPath = useMemo(() => selectedCategory ? getHealthCategoryPath(categoryTree, selectedCategory.slug) : [], [categoryTree, selectedCategory]);
  // Which categories the query may return: the chosen branch, or every visible (active) category. Products
  // with no category stay visible in the unfiltered list, as before.
  const categoryIds = useMemo(() => {
    if (selectedCategory) return Array.from(getHealthDescendantIds(selectedCategory)).filter((id) => id != null);
    return flatCategories.map(({ node }) => node.id).filter((id) => id != null);
  }, [selectedCategory, flatCategories]);

  const runQuery = useCallback((pageNo) => getProductsPage({
    search: debouncedSearch,
    categoryIds,
    keepUncategorized: !selectedCategory,
    brand: brand === "all" ? undefined : brand,
    badge: badge === "all" ? undefined : badge,
    stockOnly,
    sort: SORTS[sortIdx],
    lang,
    page: pageNo,
    pageSize: PAGE,
  }), [debouncedSearch, categoryIds, selectedCategory, brand, badge, stockOnly, sortIdx, lang]);

  // First page again whenever a filter changes.
  useEffect(() => {
    if (!categoriesReady) return;
    const mine = ++requestId.current;
    setLoading(true); setFailed(false);
    runQuery(1).then((res) => {
      if (mine !== requestId.current) return;
      if (res.error) { setFailed(true); setProducts([]); setTotal(0); }
      else { setProducts(res.rows); setTotal(res.total); setPage(1); }
      setLoading(false);
    });
  }, [categoriesReady, runQuery]);

  const loadMore = () => {
    if (loadingMore || products.length >= total) return;
    const mine = requestId.current;
    setLoadingMore(true);
    runQuery(page + 1).then((res) => {
      if (mine !== requestId.current) return;
      if (res.error) setFailed(true);
      else {
        setProducts((cur) => { const seen = new Set(cur.map((p) => p.id)); return [...cur, ...res.rows.filter((p) => !seen.has(p.id))]; });
        setTotal(res.total); setPage(page + 1);
      }
      setLoadingMore(false);
    });
  };

  const selectCategory = (slug) => { setCat(slug); };
  const clearAll = () => { setSearch(""); setCat("all"); setBrand("all"); setBadge("all"); setStockOnly(false); setSortIdx(0); };
  const hasFilters = search || cat !== "all" || brand !== "all" || badge !== "all" || stockOnly || sortIdx !== 0;
  const activeCount = (cat !== "all" ? 1 : 0) + (brand !== "all" ? 1 : 0) + (badge !== "all" ? 1 : 0) + (stockOnly ? 1 : 0) + (sortIdx ? 1 : 0);
  const filtersLabel = lang === "fa" ? "فیلترها" : lang === "ru" ? "Фильтры" : lang === "tg" ? "Филтрҳо" : "Filters";

  return (
    <div className="bg-canvas-soft min-h-screen">
      {quoteFor && <QuoteModal product={quoteFor} lang={lang} onClose={() => setQuoteFor(null)} />}
      {quickView && <QuickViewModal product={quickView} lang={lang} onClose={() => setQuickView(null)} onRequestQuote={(product) => { setQuickView(null); setQuoteFor(product); }} />}

      <div className="relative overflow-hidden bg-canvas-soft border-b border-line">
        <Image src="/images/catalog-visual-light.webp" alt="" fill sizes="100vw" className="object-cover opacity-60 dark:hidden pointer-events-none" />
        <Image src="/images/catalog-visual-dark.webp" alt="" fill sizes="100vw" className="object-cover opacity-[0.55] hidden dark:block pointer-events-none" />
        <div className="absolute inset-0 pointer-events-none bg-gradient-to-r from-canvas-soft via-canvas-soft/75 to-canvas-soft/25 dark:via-canvas-soft/70 dark:to-transparent" />
        <div className="blob w-[40vw] h-[40vw] -top-1/3 -end-[6%] animate-aurora" style={{ background: "radial-gradient(circle, rgba(139,47,247,0.12) 0%, transparent 70%)" }} />
        <div className="blob w-[30vw] h-[30vw] top-0 start-[6%] animate-aurora" style={{ background: "radial-gradient(circle, rgba(6,182,212,0.10) 0%, transparent 70%)", animationDelay: "5s" }} />
        <div className="container-x py-8 md:py-12 relative">
          <Breadcrumb lang={lang} className="mb-3" crumbs={[{ label: t.common.home, href: `/health/${lang}` }, { label: t.catalog.title }]} />
          <h1 className="font-display text-3xl md:text-4xl font-extrabold text-ink tracking-tight mb-2">{t.catalog.title}</h1>
          <p className="text-[14px] text-ink-muted">{t.catalog.subtitle}</p>
        </div>
      </div>

      <div className="container-x py-8 md:py-10">
        <div className="flex flex-col md:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <Icon name="search" size={16} className="absolute start-4 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
            <input value={search} onChange={(event) => { setSearch(event.target.value); }} placeholder={t.catalog.searchPh} className="input w-full h-12 ps-12 pe-10 rounded-2xl shadow-soft" />
            {search && <button onClick={() => { setSearch(""); }} aria-label="Clear search" className="absolute end-3 top-1/2 -translate-y-1/2 text-ink-faint hover:text-ink p-1"><Icon name="close" size={16} /></button>}
          </div>
          <div className="hidden md:flex gap-3">
            {brands.length > 0 && <FancySelect ariaLabel={t.common.allBrands} value={brand} onChange={(value) => { setBrand(value); }} className="min-w-[150px]" options={[{ value: "all", label: t.common.allBrands }, ...brands.map((item) => ({ value: item, label: item }))]} />}
            <FancySelect ariaLabel={t.catalog.sortDefault} value={sortIdx} onChange={(value) => { setSortIdx(Number(value)); }} className="min-w-[160px]" options={[
              { value: 0, label: t.catalog.sortDefault }, { value: 1, label: t.catalog.sortNewest },
              { value: 2, label: t.catalog.sortPriceAsc }, { value: 3, label: t.catalog.sortPriceDesc },
              { value: 4, label: t.catalog.sortPopular }, { value: 5, label: t.catalog.sortName },
            ]} />
          </div>
        </div>

        <div className="md:hidden flex gap-2 mb-5">
          <Drawer.Root>
            <Drawer.Trigger className="relative flex-1 input h-12 flex items-center justify-center gap-2 font-semibold text-ink">
              <Icon name="list" size={16} /> {filtersLabel}
              {activeCount > 0 && <span className="ms-1 min-w-[20px] h-5 px-1.5 rounded-full bg-brand-gradient text-white text-[11px] font-bold flex items-center justify-center">{activeCount}</span>}
            </Drawer.Trigger>
            <Drawer.Portal>
              <Drawer.Overlay className="fixed inset-0 bg-navy/50 backdrop-blur-sm z-[90]" />
              <Drawer.Content className="fixed bottom-0 inset-x-0 z-[91] bg-surface rounded-t-3xl border-t border-line p-5 pb-8 max-h-[86vh] overflow-y-auto focus:outline-none">
                <div className="mx-auto w-10 h-1.5 rounded-full bg-line mb-4" />
                <Drawer.Title className="font-display text-lg font-bold text-ink mb-4">{filtersLabel}</Drawer.Title>
                <CategoryFilterRows tree={categoryTree} selectedPath={selectedPath} selectedSlug={cat} lang={lang} allLabel={t.common.all} onSelect={selectCategory} />
                <div className="grid grid-cols-2 gap-3 mb-5">
                  {brands.length > 0 && <select value={brand} onChange={(event) => { setBrand(event.target.value); }} className="input h-11 px-3 cursor-pointer"><option value="all">{t.common.allBrands}</option>{brands.map((item) => <option key={item} value={item}>{item}</option>)}</select>}
                  <select value={sortIdx} onChange={(event) => { setSortIdx(Number(event.target.value)); }} className="input h-11 px-3 cursor-pointer">
                    <option value={0}>{t.catalog.sortDefault}</option><option value={1}>{t.catalog.sortNewest}</option><option value={2}>{t.catalog.sortPriceAsc}</option><option value={3}>{t.catalog.sortPriceDesc}</option><option value={4}>{t.catalog.sortPopular}</option><option value={5}>{t.catalog.sortName}</option>
                  </select>
                </div>
                <div className="text-[11px] font-bold uppercase tracking-wide text-ink-faint mb-2">{t.catalog.filterBadge}</div>
                <div className="flex flex-wrap gap-2 mb-5">
                  <BadgePill active={badge === "all"} onClick={() => { setBadge("all"); }} label={t.common.all} />
                  {BADGES.map((item) => <BadgePill key={item} active={badge === item} onClick={() => { setBadge(item); }} label={item} variant={item} />)}
                  <BadgePill active={badge === "none"} onClick={() => { setBadge("none"); }} label={t.catalog.noBadge} />
                </div>
                <label className="flex items-center gap-2 cursor-pointer select-none mb-6"><div onClick={() => { setStockOnly(!stockOnly); }} className={["relative w-10 h-6 rounded-full transition-colors shrink-0", stockOnly ? "bg-brand-gradient" : "bg-line"].join(" ")}><div className={["absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-all", stockOnly ? "start-[18px]" : "start-0.5"].join(" ")} /></div><span className="text-[13px] text-ink-muted">{t.catalog.stockOnly}</span></label>
                <div className="grid grid-cols-2 gap-2"><button onClick={clearAll} className="btn-ghost size-lg">{t.catalog.clearFilters}</button><Drawer.Close className="btn-primary size-lg">{t.catalog.found(total)}</Drawer.Close></div>
              </Drawer.Content>
            </Drawer.Portal>
          </Drawer.Root>
          <ViewToggle view={view} setView={setView} labels={t.catalog} mobile />
        </div>

        <div className="hidden md:block">
          <CategoryFilterRows tree={categoryTree} selectedPath={selectedPath} selectedSlug={cat} lang={lang} allLabel={t.common.all} onSelect={selectCategory} />
          <div className="flex gap-2 mb-6 flex-wrap items-center">
            <span className="text-[11px] text-ink-faint uppercase tracking-wide me-1">{t.catalog.filterBadge}:</span>
            <BadgePill active={badge === "all"} onClick={() => { setBadge("all"); }} label={t.common.all} />
            {BADGES.map((item) => <BadgePill key={item} active={badge === item} onClick={() => { setBadge(item); }} label={item} variant={item} />)}
            <BadgePill active={badge === "none"} onClick={() => { setBadge("none"); }} label={t.catalog.noBadge} />
            <div className="flex-1" />
            <label className="flex items-center gap-2 cursor-pointer select-none me-1"><div onClick={() => { setStockOnly(!stockOnly); }} className={["relative w-9 h-5 rounded-full transition-colors shrink-0", stockOnly ? "bg-primary" : "bg-line"].join(" ")}><div className={["absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all", stockOnly ? "start-[18px]" : "start-0.5"].join(" ")} /></div><span className="text-[11px] text-ink-muted whitespace-nowrap">{t.catalog.stockOnly}</span></label>
            <ViewToggle view={view} setView={setView} labels={t.catalog} />
          </div>
        </div>

        <div className="flex items-center justify-between mb-4 text-[12px]"><span className="text-ink-faint flex flex-wrap items-center gap-x-3 gap-y-1">{!loading && t.catalog.found(total)}<a href={`/health/${lang}/print-catalog${cat !== "all" && selectedCategory ? `?category=${encodeURIComponent(selectedCategory.slug)}` : ""}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"><Icon name="invoice" size={12} />{PRINT_LABEL[lang] || PRINT_LABEL.en}</a></span>{hasFilters && !loading && <button onClick={clearAll} className="text-primary font-semibold hover:underline">{t.catalog.clearFilters} ×</button>}</div>

        {loading && <div className={view === "grid" ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-5" : "space-y-3"}>{Array.from({ length: 8 }).map((_, index) => <div key={index} className="card overflow-hidden"><div className={view === "grid" ? "aspect-[4/3] skeleton" : "h-32 skeleton"} /><div className="p-4 space-y-2"><div className="h-3 skeleton w-1/3" /><div className="h-4 skeleton" /></div></div>)}</div>}

        {!loading && failed && <div role="alert" className="text-center py-16"><p className="text-base text-ink-muted">{LOAD_ERROR[lang] || LOAD_ERROR.en}</p><button onClick={() => runQuery(1).then((res) => { if (!res.error) { setFailed(false); setProducts(res.rows); setTotal(res.total); setPage(1); } })} className="mt-4 text-[13px] font-semibold text-primary">{RETRY[lang] || RETRY.en}</button></div>}

        {!loading && !failed && products.length === 0 && <div className="text-center py-20"><Icon name="search" size={48} className="text-ink-faint mx-auto mb-4" strokeWidth={1.2} /><p className="text-base text-ink-muted">{t.common.noResults}</p><button onClick={clearAll} className="mt-4 text-[13px] font-semibold text-primary">{t.catalog.clearFilters}</button></div>}

        {!loading && products.length > 0 && <><div ref={gridParent} className={view === "grid" ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-5" : "space-y-3"}>{products.map((product) => <ProductCard key={product.id} product={product} lang={lang} view={view} onQuickView={setQuickView} />)}</div>{products.length < total && <div className="text-center mt-10"><button onClick={loadMore} disabled={loadingMore} className="btn-primary size-lg disabled:opacity-60">{t.catalog.loadMore} ({total - products.length})</button></div>}</>}
      </div>
      <CompareDrawer lang={lang} />
    </div>
  );
}

function CategoryFilterRows({ tree, selectedPath, selectedSlug, lang, allLabel, onSelect }) {
  const rows = [tree];
  if (selectedPath[0]?.children?.length) rows.push(selectedPath[0].children);
  if (selectedPath[1]?.children?.length) rows.push(selectedPath[1].children);
  return <div className="mb-5 space-y-2">{rows.map((nodes, index) => <div key={index} className="flex gap-2 overflow-x-auto pb-1 no-scrollbar md:flex-wrap md:overflow-visible">{index === 0 && <Pill active={selectedSlug === "all"} onClick={() => onSelect("all")}>{allLabel}</Pill>}{nodes.map((node) => <Pill key={node.slug} active={selectedSlug === node.slug} icon={node.icon} onClick={() => onSelect(node.slug)}>{healthCategoryName(node, lang)}</Pill>)}</div>)}</div>;
}

function ViewToggle({ view, setView, labels, mobile = false }) {
  return <div className={`flex items-center bg-canvas-soft rounded-lg border border-line p-0.5 ${mobile ? "shrink-0" : ""}`}><button onClick={() => setView("grid")} className={[mobile ? "w-10 h-10" : "w-9 h-8", "rounded-md flex items-center justify-center transition-colors", view === "grid" ? "bg-surface text-primary shadow-soft" : "text-ink-muted"].join(" ")} title={labels.viewGrid}><Icon name="grid" size={16} /></button><button onClick={() => setView("list")} className={[mobile ? "w-10 h-10" : "w-9 h-8", "rounded-md flex items-center justify-center transition-colors", view === "list" ? "bg-surface text-primary shadow-soft" : "text-ink-muted"].join(" ")} title={labels.viewList}><Icon name="list" size={16} /></button></div>;
}

function Pill({ active, onClick, children, icon }) {
  return <button onClick={onClick} className={["shrink-0 px-3.5 h-9 rounded-full text-[12px] font-semibold transition-all whitespace-nowrap flex items-center gap-1.5", active ? "bg-primary text-white border border-primary shadow-[0_4px_14px_rgba(37,99,235,0.22)]" : "bg-surface text-ink-muted border border-line hover:border-brand-violet/40 hover:text-brand-violet"].join(" ")}>{icon && <Icon name={icon} size={13} strokeWidth={2} />}{children}</button>;
}

function BadgePill({ active, onClick, label, variant }) {
  const variantClass = { NEW: active ? "bg-primary text-white border-primary" : "border-primary/40 text-primary hover:bg-primary/5", TOP: active ? "bg-cyan-600 text-white border-cyan-600" : "border-cyan-600/40 text-cyan-600 hover:bg-cyan-50", SALE: active ? "bg-accent-pink text-white border-accent-pink" : "border-accent-pink/40 text-accent-pink hover:bg-accent-pink/5" };
  return <button onClick={onClick} className={["shrink-0 px-3 h-8 rounded-full text-[11px] font-bold tracking-wider uppercase transition-all border-2", variant ? variantClass[variant] : active ? "bg-brand-violet text-white border-brand-violet" : "bg-surface text-ink-muted border-line hover:border-ink-muted"].join(" ")}>{label}</button>;
}
