// components/home/WhyMedoria.jsx — bento mosaic of reasons to choose Medoria.
import { getBeautyTranslations as getTranslations } from "@/components/beauty/i18n";
import Icon from "@/components/shared/Icon";
import { Reveal, Stagger, StaggerItem } from "@/components/shared/Reveal";
import TiltCard from "@/components/shared/TiltCard";
import SpotlightCard from "@/components/shared/SpotlightCard";

const ICON_MAP = ["sparkles", "badgeCheck", "dollar", "refresh", "handshake", "globe"];
// Bento spans on lg+: first tile is a big 2x2 feature, then a varied mosaic.
const SPANS = [
  "lg:col-span-2 lg:row-span-2",
  "lg:col-span-2",
  "lg:col-span-1",
  "lg:col-span-1",
  "lg:col-span-2",
  "lg:col-span-2",
];

export default function WhyMedoria({ lang }) {
  const t = getTranslations(lang);

  return (
    <section className="py-14 md:py-20 bg-canvas">
      <div className="container-x">
        <Reveal className="text-center mb-10 md:mb-14 max-w-2xl mx-auto">
          <div className="section-tag mb-3">{t.home.whyTag}</div>
          <h2 className="section-h-lg">{t.home.whyH}</h2>
        </Reveal>

        <Stagger className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 lg:auto-rows-[minmax(168px,1fr)] gap-4 md:gap-5">
          {t.home.whyItems.map(([, title, desc], i) => {
            const big = i === 0;
            return (
              <StaggerItem key={i} className={SPANS[i] || ""}>
                <TiltCard className="h-full rounded-2xl" max={6}>
                  <SpotlightCard className="h-full rounded-2xl">
                    <div className={`card card-hover group relative overflow-hidden h-full flex flex-col ${big ? "p-8" : "p-6"}`}>
                      {big && (
                        <>
                          <span className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-violet/[0.08] via-transparent to-brand-pink/[0.05]" />
                          <Icon name={ICON_MAP[i]} size={150} strokeWidth={1} className="pointer-events-none absolute -bottom-8 -end-6 text-brand-violet/[0.07]" />
                        </>
                      )}
                      <div className={`relative ${big ? "w-14 h-14" : "w-12 h-12"} rounded-2xl bg-brand-violet/[0.08] text-brand-violet flex items-center justify-center mb-4 transition-all duration-300 group-hover:text-white group-hover:shadow-brand`}>
                        <span className="absolute inset-0 rounded-2xl bg-brand-gradient opacity-0 group-hover:opacity-100 transition-opacity" />
                        <Icon name={ICON_MAP[i]} size={big ? 30 : 24} strokeWidth={1.75} className="relative" />
                      </div>
                      <h3 className={`relative font-display font-bold text-ink mb-2 ${big ? "text-xl md:text-2xl" : "text-[16px]"}`}>{title}</h3>
                      <p className={`relative text-ink-muted leading-[1.7] ${big ? "text-[14px] md:text-[15px] max-w-md" : "text-[13px]"}`}>{desc}</p>
                    </div>
                  </SpotlightCard>
                </TiltCard>
              </StaggerItem>
            );
          })}
        </Stagger>
      </div>
    </section>
  );
}
