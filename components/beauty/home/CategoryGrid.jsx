// components/beauty/home/CategoryGrid.jsx — verbatim copy of the Health
// CategoryGrid, beauty-ized: same header/grid/card/Tilt/Spotlight structure;
// 3 beauty worlds instead of 6 medical categories; honest "soon" labels
// instead of a product-count fetch.
import { getBeautyTranslations as getTranslations, BEAUTY_CATEGORIES as CATEGORIES, getCategoryName } from "@/components/beauty/i18n";
import Icon from "@/components/shared/Icon";
import { Reveal, Stagger, StaggerItem } from "@/components/shared/Reveal";
import TiltCard from "@/components/shared/TiltCard";
import SpotlightCard from "@/components/shared/SpotlightCard";

export default function CategoryGrid({ lang }) {
  const t = getTranslations(lang);
  const labelFor = () => t.common.soon;

  return (
    <section id="worlds" className="py-14 md:py-20 bg-canvas-soft border-y border-line">
      <div className="container-x">
        <Reveal className="flex items-end justify-between mb-8 md:mb-10 gap-4">
          <div>
            <div className="section-tag mb-2.5">{t.home.catTag}</div>
            <h2 className="section-h">{t.home.catH}</h2>
            <p className="section-sub">{t.home.catSub}</p>
          </div>
          <a href="#collections" className="hidden sm:inline-flex items-center gap-1 text-[13px] font-semibold text-brand-violet hover:opacity-80 whitespace-nowrap">
            {t.home.catAll} <Icon name={lang === "fa" ? "arrowL" : "arrow"} size={14} />
          </a>
        </Reveal>

        <Stagger className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 gap-3 md:gap-4">
          {CATEGORIES.map((c) => (
            <StaggerItem key={c.slug}>
            <TiltCard className="h-full rounded-2xl" max={8}>
            <SpotlightCard className="h-full rounded-2xl">
            <a
              href="#collections"
              className="card card-hover overflow-hidden group p-5 text-center block h-full"
            >
              <div className="relative w-14 h-14 mx-auto mb-3 rounded-2xl bg-brand-violet/[0.08] text-brand-violet flex items-center justify-center transition-all duration-300 group-hover:text-white group-hover:shadow-brand group-hover:-translate-y-0.5">
                <span className="absolute inset-0 rounded-2xl bg-brand-gradient opacity-0 group-hover:opacity-100 transition-opacity" />
                <Icon name={c.icon} size={28} strokeWidth={1.6} className="relative" />
              </div>
              <div className="font-semibold text-[13px] md:text-sm text-ink leading-tight mb-1 group-hover:text-brand-violet transition-colors">
                {getCategoryName(c.slug, lang)}
              </div>
              <div className="text-[11px] text-ink-faint">
                {labelFor(c.slug)}
              </div>
            </a>
            </SpotlightCard>
            </TiltCard>
            </StaggerItem>
          ))}
        </Stagger>

        <a href="#collections" className="sm:hidden flex items-center justify-center gap-1 mt-6 text-[13px] font-semibold text-primary">
          {t.home.catAll} <Icon name="arrow" size={14} />
        </a>
      </div>
    </section>
  );
}
