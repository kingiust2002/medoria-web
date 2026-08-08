// components/beauty/home/FeaturedProducts.jsx — the products the operator
// starred in the panel (beauty_products.is_featured), same section shape as
// Health's: header, grid, honest empty state, CTA.
//
// This used to hard-code `const products = []`, so the panel's «ویژه» toggle
// changed nothing anywhere on the public site and the section could only ever
// render its empty state. It reads the catalog now — while nothing is starred
// (or the database is unreachable) the same honest empty state renders, never
// invented items.
import Icon from "@/components/shared/Icon";
import { Reveal, Stagger, StaggerItem } from "@/components/shared/Reveal";
import { getBeautyTranslations as getTranslations } from "@/components/beauty/i18n";
import { getBeautyProducts } from "@/lib/beauty/catalog";
import BeautyProductCard from "@/components/beauty/catalog/BeautyProductCard";

// One tidy grid — two rows of four on desktop. Anything the operator stars
// beyond this still shows in the full catalog.
const LIMIT = 8;

// Word-for-word the label the catalog grid uses for a price-on-request item,
// so the same product reads identically in both places.
const REQUEST_PRICE = {
  tg: "Дархости нарх", ru: "Запросить цену", en: "Request pricing", fa: "استعلام قیمت",
};

export default async function FeaturedProducts({ lang }) {
  const t = getTranslations(lang);
  const requestLabel = REQUEST_PRICE[lang] || REQUEST_PRICE.en;
  const products = await getBeautyProducts({ featured: true, limit: LIMIT });

  return (
    // Decorative product-detail preview cards take too much vertical space on
    // mobile — show this section on tablet/desktop only (md+), same as Health.
    <section id="collections" className="hidden md:block py-14 md:py-20 bg-canvas border-y border-line">
      <div className="container-x">
        <Reveal className="flex items-end justify-between mb-8 md:mb-10 gap-4">
          <div>
            <div className="section-tag text-cyan-600 mb-2.5">{t.home.featTag}</div>
            <h2 className="section-h">{t.home.featH}</h2>
            <p className="section-sub">{t.home.featSub}</p>
          </div>
          <a href="#procurement" className="hidden sm:inline-flex items-center gap-1 text-[13px] font-semibold text-brand-violet hover:opacity-80 whitespace-nowrap">
            {t.home.featAll} <Icon name={lang === "fa" ? "arrowL" : "arrow"} size={14} />
          </a>
        </Reveal>

        {products.length === 0 ? (
          <div className="text-center py-16 text-ink-muted">
            <Icon name="sparkles" size={48} className="text-ink-faint mx-auto mb-3" strokeWidth={1.2} />
            <p className="text-sm">{t.common.noResults}</p>
            <p className="text-xs text-ink-faint mt-2">{t.home.featSub}</p>
          </div>
        ) : (
          <Stagger className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
            {products.map((p) => (
              <StaggerItem key={p.id}>
                <BeautyProductCard product={p} lang={lang} requestLabel={requestLabel} />
              </StaggerItem>
            ))}
          </Stagger>
        )}

        <div className="mt-10 text-center">
          <a href="#procurement" className="btn-primary size-xl">
            {t.home.featAll}
            <Icon name="arrow" size={16} />
          </a>
        </div>
      </div>
    </section>
  );
}
