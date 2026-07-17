// app/beauty/[lang]/catalog/page.jsx — the collection surface. The Beauty
// catalogue is not live yet (products arrive with the Phase-3 data layer), so
// this renders an HONEST pre-launch collection: the three worlds as entry
// tiles + a clear "opens soon, request now" state and partnership CTAs — never
// fake product cards. Structure mirrors Health's /catalog shell so it can grow
// into a real grid later without a redesign.
import Link from "next/link";
import { LOCALES } from "@/lib/i18n";
import { waLink, tgLink, bulkInquiryMessage } from "@/lib/whatsapp";
import { getBeautyTranslations, BEAUTY_CATEGORIES, getCategoryName } from "@/components/beauty/i18n";
import Icon from "@/components/shared/Icon";
import TiltCard from "@/components/shared/TiltCard";
import Breadcrumb from "@/components/shared/Breadcrumb";
import SplitText from "@/components/shared/SplitText";

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

const COPY = {
  tg: { title: "Коллексия", subtitle: "Ҷаҳонҳои зебоии Medoria — ба зудӣ пур мешаванд.", emptyTitle: "Коллексия ба зудӣ кушода мешавад", emptySub: "Ҳоло дархости худро фиристед — прайс-лист, намунаҳо ва шартҳои махсусро мефиристем.", browse: "Самтҳоро бинед" },
  ru: { title: "Коллекция", subtitle: "Миры красоты Medoria — скоро наполнятся.", emptyTitle: "Коллекция скоро откроется", emptySub: "Отправьте запрос уже сейчас — пришлём прайс-лист, образцы и особые условия.", browse: "Смотреть направления" },
  en: { title: "Collection", subtitle: "The Medoria worlds of beauty — filling up soon.", emptyTitle: "The collection opens soon", emptySub: "Send your request now — we'll share the price list, samples and special terms.", browse: "Browse the worlds" },
  fa: { title: "کالکشن", subtitle: "دنیاهای زیبایی مدوریا — به‌زودی پر می‌شوند.", emptyTitle: "کالکشن به‌زودی باز می‌شود", emptySub: "همین حالا درخواستتان را بفرستید — پرایس‌لیست، نمونه‌ها و شرایط ویژه را می‌فرستیم.", browse: "دیدن دنیاها" },
};

export async function generateMetadata({ params }) {
  const { lang } = params;
  if (!LOCALES.includes(lang)) return {};
  const c = COPY[lang] || COPY.en;
  const t = getBeautyTranslations(lang);
  return { title: `${c.title} — ${t.common.brand}`, description: c.subtitle, robots: lang === "fa" ? { index: false, follow: true } : undefined };
}

export default function BeautyCatalogPage({ params }) {
  const { lang } = params;
  const t = getBeautyTranslations(lang);
  const c = COPY[lang] || COPY.en;

  return (
    <div className="bg-canvas-soft min-h-screen">
      {/* Header */}
      <div className="bg-canvas-soft border-b border-line relative overflow-hidden">
        <div aria-hidden="true" className="absolute inset-0 pointer-events-none" style={{
          background: "radial-gradient(50% 60% at 85% 0%, var(--v-glow), transparent 60%)",
        }} />
        <div className="container-x py-10 md:py-14 relative">
          <Breadcrumb lang={lang} className="mb-4" crumbs={[{ label: t.nav.home, href: `/beauty/${lang}` }, { label: t.nav.collections }]} />
          <h1 className="section-h-lg mb-2"><SplitText text={c.title} delay={0.1} /></h1>
          <p className="text-base text-ink-muted max-w-xl">{c.subtitle}</p>
        </div>
      </div>

      <div className="container-x py-10 md:py-14">
        {/* World entry tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-5 mb-12">
          {BEAUTY_CATEGORIES.map((cat) => (
            <TiltCard key={cat.slug} className="h-full rounded-2xl" max={7}>
              <Link href={`/beauty/${lang}/worlds`} className="card card-hover bv-sheen p-6 text-center group h-full block">
                <div className="relative w-14 h-14 mx-auto mb-3 rounded-2xl bg-brand-violet/[0.08] text-brand-violet flex items-center justify-center transition-all duration-300 group-hover:text-white group-hover:shadow-brand group-hover:-translate-y-0.5">
                  <span className="absolute inset-0 rounded-2xl bg-brand-gradient opacity-0 group-hover:opacity-100 transition-opacity" />
                  <Icon name={cat.icon} size={28} strokeWidth={1.6} className="relative" />
                </div>
                <div className="font-display font-semibold text-[15px] text-ink group-hover:text-brand-violet transition-colors mb-1">{getCategoryName(cat.slug, lang)}</div>
                <div className="text-[11px] text-ink-faint">{t.common.soon}</div>
              </Link>
            </TiltCard>
          ))}
        </div>

        {/* Honest pre-launch state */}
        <div className="relative overflow-hidden rounded-[2rem] border border-line bg-surface p-8 md:p-14 text-center">
          <div aria-hidden="true" className="absolute inset-0 pointer-events-none img-ph opacity-60" />
          <div className="relative max-w-lg mx-auto">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-brand-violet/[0.08] text-brand-violet grid place-items-center mb-4">
              <Icon name="sparkles" size={32} strokeWidth={1.3} />
            </div>
            <h2 className="section-h mb-3">{c.emptyTitle}</h2>
            <p className="text-[14px] md:text-[15px] text-ink-muted leading-relaxed mb-7">{c.emptySub}</p>
            <div className="flex flex-wrap gap-3 justify-center">
              <a href={waLink(bulkInquiryMessage(lang))} target="_blank" rel="noopener noreferrer" className="btn-wa size-lg">
                <Icon name="chat" size={16} /> WhatsApp
              </a>
              <a href={tgLink(bulkInquiryMessage(lang))} target="_blank" rel="noopener noreferrer" className="btn-tg size-lg">
                <Icon name="send" size={16} /> Telegram
              </a>
              <Link href={`/beauty/${lang}/worlds`} className="btn-primary size-lg">
                {c.browse} <Icon name={lang === "fa" ? "arrowL" : "arrow"} size={15} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
