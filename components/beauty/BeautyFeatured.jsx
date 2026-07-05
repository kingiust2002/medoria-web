// components/beauty/BeautyFeatured.jsx — mirrors Health's FeaturedProducts
// section (header + 3-card grid + closing CTA). Until the beauty catalog and
// sector data exist, the cards are curated mood picks with image slots — no
// invented products or prices. Mobile-hidden like Health's featured block.
import Icon from "@/components/shared/Icon";
import { Reveal, Stagger, StaggerItem } from "@/components/shared/Reveal";
import MediaSlot from "./MediaSlot";
import { beautyCopy } from "./copy";

export default function BeautyFeatured({ lang, media }) {
  const t = beautyCopy(lang).featured;
  const worlds = beautyCopy(lang).worlds;
  return (
    <section id="collections" className="hidden md:block py-14 md:py-20 bg-canvas border-y border-line">
      <div className="container-x">
        <Reveal className="flex items-end justify-between mb-8 md:mb-10 gap-4">
          <div>
            <div className="section-tag mb-2.5">{t.tag}</div>
            <h2 className="section-h">{t.h}</h2>
            <p className="section-sub">{t.sub}</p>
          </div>
        </Reveal>

        <Stagger className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {t.items.map((item, i) => (
            <StaggerItem key={i}>
              <article className="card card-hover overflow-hidden group h-full">
                <MediaSlot
                  src={media?.[`featured-0${i + 1}`]}
                  alt={item.t}
                  sizes="(min-width: 1024px) 30vw, 46vw"
                  markSize={72}
                  className="aspect-[4/3] w-full"
                />
                <div className="p-5">
                  <div className="text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: "var(--v-accent)" }}>
                    {worlds.items[i]?.t}
                  </div>
                  <h3 className="font-beauty font-semibold text-lg text-ink mb-1">{item.t}</h3>
                  <p className="text-[13px] text-ink-muted leading-relaxed">{item.s}</p>
                  <div className="mt-4 inline-flex items-center gap-1.5 text-[11px] font-semibold text-ink-faint">
                    {worlds.soon}
                    <Icon name={lang === "fa" ? "arrowL" : "arrow"} size={11} />
                  </div>
                </div>
              </article>
            </StaggerItem>
          ))}
        </Stagger>

        <div className="mt-10 text-center">
          <a href="#partnership" className="btn-primary size-xl">
            {beautyCopy(lang).partnership.tag}
            <Icon name="arrow" size={16} />
          </a>
        </div>
      </div>
    </section>
  );
}
