// components/beauty/WhyBeauty.jsx — mirrors Health's WhyMedoria bento mosaic
// (2x2 feature tile + varied spans) on the shared card/Tilt/Spotlight system.
import Icon from "@/components/shared/Icon";
import { Reveal, Stagger, StaggerItem } from "@/components/shared/Reveal";
import TiltCard from "@/components/shared/TiltCard";
import SpotlightCard from "@/components/shared/SpotlightCard";
import { beautyCopy } from "./copy";

const ICON_MAP = ["sparkles", "badgeCheck", "dollar", "refresh", "handshake", "globe"];
const SPANS = ["lg:col-span-2 lg:row-span-2", "lg:col-span-2", "lg:col-span-1", "lg:col-span-1", "lg:col-span-2", "lg:col-span-2"];

export default function WhyBeauty({ lang }) {
  const t = beautyCopy(lang).why;
  return (
    <section className="py-14 md:py-20 bg-canvas">
      <div className="container-x">
        <Reveal className="text-center mb-10 md:mb-14 max-w-2xl mx-auto">
          <div className="section-tag mb-3">{t.tag}</div>
          <h2 className="section-h-lg">{t.h}</h2>
        </Reveal>

        <Stagger className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 lg:auto-rows-[minmax(168px,1fr)] gap-4 md:gap-5">
          {t.items.map(([title, desc], i) => {
            const big = i === 0;
            return (
              <StaggerItem key={i} className={SPANS[i] || ""}>
                <TiltCard className="h-full rounded-2xl" max={6}>
                  <SpotlightCard className="h-full rounded-2xl">
                    <div className={`card card-hover group relative overflow-hidden h-full flex flex-col ${big ? "p-8" : "p-6"}`}>
                      {big && (
                        <>
                          <span className="pointer-events-none absolute inset-0" style={{ background: "linear-gradient(135deg, rgba(200,125,78,0.08), transparent 55%, rgba(28,41,81,0.05))" }} />
                          <Icon name={ICON_MAP[i]} size={150} strokeWidth={1} className="pointer-events-none absolute -bottom-8 -end-6 text-[color:var(--v-copper)] opacity-[0.08]" />
                        </>
                      )}
                      <div className={`relative ${big ? "w-14 h-14" : "w-12 h-12"} rounded-2xl flex items-center justify-center mb-4 transition-all duration-300 group-hover:text-white`}
                        style={{ background: "rgba(200,125,78,0.10)", color: "var(--v-accent)" }}>
                        <span className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "linear-gradient(120deg,var(--v-navy),var(--v-copper))" }} />
                        <Icon name={ICON_MAP[i]} size={big ? 30 : 24} strokeWidth={1.75} className="relative" />
                      </div>
                      <h3 className={`relative font-beauty font-semibold text-ink mb-2 ${big ? "text-xl md:text-2xl" : "text-[16px]"}`}>{title}</h3>
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
