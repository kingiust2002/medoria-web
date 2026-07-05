// components/beauty/BeautyValueBar.jsx — mirrors Health's StatsBar band
// (navy rounded panel, 4 divided cells) with brand values instead of
// fabricated numbers; big words render in the beauty serif.
import { beautyCopy } from "./copy";

export default function BeautyValueBar({ lang }) {
  const values = beautyCopy(lang).values;
  return (
    <section className="py-10 md:py-14 bg-canvas">
      <div className="container-x">
        <div className="relative rounded-[2rem] px-6 py-9 md:px-12 md:py-12 grid grid-cols-2 md:grid-cols-4 gap-y-7 gap-x-4 overflow-hidden noise" style={{ background: "var(--v-navy)" }}>
          <div aria-hidden="true" className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(60% 90% at 80% -10%, rgba(200,125,78,0.25), transparent 60%)" }} />
          <div className="absolute inset-x-10 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
          {values.map(([val, label], i) => (
            <div key={i} className={`relative ${i < 3 ? "md:border-e md:border-white/10" : ""} md:px-4`}>
              <div className="font-beauty text-4xl md:text-5xl font-semibold leading-none mb-2 gradient-text-animated"
                style={{ backgroundImage: "linear-gradient(120deg,#EFC894,#D99A66,#FFFFFF)" }}>
                {val}
              </div>
              <div className="text-[11px] md:text-[12px] font-medium text-white/60 tracking-wide">{label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
