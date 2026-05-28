// components/home/StatsBar.jsx
import { getTranslations } from "@/lib/i18n";

export default function StatsBar({ lang }) {
  const t = getTranslations(lang);

  return (
    <section className="py-10 md:py-14 bg-white">
      <div className="container-x">
        <div className="relative bg-navy rounded-3xl px-6 py-8 md:px-12 md:py-10 grid grid-cols-2 md:grid-cols-4 gap-y-6 gap-x-4 overflow-hidden">
          {/* Decorative glow */}
          <div className="absolute -top-20 -right-20 w-60 h-60 rounded-full pointer-events-none"
               style={{ background: "radial-gradient(circle, rgba(37,99,235,0.25) 0%, transparent 70%)" }} />
          <div className="absolute -bottom-20 -left-20 w-60 h-60 rounded-full pointer-events-none"
               style={{ background: "radial-gradient(circle, rgba(6,182,212,0.18) 0%, transparent 70%)" }} />

          {t.home.stats.map(([val, label], i) => (
            <div key={i} className={`relative ${i < 3 ? "md:border-r md:border-white/10" : ""} md:px-4`}>
              <div className="text-4xl md:text-5xl font-display font-extrabold leading-none mb-2 gradient-text tabular">
                {val}
              </div>
              <div className="text-[11px] md:text-[12px] font-medium text-white/55 tracking-wide">
                {label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
