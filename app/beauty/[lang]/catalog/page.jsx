// app/beauty/[lang]/catalog/page.jsx — the collection surface, now wired to
// the live beauty_* catalog (PR 2 of Phase 3). Sephora-style two-level
// browsing, fully server-rendered and crawlable (filters are GET links/forms,
// works JS-off): world chips → category chips → brand/search/sort → grid.
// When the catalog is still empty (no products, no filters) it keeps the
// HONEST pre-launch state — world tiles + "opens soon, request now" — never
// fake product cards.
import Link from "next/link";
import { LOCALES } from "@/lib/i18n";
import { waLink, tgLink, bulkInquiryMessage } from "@/lib/whatsapp";
import { getBeautyTranslations } from "@/components/beauty/i18n";
import { getBeautyCategoryTree, getBeautyCategoryPath, getBeautyBrands, getBeautyProducts } from "@/lib/beauty/catalog";
import { nameOf, deptHref, copyFor } from "@/lib/beauty/worlds";
import BeautyProductCard from "@/components/beauty/catalog/BeautyProductCard";
import Icon from "@/components/shared/Icon";
import TiltCard from "@/components/shared/TiltCard";
import Breadcrumb from "@/components/shared/Breadcrumb";
import BeautyPageHeader from "@/components/beauty/BeautyPageHeader";
import SplitText from "@/components/shared/SplitText";

// Filters come from searchParams; the grid must always reflect the operator's
// latest saves (revalidatePath from the panel also lands here).
// The filter searchParams already force a per-request render; force-dynamic
// only added a Data Cache opt-out on top, re-querying Supabase for the
// category tree and brand list on every hit. Keep the dynamic render, keep the
// cache.
export const revalidate = 300;

const SORTS = ["newest", "price_asc", "price_desc", "popular"];

const COPY = {
  tg: {
    title: "Каталоги касбии зебоӣ", subtitle: "Атр, беҳдошт, ороиш, мӯй ва абзор — интихоби андешидашуда барои кашфи касбӣ.",
    emptyTitle: "Каталог омода карда мешавад", emptySub: "Бигӯед чӣ меҷӯед — мо имконоти мавҷуда ва қадамҳои баъдиро тасдиқ мекунем.", browse: "Дидани категорияҳо",
    allWorlds: "Ҳама", allCats: "Ҳама самтҳо", search: "Ҷустуҷӯи мол, бренд ё SKU…", apply: "Ҷустуҷӯ",
    brandAll: "Ҳама брендҳо", results: "маҳсулот", noResults: "Ягон маҳсулоти мувофиқ нест", noResultsSub: "Филтрҳоро тағйир диҳед ё ҷустуҷӯи васеътар кунед.", clear: "Пок кардани филтрҳо",
    requestPrice: "Дархости нарх",
    sort: { default: "Тавсияшуда", newest: "Воридшудаи нав", price_asc: "Нарх: аввал арзон", price_desc: "Нарх: аввал қимат", popular: "Серталаб" },
  },
  ru: {
    title: "Профессиональный каталог красоты", subtitle: "Парфюмерия, гигиена, макияж, волосы и техника — продуманный отбор для профессионального знакомства.",
    emptyTitle: "Каталог готовится", emptySub: "Расскажите, что вы ищете — мы подтвердим доступные варианты и следующие шаги.", browse: "Смотреть категории",
    allWorlds: "Все", allCats: "Все направления", search: "Поиск по названию, бренду или SKU…", apply: "Найти",
    brandAll: "Все бренды", results: "товаров", noResults: "Ничего подходящего не найдено", noResultsSub: "Измените фильтры или расширьте поиск.", clear: "Сбросить фильтры",
    requestPrice: "Запросить цену",
    sort: { default: "Рекомендуемые", newest: "Новые поступления", price_asc: "Цена: сначала ниже", price_desc: "Цена: сначала выше", popular: "Популярные" },
  },
  en: {
    title: "Professional beauty catalog", subtitle: "Fragrance, personal care, makeup, hair and electricals — a considered selection for professional discovery.",
    emptyTitle: "The catalog is being prepared", emptySub: "Tell us what you are looking for and we will confirm the available options and next steps.", browse: "Explore categories",
    allWorlds: "All", allCats: "All categories", search: "Search by product, brand or SKU…", apply: "Search",
    brandAll: "All brands", results: "products", noResults: "No matching products", noResultsSub: "Adjust the filters or try a broader search.", clear: "Clear filters",
    requestPrice: "Request pricing",
    sort: { default: "Featured", newest: "New arrivals", price_asc: "Price: low to high", price_desc: "Price: high to low", popular: "Most viewed" },
  },
  fa: {
    title: "کاتالوگ حرفه‌ای زیبایی", subtitle: "عطر، بهداشتی، آرایشی، مو و لوازم برقی — انتخابی سنجیده برای کشف حرفه‌ای.",
    emptyTitle: "کاتالوگ در حال آماده‌سازی است", emptySub: "بگویید دنبال چه هستید — گزینه‌های موجود و قدم‌های بعدی را تأیید می‌کنیم.", browse: "مشاهده دسته‌بندی‌ها",
    allWorlds: "همه", allCats: "همه دسته‌ها", search: "جستجوی محصول، برند یا SKU…", apply: "جستجو",
    brandAll: "همه برندها", results: "محصول", noResults: "محصول مطابقی یافت نشد", noResultsSub: "فیلترها را تغییر دهید یا جستجو را گسترده‌تر کنید.", clear: "پاک‌کردن فیلترها",
    requestPrice: "استعلام قیمت",
    sort: { default: "پیشنهادی", newest: "تازه‌واردها", price_asc: "قیمت: کم به زیاد", price_desc: "قیمت: زیاد به کم", popular: "پربازدیدترین" },
  },
};

export async function generateMetadata({ params }) {
  const { lang } = params;
  if (!LOCALES.includes(lang)) return {};
  const c = COPY[lang] || COPY.en;
  const t = getBeautyTranslations(lang);
  return { title: `${c.title} — ${t.common.brand}`, description: c.subtitle, robots: lang === "fa" ? { index: false, follow: true } : undefined };
}

const str = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");

export default async function BeautyCatalogPage({ params, searchParams }) {
  const { lang } = params;
  const t = getBeautyTranslations(lang);
  const c = COPY[lang] || COPY.en;
  const sp = searchParams || {};

  const catSlug = str(sp.cat, 80);
  const brand = str(sp.brand, 120);
  const q = str(sp.q, 80);
  const sort = SORTS.includes(sp.sort) ? sp.sort : "default";
  const hasFilters = Boolean(catSlug || brand || q);

  const [tree, path, brands, products] = await Promise.all([
    getBeautyCategoryTree(),
    catSlug ? getBeautyCategoryPath(catSlug) : Promise.resolve(null),
    getBeautyBrands(),
    getBeautyProducts({
      categorySlug: catSlug || undefined,
      brand: brand || undefined,
      search: q || undefined,
      sort,
    }),
  ]);

  // Live once anything is published; before that, the honest pre-launch state.
  const live = products.length > 0 || hasFilters;

  // Tree-aware taxonomy (migration 12): department chips → the active
  // department's children → the active group's children. `trail` is root→…→current.
  const trail = path?.trail || [];
  const current = path?.node || null;
  const deptSlug = trail[0]?.slug || "";
  const deptNode = tree.find((d) => d.slug === deptSlug) || null;
  const lvl2Slug = trail[1]?.slug || "";
  const groupNode = deptNode ? (deptNode.children || []).find((g) => g.slug === lvl2Slug && g.children?.length) : null;
  const lvl3Slug = trail[2]?.slug || "";

  // GET-link builder that preserves the other active filters.
  const href = (patch) => {
    const merged = { cat: catSlug, brand, q, sort: sort === "default" ? "" : sort, ...patch };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return `/beauty/${lang}/catalog${s ? `?${s}` : ""}`;
  };

  const catName = (x) => x[`name_${lang}`] || x.name_en || x.slug;
  const pillCls = (active) => `pill text-[12px] font-semibold inline-flex items-center gap-1.5 transition-colors ${active ? "text-white" : "bg-surface border border-line text-ink-muted hover:text-ink"}`;
  const pillStyle = (active) => (active ? { background: "linear-gradient(120deg,var(--v-navy),var(--v-copper))" } : undefined);
  const tagCls = (active) => `tag transition-colors ${active ? "bg-[color:var(--v-accent)]/10 text-[color:var(--v-accent)]" : "bg-line-soft text-ink-muted hover:text-ink"}`;

  return (
    <div className="bg-canvas-soft min-h-screen">
      {/* Header */}
      <div className="bg-canvas-soft border-b border-line relative overflow-hidden">
        <BeautyPageHeader name="catalog-header" />
        <div aria-hidden="true" className="absolute inset-0 pointer-events-none" style={{
          background: "radial-gradient(50% 60% at 85% 0%, var(--v-glow), transparent 60%)",
        }} />
        <div className="container-x py-10 md:py-14 relative">
          <Breadcrumb lang={lang} className="mb-4" crumbs={[
            { label: t.nav.home, href: `/beauty/${lang}` },
            { label: t.nav.worlds, href: `/beauty/${lang}/worlds` },
            ...trail.map((n, i) => ({ label: catName(n), href: i < trail.length - 1 ? href({ cat: n.slug }) : undefined })),
            ...(trail.length ? [] : [{ label: t.nav.collections }]),
          ]} />
          <h1 className="section-h-lg mb-2"><SplitText text={current ? catName(current) : c.title} delay={0.1} /></h1>
          <p className="text-base text-ink-muted max-w-xl">{c.subtitle}</p>
        </div>
      </div>

      <div className="container-x py-10 md:py-14">
        {live ? (
          <>
            {/* Department chips (tree level 1) */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <Link href={href({ cat: "" })} className={pillCls(!catSlug)} style={pillStyle(!catSlug)}>{c.allWorlds}</Link>
              {tree.map((d) => (
                <Link key={d.id} href={href({ cat: deptSlug === d.slug ? "" : d.slug })} className={pillCls(deptSlug === d.slug)} style={pillStyle(deptSlug === d.slug)}>
                  {d.icon && <Icon name={d.icon} size={13} />} {catName(d)}
                </Link>
              ))}
            </div>

            {/* Active department's children (tree level 2) */}
            {deptNode && deptNode.children?.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mb-4">
                <Link href={href({ cat: deptNode.slug })} className={tagCls(catSlug === deptNode.slug)}>{c.allCats}</Link>
                {deptNode.children.map((g) => (
                  <Link key={g.id} href={href({ cat: g.slug })} className={tagCls(lvl2Slug === g.slug)}>{catName(g)}</Link>
                ))}
              </div>
            )}

            {/* Active group's children (tree level 3) */}
            {groupNode && (
              <div className="flex flex-wrap items-center gap-2 mb-6">
                {groupNode.children.map((leaf) => (
                  <Link key={leaf.id} href={href({ cat: leaf.slug })} className={tagCls(lvl3Slug === leaf.slug)}>{catName(leaf)}</Link>
                ))}
              </div>
            )}

            {/* Search / brand / sort — plain GET form, works JS-off */}
            <form method="GET" className="card-flat p-3 mb-6 flex flex-wrap items-center gap-2">
              {catSlug && <input type="hidden" name="cat" value={catSlug} />}
              <div className="relative flex-1 min-w-[200px]">
                <span className="absolute start-3 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none"><Icon name="search" size={16} /></span>
                <input name="q" defaultValue={q} placeholder={c.search} className="input w-full ps-9" />
              </div>
              {brands.length > 0 && (
                <select name="brand" defaultValue={brand} className="input w-auto min-w-[140px] appearance-none cursor-pointer" dir="ltr">
                  <option value="">{c.brandAll}</option>
                  {brands.map((b) => <option key={b} value={b}>{b}</option>)}
                </select>
              )}
              <select name="sort" defaultValue={sort === "default" ? "" : sort} className="input w-auto appearance-none cursor-pointer">
                <option value="">{c.sort.default}</option>
                {SORTS.map((s) => <option key={s} value={s}>{c.sort[s]}</option>)}
              </select>
              <button type="submit" className="btn-primary size-md">
                <Icon name="search" size={15} /> {c.apply}
              </button>
            </form>

            {/* Result count + clear */}
            <div className="flex items-center justify-between gap-3 mb-5">
              <p className="text-[13px] text-ink-muted"><span className="font-bold text-ink tabular">{products.length}</span> {c.results}</p>
              {hasFilters && (
                <Link href={`/beauty/${lang}/catalog`} className="text-[12px] font-semibold text-[color:var(--v-accent)] inline-flex items-center gap-1">
                  <Icon name="close" size={13} /> {c.clear}
                </Link>
              )}
            </div>

            {products.length === 0 ? (
              <div className="card-flat py-16 px-6 text-center">
                <Icon name="search" size={40} strokeWidth={1.2} className="text-ink-faint mx-auto mb-4" />
                <p className="font-semibold text-ink">{c.noResults}</p>
                <p className="text-sm text-ink-muted mt-1 mb-6">{c.noResultsSub}</p>
                <Link href={`/beauty/${lang}/catalog`} className="btn-ghost size-md">{c.clear}</Link>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4 md:gap-5">
                {products.map((p) => (
                  <BeautyProductCard key={p.id} product={p} lang={lang} requestLabel={c.requestPrice} />
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            {/* World entry tiles — the real departments, not the three
                placeholders this carried before the tree existed. */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-5 mb-12">
              {tree.map((cat) => (
                <TiltCard key={cat.id} className="h-full rounded-2xl" max={7}>
                  <Link href={deptHref(lang, cat.slug)} className="card card-hover bv-sheen p-6 text-center group h-full block focus-ring">
                    <div className="relative w-14 h-14 mx-auto mb-3 rounded-2xl bg-brand-violet/[0.08] text-brand-violet flex items-center justify-center transition-all duration-300 group-hover:text-white group-hover:shadow-brand group-hover:-translate-y-0.5">
                      <span className="absolute inset-0 rounded-2xl bg-brand-gradient opacity-0 group-hover:opacity-100 transition-opacity" />
                      <Icon name={cat.icon || "sparkles"} size={28} strokeWidth={1.6} className="relative" />
                    </div>
                    <div className="font-display font-semibold text-[15px] text-ink group-hover:text-brand-violet transition-colors mb-1">{nameOf(cat, lang)}</div>
                    <div className="text-[11px] text-ink-faint">{cat.children?.length || 0} {copyFor(lang).items}</div>
                  </Link>
                </TiltCard>
              ))}
            </div>

            {/* Honest pre-launch state */}
            <div className="relative overflow-hidden rounded-[2rem] border border-line bg-surface p-8 md:p-14 text-center">
              <div aria-hidden="true" className="absolute inset-0 pointer-events-none img-ph opacity-60" />
              <div className="relative max-w-lg mx-auto">
                <div className="w-16 h-16 mx-auto rounded-2xl bg-brand-violet/[0.08] text-brand-violet grid place-items-center mb-4">
                  <Icon name="sparkles" size={32} strokeWidth={1.3} />
                </div>
                <h2 className="section-h mb-3">{c.emptyTitle}</h2>
                <p className="text-[14px] md:text-[15px] text-ink-muted leading-relaxed mb-7">{c.emptySub}</p>
                <div className="flex flex-wrap gap-3 justify-center">
                  <a href={waLink(bulkInquiryMessage(lang))} target="_blank" rel="noopener noreferrer" className="btn-wa size-lg">
                    <Icon name="chat" size={16} /> WhatsApp
                  </a>
                  <a href={tgLink(bulkInquiryMessage(lang))} target="_blank" rel="noopener noreferrer" className="btn-tg size-lg">
                    <Icon name="send" size={16} /> Telegram
                  </a>
                  <Link href={`/beauty/${lang}/worlds`} className="btn-primary size-lg">
                    {c.browse} <Icon name={lang === "fa" ? "arrowL" : "arrow"} size={15} />
                  </Link>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
