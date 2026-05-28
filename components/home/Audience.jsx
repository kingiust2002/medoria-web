// components/home/Audience.jsx
import { getTranslations } from "@/lib/i18n";
import Icon from "@/components/shared/Icon";

const AUDIENCE_ICONS = ["hospital", "pill", "building"];

export default function Audience({ lang }) {
  const t = getTranslations(lang);

  return (
    <section className="py-14 md:py-20 bg-white">
      <div className="container-x">
        <div className="text-center mb-10">
          <div className="section-tag mb-3">{t.home.audienceTag}</div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {t.home.audienceItems.map(([_, title, desc], i) => (
            <div key={i} className="card p-8 text-center hover:shadow-hover hover:border-primary/20 transition-all group">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-tint-blue text-primary group-hover:bg-primary group-hover:text-white flex items-center justify-center mb-5 transition-colors">
                <Icon name={AUDIENCE_ICONS[i]} size={32} strokeWidth={1.5} />
              </div>
              <h3 className="font-display font-bold text-xl text-ink mb-2.5">{title}</h3>
              <p className="text-[13px] text-ink-muted leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
