// components/home/WhyMedoria.jsx
import { getTranslations } from "@/lib/i18n";
import Icon from "@/components/shared/Icon";
import { Reveal, Stagger, StaggerItem } from "@/components/shared/Reveal";

const ICON_MAP = ["bolt", "package", "dollar", "refresh", "handshake", "globe"];

export default function WhyMedoria({ lang }) {
  const t = getTranslations(lang);

  return (
    <section className="py-14 md:py-20 bg-canvas">
      <div className="container-x">
        <Reveal className="text-center mb-10 md:mb-14 max-w-2xl mx-auto">
          <div className="section-tag mb-3">{t.home.whyTag}</div>
          <h2 className="section-h-lg">{t.home.whyH}</h2>
        </Reveal>

        <Stagger className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
          {t.home.whyItems.map(([_, title, desc], i) => (
            <StaggerItem key={i}>
              <div className="card card-hover p-7 group h-full">
                <div className="relative w-12 h-12 rounded-2xl bg-brand-violet/[0.08] text-brand-violet flex items-center justify-center mb-4 transition-all duration-300 group-hover:text-white group-hover:shadow-brand">
                  <span className="absolute inset-0 rounded-2xl bg-brand-gradient opacity-0 group-hover:opacity-100 transition-opacity" />
                  <Icon name={ICON_MAP[i]} size={24} strokeWidth={1.75} className="relative" />
                </div>
                <h3 className="font-display font-bold text-[16px] text-ink mb-2">{title}</h3>
                <p className="text-[13px] text-ink-muted leading-[1.7]">{desc}</p>
              </div>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
