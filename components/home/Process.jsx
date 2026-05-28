// components/home/Process.jsx
import { getTranslations } from "@/lib/i18n";

export default function Process({ lang }) {
  const t = getTranslations(lang);

  return (
    <section className="py-14 md:py-20 bg-canvas-soft border-y border-line">
      <div className="container-x">
        <div className="text-center mb-12">
          <div className="section-tag text-cyan-600 mb-3">{t.home.processTag}</div>
          <h2 className="section-h">{t.home.processH}</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 md:gap-6 relative">
          {/* Connecting dashed line */}
          <div className="hidden lg:block absolute top-7 left-[12%] right-[12%] border-t-2 border-dashed border-primary/25 pointer-events-none" />

          {t.home.processItems.map(([num, title, desc], i) => (
            <div key={i} className="relative bg-white">
              <div className="relative mx-auto w-14 h-14 rounded-full bg-white border-2 border-primary text-primary font-display font-extrabold text-lg flex items-center justify-center shadow-card mb-5">
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
