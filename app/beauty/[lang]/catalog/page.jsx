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
import { getBeautyTranslations, BEAUTY_CATEGORIES, getCategoryName } from "@/components/beauty/i18n";
import { getBeautyCategories, getBeautyBrands, getBeautyProducts } from "@/lib/beauty/catalog";
import BeautyProductCard from "@/components/beauty/catalog/BeautyProductCard";
import Icon from "@/components/shared/Icon";
import TiltCard from "@/components/shared/TiltCard";
import Breadcrumb from "@/components/shared/Breadcrumb";
import SplitText from "@/components/shared/SplitText";

// Filters come from searchParams; the grid must always reflect the operator's
// latest saves (revalidatePath from the panel also lands here).
export const dynamic = "force-dynamic";

const WORLD_SLUGS = BEAUTY_CATEGORIES.map((c) => c.slug);
const SORTS = ["newest", "price_asc", "price_desc", "popular"];

const COPY = {
  tg: {
    title: "Коллексия", subtitle: "Ҷаҳонҳои зебоии Medoria — интихоби люкс барои салонҳо ва бутикҳо.",
    emptyTitle: "Коллексия ба зудӣ кушода мешавад", emptySub: "Ҳоло дархости худро фиристед — прайс-лист, намунаҳо ва шартҳои махсусро мефиристем.", browse: "Самтҳоро бинед",
    allWorlds: "Ҳама", allCats: "Ҳама самтҳо", search: "Ҷустуҷӯи ном, бренд ё SKU…", apply: "Ҷустуҷӯ",
    brandAll: "Ҳама брендҳо", results: "маҳсулот", noResults: "Чизе ёфт нашуд", noResultsSub: "Филтрҳоро тағйир диҳед ё ҷустуҷӯро пок кунед.", clear: "Пок кардани филтрҳо",
    requestPrice: "Нархро пурсед",
    sort: { default: "Пешниҳодшуда", newest: "Навтарин", price_asc: "Нарх: аввал арзон", price_desc: "Нарх: аввал қимат", popular: "Маъмултарин" },
  },
  ru: {
    title: "Коллекция", subtitle: "Миры красоты Medoria — люксовая подборка для салонов и бутиков.",
    emptyTitle: "Коллекция скоро откроется", emptySub: "Отправьте запрос уже сейчас — пришлём прайс-лист, образцы и особые условия.", browse: "Смотреть направления",
    allWorlds: "Все", allCats: "Все направления", search: "Поиск по названию, бренду или SKU…", apply: "Найти",
    brandAll: "Все бренды", results: "товаров", noResults: "Ничего не найдено", noResultsSub: "Измените фильтры или очистите поиск.", clear: "Сбросить фильтры",
    requestPrice: "Запросить цену",
    sort: { default: "Рекомендуемые", newest: "Новинки", price_asc: "Цена: сначала ниже", price_desc: "Цена: сначала выше", popular: "Популярные" },
  },
  en: {
    title: "Collection", subtitle: "The Medoria worlds of beauty — a luxe selection for salons and boutiques.",
    emptyTitle: "The collection opens soon", emptySub: "Send your request now — we'll share the price list, samples and special terms.", browse: "Browse the worlds",
    allWorlds: "All", allCats: "All categories", search: "Search name, brand or SKU…", apply: "Search",
    brandAll: "All brands", results: "products", noResults: "Nothing found", noResultsSub: "Adjust the filters or clear the search.", clear: "Clear filters",
    requestPrice: "Request price",
    sort: { default: "Curated", newest: "New in", price_asc: "Price: low to high", price_desc: "Price: high to low", popular: "Most viewed" },
  },
  fa: {
    title: "کالکشن", subtitle: "دنیاهای زیبایی مدوریا — انتخاب لوکس برای سالن‌ها و بوتیک‌ها.",
    emptyTitle: "کالکشن به‌زودی باز می‌شود", emptySub: "همین حالا درخواستتان را بفرستید — پرایس‌لیست، نمونه‌ها و شرایط ویژه را می‌فرستیم.", browse: "دیدن دنیاها",
    allWorlds: "همه", allCats: "همه دسته‌ها", search: "جستجوی نام، برند یا SKU…", apply: "جستجو",
    brandAll: "همه برندها", results: "محصول", noResults: "چیزی پیدا نشد", noResultsSub: "فیلترها را تغییر دهید یا جستجو را پاک کنید.", clear: "پاک‌کردن فیلترها",
    requestPrice: "استعلام قیمت",
    sort: { default: "منتخب", newest: "جدیدترین", price_asc: "قیمت: کم به زیاد", price_desc: "قیمت: زیاد به کم", popular: "پربازدیدترین" },
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

  const world = WORLD_SLUGS.includes(sp.world) ? sp.world : "";
  const catSlug = str(sp.cat, 80);
  const brand = str(sp.brand, 120);
  const q = str(sp.q, 80);
  const sort = SORTS.includes(sp.sort) ? sp.sort : "default";
  const hasFilters = Boolean(world || catSlug || brand || q);

  const [cats, brands, products] = await Promise.all([
    getBeautyCategories(),
    getBeautyBrands(),
    getBeautyProducts({
      world: world || undefined,
      categorySlug: catSlug || undefined,
      brand: brand || undefined,
      search: q || undefined,
      sort,
    }),
  ]);

  // Live once anything is published; before that, the honest pre-launch state.
  const live = products.length > 0 || hasFilters;

  // Category chips: scoped to the selected world (or all worlds).
  const chipCats = world ? cats.filter((x) => x.world === world) : cats;

  // GET-link builder that preserves the other active filters.
  const href = (patch) => {
    const merged = { world, cat: catSlug, brand, q, sort: sort === "default" ? "" : sort, ...patch };
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return `/beauty/${lang}/catalog${s ? `?${s}` : ""}`;
  };

  const catName = (x) => x[`name_${lang}`] || x.name_en || x.slug;

  return (
    <div className="bg-canvas-soft min-h-screen">
      {/* Header */}
      <div className="bg-canvas-soft border-b border-line relative overflow-hidden">
        <div aria-hidden="true" className="absolute inset-0 pointer-events-none" style={{
          background: "radial-gradient(50% 60% at 85% 0%, var(--v-glow), transparent 60%)",
        }} />
        <div className="container-x py-10 md:py-14 relative">
          <Breadcrumb lang={lang} className="mb-4" crumbs={[{ label: t.nav.home, href: `/beauty/${lang}` }, { label: t.nav.collections }]} />
          <h1 className="section-h-lg mb-2"><SplitText text={c.title} delay={0.1} /></h1>
          <p className="text-base text-ink-muted max-w-xl">{c.subtitle}</p>
        </div>
      </div>

      <div className="container-x py-10 md:py-14">
        {live ? (
          <>
            {/* World chips (top taxonomy level) */}
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <Link href={href({ world: "", cat: "" })}
                className={`pill text-[12px] font-semibold transition-colors ${!world ? "text-white" : "bg-surface border border-line text-ink-muted hover:text-ink"}`}
                style={!world ? { background: "linear-gradient(120deg,var(--v-navy),var(--v-copper))" } : undefined}>
                {c.allWorlds}
              </Link>
              {BEAUTY_CATEGORIES.map((w) => {
                const active = world === w.slug;
                return (
                  <Link key={w.slug} href={href({ world: active ? "" : w.slug, cat: "" })}
                    className={`pill text-[12px] font-semibold inline-flex items-center gap-1.5 transition-colors ${active ? "text-white" : "bg-surface border border-line text-ink-muted hover:text-ink"}`}
                    style={active ? { background: "linear-gradient(120deg,var(--v-navy),var(--v-copper))" } : undefined}>
                    <Icon name={w.icon} size={13} /> {getCategoryName(w.slug, lang)}
                  </Link>
                );
              })}
            </div>

            {/* Category chips (second level, world-scoped) */}
            {chipCats.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 mb-6">
                <Link href={href({ cat: "" })}
                  className={`tag transition-colors ${!catSlug ? "bg-[color:var(--v-accent)]/10 text-[color:var(--v-accent)]" : "bg-line-soft text-ink-muted hover:text-ink"}`}>
                  {c.allCats}
                </Link>
                {chipCats.map((x) => {
                  const active = catSlug === x.slug;
                  return (
                    <Link key={x.slug} href={href({ cat: active ? "" : x.slug })}
                      className={`tag transition-colors ${active ? "bg-[color:var(--v-accent)]/10 text-[color:var(--v-accent)]" : "bg-line-soft text-ink-muted hover:text-ink"}`}>
                      {catName(x)}
                    </Link>
                  );
                })}
              </div>
            )}

            {/* Search / brand / sort — plain GET form, works JS-off */}
            <form method="GET" className="card-flat p-3 mb-6 flex flex-wrap items-center gap-2">
              {world && <input type="hidden" name="world" value={world} />}
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
            {/* World entry tiles (pre-launch) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-5 mb-12">
              {BEAUTY_CATEGORIES.map((cat) => (
                <TiltCard key={cat.slug} className="h-full rounded-2xl" max={7}>
                  <Link href={`/beauty/${lang}/worlds`} className="card card-hover bv-sheen p-6 text-center group h-full block">
                    <div className="relative w-14 h-14 mx-auto mb-3 rounded-2xl bg-brand-violet/[0.08] text-brand-violet flex items-center justify-center transition-all duration-300 group-hover:text-white group-hover:shadow-brand group-hover:-translate-y-0.5">
                      <span className="absolute inset-0 rounded-2xl bg-brand-gradient opacity-0 group-hover:opacity-100 transition-opacity" />
                      <Icon name={cat.icon} size={28} strokeWidth={1.6} className="relative" />
                    </div>
                    <div className="font-display font-semibold text-[15px] text-ink group-hover:text-brand-violet transition-colors mb-1">{getCategoryName(cat.slug, lang)}</div>
                    <div className="text-[11px] text-ink-faint">{t.common.soon}</div>
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
