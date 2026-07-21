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
  tg: { title: "Категорияҳои касбии зебоӣ", subtitle: "Нигоҳубини пӯст, ороиш ва абзорҳоро тавассути як каталоги андешидашуда кашф кунед.", view: "Кашфи категория", askTitle: "Чизи мушаххасе меҷӯед?",
    details: { skincare: "Маҳсулоти касбии нигоҳубин ва дастгирии табобат барои равандҳои муосири салон ва студия.", makeup: "Асосҳои ранг ва тарҳи рӯй, интихобшуда барои ҳунар, иҷро ва пешниҳод.", tools: "Абзор ва маводи амалӣ барои хидматрасонии мунтазам ва хушсифат." } },
  ru: { title: "Профессиональные категории красоты", subtitle: "Изучите уход, макияж и инструменты через один продуманный каталог.", view: "Открыть категорию", askTitle: "Ищете что-то конкретное?",
    details: { skincare: "Профессиональные средства ухода и поддержки процедур для современных салонных и студийных практик.", makeup: "Основы цвета и колористики, отобранные для творчества, исполнения и презентации.", tools: "Практичные инструменты и расходники для стабильного, аккуратного оказания услуг." } },
  en: { title: "Professional beauty categories", subtitle: "Explore skincare, makeup and tools through one considered catalog.", view: "Explore category", askTitle: "Looking for something specific?",
    details: { skincare: "Professional skincare and treatment-support products for modern salon and studio routines.", makeup: "Colour and complexion essentials selected for artistry, performance and presentation.", tools: "Practical tools and consumables for consistent, polished service delivery." } },
  fa: { title: "دسته‌بندی‌های حرفه‌ای زیبایی", subtitle: "مراقبت پوست، آرایش و ابزار را از طریق یک کاتالوگ سنجیده کشف کنید.", view: "کشف دسته‌بندی", askTitle: "دنبال چیز خاصی هستید؟",
    details: { skincare: "محصولات حرفه‌ای مراقبت و پشتیبانی درمان برای روال‌های مدرن سالن و استودیو.", makeup: "اصول رنگ و فرم صورت، منتخب برای هنر، اجرا و ارائه.", tools: "ابزار و مواد مصرفی عملی برای ارائه خدمات باثبات و حرفه‌ای." } },
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
