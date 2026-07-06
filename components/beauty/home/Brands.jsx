// components/home/Brands.jsx
import { getBeautyTranslations as getTranslations } from "@/components/beauty/i18n";

const LABELS = {
  ru: { tag: "ОТОБРАННЫЕ БРЕНДЫ", title: "С какими брендами мы работаем" },
  tg: { tag: "БРЕНДҲОИ ИНТИХОБШУДА", title: "Бо кадом брендҳо кор мекунем" },
  en: { tag: "CURATED BRANDS", title: "Brands we work with" },
  fa: { tag: "برندهای منتخب", title: "با چه برندهایی کار می‌کنیم" },
};

// Placeholder brand names — replace with real ones later
const BRANDS = [
  "LumiSkin", "Rose Atelier", "VelvetLab", "PureGlow", "Maison Nude",
  "SilkTouch", "CopperMuse", "IvoryCare", "BlushBar", "ChampagneSkin",
];

export default function Brands({ lang }) {
  const L = LABELS[lang] || LABELS.en;

  return (
    <section className="py-12 md:py-16 bg-canvas border-y border-line overflow-hidden">
      <div className="container-x mb-8">
        <div className="text-center">
          <div className="section-tag mb-2">{L.tag}</div>
          <h2 className="text-lg md:text-xl font-display font-bold text-ink-muted">{L.title}</h2>
        </div>
      </div>

      {/* Marquee */}
      <div className="relative">
        <div className="flex gap-8 md:gap-12 animate-marquee whitespace-nowrap">
          {[...BRANDS, ...BRANDS].map((brand, i) => (
            <div
              key={i}
              className="shrink-0 px-6 py-4 rounded-2xl bg-canvas-soft border border-line flex items-center gap-3 hover:border-primary/30 transition-colors"
            >
              <div className="w-8 h-8 rounded-lg bg-brand-gradient opacity-80" />
              <span className="font-display text-lg font-bold text-ink-muted">{brand}</span>
            </div>
          ))}
        </div>
        {/* Edge fades */}
        <div className="absolute inset-y-0 left-0 w-16 md:w-32 bg-gradient-to-r from-canvas to-transparent pointer-events-none" />
        <div className="absolute inset-y-0 right-0 w-16 md:w-32 bg-gradient-to-l from-canvas to-transparent pointer-events-none" />
      </div>
    </section>
  );
}
