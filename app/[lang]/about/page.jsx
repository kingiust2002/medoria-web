// app/[lang]/about/page.jsx
import Link from "next/link";
import { LOCALES, getTranslations } from "@/lib/i18n";
import { waLink, bulkInquiryMessage } from "@/lib/whatsapp";
import Icon from "@/components/shared/Icon";
import Aurora from "@/components/shared/Aurora";

const VALUE_ICONS = ["shield", "bolt", "check", "handshake"];
const OFFER_ICONS = ["gloves", "stethoscope", "bandage", "thermometer", "flask", "pill"];

export async function generateMetadata({ params }) {
  const { lang } = params;
  if (!LOCALES.includes(lang)) return {};
  const t = getTranslations(lang);
  return {
    title: `${t.about.hero.title} — ${t.common.brand}`,
    description: t.about.hero.sub,
    alternates: {
      canonical: `/${lang}/about`,
      languages: Object.fromEntries(LOCALES.map((l) => [l, `/${l}/about`])),
    },
  };
}

export default function AboutPage({ params }) {
  const { lang } = params;
  const t = getTranslations(lang);
  const a = t.about;

  return (
    <div className="bg-canvas-soft">
      {/* Hero */}
      <section className="relative overflow-hidden bg-canvas-soft border-b border-line">
        <Aurora />
        <div
          className="absolute inset-0 opacity-[0.5] pointer-events-none"
          style={{ backgroundImage: "radial-gradient(circle, rgba(99,102,241,0.10) 1px, transparent 1px)", backgroundSize: "26px 26px", maskImage: "radial-gradient(circle at 50% 20%, black, transparent 70%)" }}
        />
        <div className="container-x py-14 md:py-24 relative">
          <nav className="text-[11px] text-ink-muted mb-4 flex items-center gap-2">
            <Link href={`/${lang}`} className="hover:text-brand-violet">{t.common.home}</Link>
            <span className="text-line">/</span>
            <span className="text-brand-violet font-semibold">{t.common.about}</span>
          </nav>
          <div className="eyebrow mb-4"><span className="gradient-text">{a.hero.tag}</span></div>
          <h1 className="section-h-lg mb-5 max-w-3xl">{a.hero.title}</h1>
          <p className="text-base md:text-lg text-ink-muted leading-relaxed max-w-2xl">
            {a.hero.sub}
          </p>
        </div>
      </section>

      {/* Mission */}
      <section className="py-14 md:py-20 bg-canvas-soft border-b border-line">
        <div className="container-x max-w-4xl">
          <div className="section-tag mb-3">{a.mission.tag}</div>
          <h2 className="font-display text-2xl md:text-4xl font-extrabold text-ink tracking-tight mb-5 leading-tight">
            {a.mission.title}
          </h2>
          <p className="text-base md:text-lg text-ink-muted leading-[1.85]">
            {a.mission.body}
          </p>
        </div>
      </section>

      {/* Values */}
      <section className="py-14 md:py-20 bg-white">
        <div className="container-x">
          <div className="text-center mb-10 md:mb-12">
            <div className="section-tag mb-3">{a.values.tag}</div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
            {a.values.items.map(([_, title, desc], i) => (
              <div key={i} className="card p-7 hover:shadow-hover hover:border-brand-violet/20 transition-all group">
                <div className="w-12 h-12 rounded-2xl bg-brand-violet/[0.08] text-brand-violet flex items-center justify-center mb-4 transition-all duration-300 group-hover:bg-brand-gradient group-hover:text-white group-hover:shadow-brand">
                  <Icon name={VALUE_ICONS[i]} size={22} strokeWidth={1.75} />
                </div>
                <h3 className="font-bold text-[16px] text-ink mb-2">{title}</h3>
                <p className="text-[13px] text-ink-muted leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Offer */}
      <section className="py-14 md:py-20 bg-canvas-soft border-y border-line">
        <div className="container-x">
          <div className="text-center mb-10 md:mb-12 max-w-2xl mx-auto">
            <div className="section-tag mb-3">{a.offer.tag}</div>
            <h2 className="section-h-lg">{a.offer.title}</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
            {a.offer.items.map(([_, title, desc], i) => (
              <div key={i} className="card p-7 hover:shadow-hover transition-all group">
                <div className="w-12 h-12 rounded-2xl bg-brand-violet/[0.08] text-brand-violet flex items-center justify-center mb-4 transition-all duration-300 group-hover:bg-brand-gradient group-hover:text-white group-hover:shadow-brand">
                  <Icon name={OFFER_ICONS[i]} size={24} strokeWidth={1.6} />
                </div>
                <h3 className="font-semibold text-[15px] text-ink mb-1.5">{title}</h3>
                <p className="text-[13px] text-ink-muted leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Who we serve */}
      <section className="py-14 md:py-20 bg-white">
        <div className="container-x">
          <div className="text-center mb-10">
            <div className="section-tag mb-3">{a.whoWeServe.tag}</div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {a.whoWeServe.items.map(([title, desc], i) => (
              <div key={i} className="card p-5 hover:shadow-hover hover:border-brand-violet/20 transition-all">
                <h3 className="font-semibold text-[15px] text-ink mb-1.5">{title}</h3>
                <p className="text-[13px] text-ink-muted leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-14 md:py-20 bg-canvas-soft">
        <div className="container-x">
          <div className="relative bg-brand-gradient rounded-3xl p-8 md:p-14 shadow-brand overflow-hidden text-center">
            <div className="absolute inset-0 opacity-15 pointer-events-none">
              <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <pattern id="aboutCta" x="0" y="0" width="32" height="32" patternUnits="userSpaceOnUse">
                    <circle cx="2" cy="2" r="1" fill="white" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#aboutCta)" />
              </svg>
            </div>
            <div className="relative max-w-2xl mx-auto">
              <h2 className="font-display text-2xl md:text-4xl font-extrabold text-white mb-3 leading-tight">
                {a.cta.title}
              </h2>
              <p className="text-white/85 text-[14px] md:text-base mb-7">{a.cta.sub}</p>
              <div className="flex flex-wrap gap-3 justify-center">
                <Link href={`/${lang}/catalog`} className="btn h-12 px-7 rounded-2xl text-sm bg-white text-primary font-bold hover:opacity-90">
                  {t.common.openCatalog}
                  <Icon name="arrow" size={15} />
                </Link>
                <a href={waLink(bulkInquiryMessage(lang))} target="_blank" rel="noopener noreferrer"
                   className="btn-wa size-xl">
                  <Icon name="chat" size={18} />
                  {t.common.contactUs}
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
