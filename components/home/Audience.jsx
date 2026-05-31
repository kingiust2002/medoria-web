// components/home/Audience.jsx
import { getTranslations } from "@/lib/i18n";
import Icon from "@/components/shared/Icon";
import { Reveal, Stagger, StaggerItem } from "@/components/shared/Reveal";

const AUDIENCE_ICONS = ["hospital", "pill", "building"];

export default function Audience({ lang }) {
  const t = getTranslations(lang);

  return (
    <section className="py-14 md:py-20 bg-canvas">
      <div className="container-x">
        <Reveal className="text-center mb-10">
          <div className="section-tag mb-3">{t.home.audienceTag}</div>
        </Reveal>

        <Stagger className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {t.home.audienceItems.map(([_, title, desc], i) => (
            <StaggerItem key={i}>
              <div className="card card-hover p-8 text-center group h-full">
                <div className="relative w-16 h-16 mx-auto rounded-2xl bg-brand-violet/[0.08] text-brand-violet flex items-center justify-center mb-5 transition-all duration-300 group-hover:text-white group-hover:shadow-brand">
                  <span className="absolute inset-0 rounded-2xl bg-brand-gradient opacity-0 group-hover:opacity-100 transition-opacity" />
                  <Icon name={AUDIENCE_ICONS[i]} size={32} strokeWidth={1.5} className="relative" />
                </div>
                <h3 className="font-display font-bold text-xl text-ink mb-2.5">{title}</h3>
                <p className="text-[13px] text-ink-muted leading-relaxed">{desc}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
