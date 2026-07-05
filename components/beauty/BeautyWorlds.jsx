// components/beauty/BeautyWorlds.jsx — mirrors Health's CategoryGrid section
// (header row + card grid + honest availability label) with the three beauty
// worlds as image-led cards on the shared card/TiltCard/Spotlight system.
import Link from "next/link";
import Icon from "@/components/shared/Icon";
import { Reveal, Stagger, StaggerItem } from "@/components/shared/Reveal";
import TiltCard from "@/components/shared/TiltCard";
import SpotlightCard from "@/components/shared/SpotlightCard";
import MediaSlot from "./MediaSlot";
import { beautyCopy } from "./copy";

const SLOT_IDS = ["world-skincare", "world-makeup", "world-tools"];

export default function BeautyWorlds({ lang, media }) {
  const t = beautyCopy(lang).worlds;
  return (
    <section id="worlds" className="py-14 md:py-20 bg-canvas-soft border-y border-line">
      <div className="container-x">
        <Reveal className="flex items-end justify-between mb-8 md:mb-10 gap-4">
          <div>
            <div className="section-tag mb-2.5">{t.tag}</div>
            <h2 className="section-h">{t.h}</h2>
            <p className="section-sub">{t.sub}</p>
          </div>
        </Reveal>

        <Stagger className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
          {t.items.map((w, i) => (
            <StaggerItem key={i}>
              <TiltCard className="h-full rounded-2xl" max={8}>
                <SpotlightCard className="h-full rounded-2xl">
                  <Link href="#collections" className="card card-hover overflow-hidden group block h-full">
                    <MediaSlot
                      src={media?.[SLOT_IDS[i]]}
                      alt={w.t}
                      sizes="(min-width: 640px) 30vw, 92vw"
                      markSize={64}
                      className="aspect-[4/3] w-full"
                    />
                    <div className="p-5 text-center">
                      <div className="font-beauty font-semibold text-[16px] md:text-lg text-ink leading-tight mb-1 transition-colors group-hover:text-[color:var(--v-accent)]">
                        {w.t}
                      </div>
                      <div className="text-[12px] text-ink-muted mb-1.5">{w.s}</div>
                      <div className="text-[11px] text-ink-faint inline-flex items-center gap-1">
                        {t.soon}
                        <Icon name={lang === "fa" ? "arrowL" : "arrow"} size={11} />
                      </div>
                    </div>
                  </Link>
                </SpotlightCard>
              </TiltCard>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
