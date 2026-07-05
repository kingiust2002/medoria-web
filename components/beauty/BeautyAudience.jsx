// components/beauty/BeautyAudience.jsx — mirrors Health's Audience section
// (3 centered TiltCards) for salons, boutiques and beauty professionals.
import Icon from "@/components/shared/Icon";
import { Reveal, Stagger, StaggerItem } from "@/components/shared/Reveal";
import TiltCard from "@/components/shared/TiltCard";
import { beautyCopy } from "./copy";

const AUDIENCE_ICONS = ["star", "building", "handshake"];

export default function BeautyAudience({ lang }) {
  const t = beautyCopy(lang).audience;
  return (
    <section className="py-14 md:py-20 bg-canvas">
      <div className="container-x">
        <Reveal className="text-center mb-10">
          <div className="section-tag mb-3">{t.tag}</div>
        </Reveal>

        <Stagger className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {t.items.map(([_, title, desc], i) => (
            <StaggerItem key={i}>
              <TiltCard className="h-full rounded-2xl" max={6}>
                <div className="card card-hover p-8 text-center group h-full">
                  <div className="relative w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-5 transition-all duration-300 group-hover:text-white"
                    style={{ background: "rgba(200,125,78,0.10)", color: "var(--v-accent)" }}>
                    <span className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "linear-gradient(120deg,var(--v-navy),var(--v-copper))" }} />
                    <Icon name={AUDIENCE_ICONS[i]} size={32} strokeWidth={1.5} className="relative" />
                  </div>
                  <h3 className="font-beauty font-semibold text-xl text-ink mb-2.5">{title}</h3>
                  <p className="text-[13px] text-ink-muted leading-relaxed">{desc}</p>
                </div>
              </TiltCard>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
