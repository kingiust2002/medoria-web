// components/home/Process.jsx
import { getTranslations } from "@/lib/i18n";
import { Reveal } from "@/components/shared/Reveal";

export default function Process({ lang }) {
  const t = getTranslations(lang);

  return (
    <section className="py-14 md:py-20 bg-canvas-soft border-y border-line">
      <div className="container-x">
        <Reveal className="text-center mb-12">
          <div className="section-tag text-cyan-600 mb-3">{t.home.processTag}</div>
          <h2 className="section-h">{t.home.processH}</h2>
        </Reveal>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 md:gap-6 relative">
          {/* Connecting gradient line */}
          <div className="hidden lg:block absolute top-7 inset-x-[12%] h-0.5 bg-gradient-to-r from-brand-pink/40 via-brand-violet/40 to-brand-cyan/40 pointer-events-none" />

          {t.home.processItems.map(([num, title, desc], i) => (
            <div key={i} className="relative bg-canvas-soft">
              <div className="relative mx-auto w-14 h-14 rounded-2xl bg-brand-gradient text-white font-display font-extrabold text-lg flex items-center justify-center shadow-brand mb-5 ring-4 ring-white">
                {num}
              </div>
              <h3 className="font-semibold text-[15px] text-ink mb-2 text-center">{title}</h3>
              <p className="text-[13px] text-ink-muted leading-relaxed text-center max-w-[220px] mx-auto">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
