// app/beauty/[lang]/worlds/page.jsx — the three Beauty worlds as a browsable
// listing (mirrors Health's /categories). Each world links into the collection
// filtered to that world. Static, server-rendered, honest "soon" labels — no
// product counts are claimed until the catalogue is live.
import Link from "next/link";
import { LOCALES } from "@/lib/i18n";
import { getBeautyTranslations, BEAUTY_CATEGORIES, getCategoryName } from "@/components/beauty/i18n";
import Icon from "@/components/shared/Icon";
import TiltCard from "@/components/shared/TiltCard";
import SpotlightCard from "@/components/shared/SpotlightCard";
import Breadcrumb from "@/components/shared/Breadcrumb";
import SplitText from "@/components/shared/SplitText";

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

const COPY = {
  tg: { title: "Се ҷаҳони зебоӣ", subtitle: "Ҳар самт — интихоби алоҳида бо ҳисси худ.", view: "Дидани самт", askTitle: "Он чиро, ки мехоҳед намеёбед?",
    details: { skincare: "Кремҳо, сыворотка ва нигоҳубини касбии пӯст аз брендҳои шинохта.", makeup: "Косметикаи декоративии люкс барои визажистҳо ва салонҳо.", tools: "Асбоб ва маводи касбии зебоӣ бо шартҳои махсус." } },
  ru: { title: "Три мира красоты", subtitle: "Каждое направление — отдельный отбор со своим характером.", view: "Смотреть направление", askTitle: "Не нашли нужное?",
    details: { skincare: "Кремы, сыворотки и профессиональный уход от известных брендов.", makeup: "Люксовая декоративная косметика для визажистов и салонов.", tools: "Профессиональные бьюти-инструменты на особых условиях." } },
  en: { title: "Three worlds of beauty", subtitle: "Each world is its own curation with its own character.", view: "View world", askTitle: "Can't find what you're looking for?",
    details: { skincare: "Creams, serums and professional skincare from known houses.", makeup: "Luxe colour cosmetics for makeup artists and salons.", tools: "Professional beauty tools and materials on special terms." } },
  fa: { title: "سه دنیای زیبایی", subtitle: "هر دنیا انتخابی جدا با حس خودش.", view: "دیدن دنیا", askTitle: "آنچه می‌خواهید را پیدا نمی‌کنید؟",
    details: { skincare: "کرم، سرم و مراقبت حرفه‌ای پوست از برندهای شناخته‌شده.", makeup: "آرایش دکوراتیو لوکس برای میکاپ‌آرتیست‌ها و سالن‌ها.", tools: "ابزار و مواد حرفه‌ای زیبایی با شرایط ویژه." } },
};

export async function generateMetadata({ params }) {
  const { lang } = params;
  if (!LOCALES.includes(lang)) return {};
  const c = COPY[lang] || COPY.en;
  const t = getBeautyTranslations(lang);
  return { title: `${c.title} — ${t.common.brand}`, description: c.subtitle, robots: lang === "fa" ? { index: false, follow: true } : undefined };
}

export default function BeautyWorldsPage({ params }) {
  const { lang } = params;
  const t = getBeautyTranslations(lang);
  const c = COPY[lang] || COPY.en;

  return (
    <div className="bg-canvas-soft min-h-screen">
      <div className="bg-canvas-soft border-b border-line relative overflow-hidden">
        <div aria-hidden="true" className="absolute inset-0 pointer-events-none" style={{
          background: "radial-gradient(50% 60% at 85% 0%, var(--v-glow), transparent 60%), radial-gradient(40% 50% at 8% 100%, rgba(28,41,81,0.07), transparent 60%)",
        }} />
        <div className="container-x pt-12 md:pt-16 pb-16 md:pb-20 relative">
          <Breadcrumb lang={lang} className="mb-4" crumbs={[{ label: t.nav.home, href: `/beauty/${lang}` }, { label: t.nav.worlds }]} />
          <div className="section-tag mb-4">{t.home.catTag}</div>
          <h1 className="section-h-lg mb-3 leading-[1.2] pb-1"><SplitText text={c.title} delay={0.1} /></h1>
          <p className="text-base text-ink-muted max-w-xl">{c.subtitle}</p>
        </div>
      </div>

      <div className="container-x py-10 md:py-14">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {BEAUTY_CATEGORIES.map((cat) => (
            <TiltCard key={cat.slug} className="h-full rounded-2xl" max={5}>
              <SpotlightCard className="h-full rounded-2xl">
                <Link href={`/beauty/${lang}/catalog?world=${cat.slug}`} className="card card-hover bv-sheen overflow-hidden group flex h-full">
                  <div className="w-32 md:w-40 shrink-0 img-ph flex items-center justify-center text-brand-violet group-hover:bg-brand-gradient group-hover:text-white transition-colors">
                    <Icon name={cat.icon} size={56} strokeWidth={1.3} className="relative" />
                  </div>
                  <div className="p-5 md:p-6 flex-1 flex flex-col">
                    <div className="flex items-baseline justify-between gap-3 mb-2">
                      <h2 className="font-display text-lg md:text-xl font-bold text-ink group-hover:text-brand-violet transition-colors">{getCategoryName(cat.slug, lang)}</h2>
                      <span className="text-[11px] text-ink-faint shrink-0">{t.common.soon}</span>
                    </div>
                    <p className="text-[13px] text-ink-muted leading-relaxed mb-4 flex-1">{c.details[cat.slug]}</p>
                    <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-violet">
                      {c.view} <Icon name={lang === "fa" ? "arrowL" : "arrow"} size={12} />
                    </span>
                  </div>
                </Link>
              </SpotlightCard>
            </TiltCard>
          ))}
        </div>

        <div className="mt-14 text-center">
          <p className="text-[14px] text-ink-muted mb-4">{c.askTitle}</p>
          <Link href={`/beauty/${lang}/contact`} className="btn-primary size-lg">
            {t.common.contactUs} <Icon name={lang === "fa" ? "arrowL" : "arrow"} size={15} />
          </Link>
        </div>
      </div>
    </div>
  );
}
