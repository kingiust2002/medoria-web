// components/beauty/home/FeaturedProducts.jsx — verbatim copy of the Health
// FeaturedProducts section, beauty-ized: same header/grid/empty-state/CTA
// structure. The beauty catalog has no products yet, so the honest empty
// state renders (skeleton grid → "collection opens soon"), never fake items.
import Icon from "@/components/shared/Icon";
import { Reveal } from "@/components/shared/Reveal";
import { getBeautyTranslations as getTranslations } from "@/components/beauty/i18n";

export default function FeaturedProducts({ lang }) {
  const t = getTranslations(lang);
  const products = [];

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
        ) : null}

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
