// components/beauty/BeautyShowcase.jsx — mirrors Health's Showcase: centered
// header + uniform square gallery (4 slots) + one stat chip on the first tile.
import Icon from "@/components/shared/Icon";
import { Reveal } from "@/components/shared/Reveal";
import MediaSlot from "./MediaSlot";
import { beautyCopy } from "./copy";

export default function BeautyShowcase({ lang, media }) {
  const t = beautyCopy(lang).showcase;
  return (
    <section className="py-14 md:py-20 bg-canvas-soft border-y border-line">
      <div className="container-x">
        <Reveal className="text-center mb-10 md:mb-12 max-w-2xl mx-auto">
          <div className="eyebrow mb-4 mx-auto"><span className="gradient-text">{t.tag}</span></div>
          <h2 className="section-h-lg">{t.h}</h2>
          <p className="section-sub mx-auto">{t.sub}</p>
        </Reveal>

        <Reveal delay={0.1} className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          {t.tiles.map((label, i) => (
            <div key={i} className="relative">
              <MediaSlot
                src={media?.[`showcase-0${i + 1}`]}
                alt={label}
                sizes="(min-width: 768px) 23vw, 46vw"
                markSize={56}
                className="aspect-square w-full rounded-3xl"
              />
              <div className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2">
                <span className="glass rounded-xl px-3 py-1.5 text-[11px] font-bold text-ink leading-tight">{label}</span>
                {i === 0 && (
                  <span className="glass rounded-xl px-2.5 py-1.5 hidden sm:flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg text-white flex items-center justify-center" style={{ background: "linear-gradient(120deg,var(--v-navy),var(--v-copper))" }}>
                      <Icon name="truck" size={13} />
                    </span>
                    <span className="text-[10px] font-bold text-ink leading-tight">{t.stat}</span>
                  </span>
                )}
              </div>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
