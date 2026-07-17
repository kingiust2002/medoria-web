// components/beauty/home/CategoryGrid.jsx — the three Beauty worlds as an
// asymmetric editorial vitrine («Fil d'Or» season): the first world is a wide
// feature panel, the other two sit beside it — magazine rhythm instead of the
// symmetric Health grid. Serif titles, satin sheen on hover, honest "soon"
// labels. Second station of the copper thread (data-fil-node).
import { getBeautyTranslations as getTranslations, BEAUTY_CATEGORIES as CATEGORIES, getCategoryName } from "@/components/beauty/i18n";
import Icon from "@/components/shared/Icon";
import { Reveal, Stagger, StaggerItem } from "@/components/shared/Reveal";
import TiltCard from "@/components/shared/TiltCard";
import SpotlightCard from "@/components/shared/SpotlightCard";

export default function CategoryGrid({ lang }) {
  const t = getTranslations(lang);

  return (
    <section id="worlds" className="py-14 md:py-20 bg-canvas-soft border-y border-line">
      <div className="container-x">
        <Reveal className="flex items-end justify-between mb-8 md:mb-10 gap-4">
          <div>
            <div className="section-tag mb-2.5" data-fil-node>{t.home.catTag}</div>
            <h2 className="section-h">{t.home.catH}</h2>
            <p className="section-sub">{t.home.catSub}</p>
          </div>
          <a href="#collections" className="hidden sm:inline-flex items-center gap-1 text-[13px] font-semibold text-brand-violet hover:opacity-80 whitespace-nowrap">
            {t.home.catAll} <Icon name={lang === "fa" ? "arrowL" : "arrow"} size={14} />
          </a>
        </Reveal>

        <Stagger className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 md:gap-4">
          {CATEGORIES.map((c, i) => {
            const feature = i === 0;
            return (
              <StaggerItem key={c.slug} className={feature ? "sm:col-span-2 lg:col-span-6" : "lg:col-span-3"}>
                <TiltCard className="h-full rounded-2xl" max={feature ? 5 : 8}>
                  <SpotlightCard className="h-full rounded-2xl">
                    <a
                      href="#collections"
                      className={`card card-hover bv-sheen overflow-hidden group block h-full ${
                        feature ? "p-7 md:p-8 text-start" : "p-5 text-center"
                      }`}
                    >
                      <div className={`relative rounded-2xl bg-brand-violet/[0.08] text-brand-violet flex items-center justify-center transition-all duration-300 group-hover:text-white group-hover:shadow-brand group-hover:-translate-y-0.5 ${
                        feature ? "w-16 h-16 mb-5" : "w-14 h-14 mx-auto mb-3"
                      }`}>
                        <span className="absolute inset-0 rounded-2xl bg-brand-gradient opacity-0 group-hover:opacity-100 transition-opacity" />
                        <Icon name={c.icon} size={feature ? 32 : 28} strokeWidth={1.6} className="relative" />
                      </div>
                      <div className={`font-display text-ink leading-tight mb-1 group-hover:text-brand-violet transition-colors ${
                        feature ? "font-bold text-xl md:text-2xl" : "font-semibold text-[15px]"
                      }`}>
                        {getCategoryName(c.slug, lang)}
                      </div>
                      {!feature && <div className="text-[11px] text-ink-faint">{t.common.soon}</div>}
                      {feature && (
                        <div className="mt-4 inline-flex items-center gap-1.5 text-[12px] font-semibold text-brand-violet">
                          {t.common.soon}
                          <Icon name={lang === "fa" ? "arrowL" : "arrow"} size={13} />
                        </div>
                      )}
                    </a>
                  </SpotlightCard>
                </TiltCard>
              </StaggerItem>
            );
          })}
        </Stagger>

        <a href="#collections" className="sm:hidden flex items-center justify-center gap-1 mt-6 text-[13px] font-semibold text-primary">
          {t.home.catAll} <Icon name="arrow" size={14} />
        </a>
      </div>
    </section>
  );
}
