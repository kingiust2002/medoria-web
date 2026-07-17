// components/beauty/home/StatsBar.jsx — verbatim copy of the Health StatsBar,
// beauty-ized: same navy band/grid/typography; honest brand values from the
// beauty i18n tree instead of a product-count fetch.
import { getBeautyTranslations as getTranslations } from "@/components/beauty/i18n";

export default function StatsBar({ lang }) {
  const t = getTranslations(lang);
  const stats = [...t.home.stats];

  return (
    <section className="py-10 md:py-14 bg-canvas">
      <div className="container-x">
        <div className="relative bg-navy rounded-[2rem] px-6 py-9 md:px-12 md:py-12 grid grid-cols-2 md:grid-cols-4 gap-y-7 gap-x-4 overflow-hidden noise">
          {/* warm champagne glow instead of the shared violet aurora */}
          <div aria-hidden="true" className="absolute inset-0 pointer-events-none" style={{
            background:
              "radial-gradient(70% 95% at 12% 0%, rgba(200,125,78,0.30) 0%, transparent 55%)," +
              "radial-gradient(60% 85% at 90% 100%, rgba(239,200,148,0.20) 0%, transparent 60%)",
          }} />
          {/* top gradient hairline */}
          <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />

          {stats.map(([val, label], i) => (
            <div key={i} className={`relative ${i < 3 ? "md:border-e md:border-white/10" : ""} md:px-4`}>
              <div className="text-4xl md:text-5xl font-display font-extrabold leading-none mb-2 gradient-text-animated tabular"
                style={{ backgroundImage: "linear-gradient(120deg,#EFC894,#D99A66,#FFFFFF)" }}>
                {val}
              </div>
              <div className="text-[11px] md:text-[12px] font-medium text-white/60 tracking-wide">
                {label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
