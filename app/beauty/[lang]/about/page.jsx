// app/beauty/[lang]/about/page.jsx — Medoria Beauty "about" page. Mirrors the
// Health about structure (hero · mission · values · worlds · who-we-serve ·
// CTA) with self-contained beauty copy (no medical/clinical wording) and the
// copper/ivory identity. Static, server-rendered, SEO metadata per locale.
import Link from "next/link";
import { LOCALES } from "@/lib/i18n";
import { waLink, bulkInquiryMessage } from "@/lib/whatsapp";
import { getBeautyTranslations } from "@/components/beauty/i18n";
import Icon from "@/components/shared/Icon";
import TiltCard from "@/components/shared/TiltCard";
import Breadcrumb from "@/components/shared/Breadcrumb";
import SplitText from "@/components/shared/SplitText";

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

const VALUE_ICONS = ["sparkles", "badgeCheck", "handshake", "refresh"];
const WORLD_ICONS = ["sparkles", "star", "package"];

const COPY = {
  tg: {
    hero: { tag: "ДАР БОРАИ MEDORIA BEAUTY", title: "Зебоӣ, ки бо ҳисси нафосат интихоб мешавад", sub: "Medoria Beauty — дунёи люкси косметика, нигоҳубини пӯст ва абзорҳои зебоӣ барои салонҳо, бутикҳо ва мутахассисони Тоҷикистон. Ҳамон эътимоди Medoria, акнун дар ҷаҳони зебоӣ." },
    mission: { tag: "РИСОЛАТИ МО", title: "Интихоб мекунем, на танҳо мефурӯшем", body: "Мо ҳар маҳсулотро тавре интихоб мекунем, ки барои салони худамон интихоб мекардем — бо диққат ба сифат, аслӣ будан ва ҳиссе, ки ба муштарӣ мемонад. На аз рӯи рӯйхат, балки аз рӯи завқ." },
    values: { tag: "АРЗИШҲОИ МО", items: [
      ["Интихоби люкс", "Ҳар маҳсулот аз рӯи сифат, ҳис ва эътимод интихоб мешавад."],
      ["Маҳсулоти аслӣ", "Танҳо брендҳо ва таъминкунандагони боэътимод."],
      ["Ҳамкории наздик", "Мушовара, намунаҳо ва дастгирии доимӣ."],
      ["Навигарии доимӣ", "Коллексия мунтазам бо трендҳои нав нав мешавад."],
    ] },
    worlds: { tag: "СЕ ҶАҲОН", title: "Дунёҳое, ки хизмат мекунем", items: [
      ["Нигоҳубини пӯст", "Кремҳо, сыворотка ва нигоҳубини касбӣ аз брендҳои шинохта."],
      ["Ороиш", "Косметикаи декоративии люкс барои визажистҳо ва салонҳо."],
      ["Абзорҳои зебоӣ", "Асбоб ва маводи касбӣ бо шартҳои махсус."],
    ] },
    who: { tag: "БАРОИ КӢ", items: [
      ["Салонҳои зебоӣ", "Коллексияи люкс ва расондани мунтазам."],
      ["Бутикҳо ва дӯконҳо", "Витринаи зебо бо маҳсулоти аслӣ."],
      ["Мутахассисони зебоӣ", "Абзори касбӣ бо шартҳои махсус."],
    ] },
    cta: { title: "Биёед ҳамкориро оғоз кунем", sub: "Барои прайс-лист, намунаҳо ва шартҳои махсус ба мо нависед." },
  },
  ru: {
    hero: { tag: "О MEDORIA BEAUTY", title: "Красота, отобранная с чувством изящества", sub: "Medoria Beauty — люксовый мир косметики, ухода и бьюти-инструментов для салонов, бутиков и специалистов Таджикистана. То же доверие Medoria, теперь в мире красоты." },
    mission: { tag: "НАША МИССИЯ", title: "Мы отбираем, а не просто продаём", body: "Каждый продукт мы отбираем так, как выбирали бы для собственного салона — с вниманием к качеству, подлинности и тому чувству, что остаётся у клиента. Не по списку, а по вкусу." },
    values: { tag: "НАШИ ЦЕННОСТИ", items: [
      ["Люксовый отбор", "Каждый продукт отбирается по качеству, чувству и доверию."],
      ["Оригинальные товары", "Только проверенные бренды и поставщики."],
      ["Близкое партнёрство", "Консультации, образцы и постоянная поддержка."],
      ["Постоянные новинки", "Коллекция регулярно обновляется трендами."],
    ] },
    worlds: { tag: "ТРИ МИРА", title: "Направления, которые мы ведём", items: [
      ["Уход за кожей", "Кремы, сыворотки и профессиональный уход от известных брендов."],
      ["Макияж", "Люксовая декоративная косметика для визажистов и салонов."],
      ["Бьюти-инструменты", "Профессиональные инструменты на особых условиях."],
    ] },
    who: { tag: "ДЛЯ КОГО", items: [
      ["Салоны красоты", "Люксовая коллекция и регулярные поставки."],
      ["Бутики и магазины", "Красивая витрина с оригинальными продуктами."],
      ["Бьюти-специалисты", "Профессиональные инструменты на особых условиях."],
    ] },
    cta: { title: "Давайте начнём сотрудничество", sub: "Напишите нам за прайс-листом, образцами и особыми условиями." },
  },
  en: {
    hero: { tag: "ABOUT MEDORIA BEAUTY", title: "Beauty, chosen with a sense of elegance", sub: "Medoria Beauty is a luxe world of cosmetics, skincare and beauty tools for salons, boutiques and professionals across Tajikistan. The same Medoria trust, now in beauty." },
    mission: { tag: "OUR MISSION", title: "We curate, we don't just sell", body: "We choose every product the way we would for our own salon — with an eye for quality, authenticity and the feeling it leaves with a client. Not by a list, but by taste." },
    values: { tag: "OUR VALUES", items: [
      ["Luxe curation", "Every product is chosen for quality, feeling and trust."],
      ["Original products", "Only trusted brands and suppliers."],
      ["Close partnership", "Consultation, samples and ongoing support."],
      ["Always new", "The collection refreshes regularly with the season."],
    ] },
    worlds: { tag: "THREE WORLDS", title: "The worlds we serve", items: [
      ["Skincare", "Creams, serums and professional care from known houses."],
      ["Makeup", "Luxe colour cosmetics for makeup artists and salons."],
      ["Beauty tools", "Professional tools and materials on special terms."],
    ] },
    who: { tag: "WHO IT IS FOR", items: [
      ["Beauty salons", "A luxe collection and regular supply."],
      ["Boutiques and stores", "A beautiful display of original products."],
      ["Beauty professionals", "Professional tools on special terms."],
    ] },
    cta: { title: "Let's start a partnership", sub: "Write to us for the price list, samples and special terms." },
  },
  fa: {
    hero: { tag: "درباره مدوریا بیوتی", title: "زیبایی، منتخب با حسی از ظرافت", sub: "مدوریا بیوتی دنیایی لوکس از آرایش، مراقبت پوست و ابزار زیبایی برای سالن‌ها، بوتیک‌ها و متخصصان است. همان اعتماد مدوریا، حالا در دنیای زیبایی." },
    mission: { tag: "رسالت ما", title: "انتخاب می‌کنیم، فقط نمی‌فروشیم", body: "هر محصول را طوری انتخاب می‌کنیم که برای سالن خودمان انتخاب می‌کردیم — با توجه به کیفیت، اصالت و حسی که برای مشتری می‌ماند. نه از روی فهرست، بلکه از روی ذوق." },
    values: { tag: "ارزش‌های ما", items: [
      ["انتخاب لوکس", "هر محصول بر پایه کیفیت، حس و اعتماد انتخاب می‌شود."],
      ["محصولات اصل", "فقط برندها و تأمین‌کنندگان معتبر."],
      ["همکاری نزدیک", "مشاوره، نمونه و پشتیبانی مستمر."],
      ["تازگی همیشگی", "کالکشن مرتب با ترندهای روز به‌روز می‌شود."],
    ] },
    worlds: { tag: "سه دنیا", title: "دنیاهایی که خدمت می‌کنیم", items: [
      ["مراقبت پوست", "کرم، سرم و مراقبت حرفه‌ای از برندهای شناخته‌شده."],
      ["آرایش", "آرایش لوکس برای میکاپ‌آرتیست‌ها و سالن‌ها."],
      ["ابزار زیبایی", "ابزار و مواد حرفه‌ای با شرایط ویژه."],
    ] },
    who: { tag: "برای چه کسانی", items: [
      ["سالن‌های زیبایی", "کالکشن لوکس و تأمین منظم."],
      ["بوتیک‌ها و فروشگاه‌ها", "ویترینی زیبا با محصولات اصل."],
      ["متخصصان زیبایی", "ابزار حرفه‌ای با شرایط ویژه."],
    ] },
    cta: { title: "بیایید همکاری را آغاز کنیم", sub: "برای پرایس‌لیست، نمونه‌ها و شرایط ویژه به ما پیام دهید." },
  },
};

export async function generateMetadata({ params }) {
  const { lang } = params;
  if (!LOCALES.includes(lang)) return {};
  const c = COPY[lang] || COPY.en;
  const t = getBeautyTranslations(lang);
  return {
    title: `${c.hero.title} — ${t.common.brand}`,
    description: c.hero.sub,
    robots: lang === "fa" ? { index: false, follow: true } : undefined,
  };
}

export default function BeautyAboutPage({ params }) {
  const { lang } = params;
  const t = getBeautyTranslations(lang);
  const c = COPY[lang] || COPY.en;

  return (
    <div className="bg-canvas-soft">
      {/* Hero */}
      <section className="relative overflow-hidden bg-canvas-soft border-b border-line">
        <div aria-hidden="true" className="absolute inset-0 pointer-events-none" style={{
          background: "radial-gradient(60% 60% at 82% 10%, var(--v-glow), transparent 60%), radial-gradient(50% 50% at 10% 100%, rgba(28,41,81,0.08), transparent 60%)",
        }} />
        <div className="absolute inset-0 opacity-[0.5] pointer-events-none"
          style={{ backgroundImage: "radial-gradient(circle, rgba(178,110,63,0.13) 1px, transparent 1px)", backgroundSize: "28px 28px", maskImage: "radial-gradient(circle at 50% 20%, black, transparent 70%)" }} />
        <div className="container-x py-14 md:py-24 relative">
          <Breadcrumb lang={lang} className="mb-4" crumbs={[{ label: t.nav.home, href: `/beauty/${lang}` }, { label: t.nav.about }]} />
          <div className="section-tag mb-4">{c.hero.tag}</div>
          <h1 className="section-h-lg mb-5 max-w-3xl"><SplitText text={c.hero.title} delay={0.1} /></h1>
          <p className="text-base md:text-lg text-ink-muted leading-relaxed max-w-2xl">{c.hero.sub}</p>
        </div>
      </section>

      {/* Mission */}
      <section className="py-14 md:py-20 bg-canvas-soft border-b border-line">
        <div className="container-x grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
          <div>
            <div className="section-tag mb-4">{c.mission.tag}</div>
            <h2 className="section-h mb-5 leading-tight">{c.mission.title}</h2>
            <p className="text-base md:text-lg text-ink-muted leading-[1.85]">{c.mission.body}</p>
          </div>
          <div className="relative aspect-[16/11] w-full rounded-[2rem] overflow-hidden shadow-card img-ph grid place-items-center bv-sheen">
            <Icon name="sparkles" size={64} strokeWidth={1.1} className="text-[color:var(--v-copper)] opacity-60" />
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-14 md:py-20 bg-canvas">
        <div className="container-x">
          <div className="text-center mb-10 md:mb-12"><div className="section-tag">{c.values.tag}</div></div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
            {c.values.items.map(([title, desc], i) => (
              <TiltCard key={i} className="h-full rounded-2xl" max={6}>
                <div className="card p-7 card-hover transition-all group h-full">
                  <div className="w-12 h-12 rounded-2xl bg-brand-violet/[0.08] text-brand-violet flex items-center justify-center mb-4 transition-all duration-300 group-hover:bg-brand-gradient group-hover:text-white group-hover:shadow-brand">
                    <Icon name={VALUE_ICONS[i]} size={22} strokeWidth={1.75} />
                  </div>
                  <h3 className="font-display font-bold text-[16px] text-ink mb-2">{title}</h3>
                  <p className="text-[13px] text-ink-muted leading-relaxed">{desc}</p>
                </div>
              </TiltCard>
            ))}
          </div>
        </div>
      </section>

      {/* Worlds */}
      <section className="py-14 md:py-20 bg-canvas-soft border-y border-line">
        <div className="container-x">
          <div className="text-center mb-10 md:mb-12 max-w-2xl mx-auto">
            <div className="section-tag mb-3">{c.worlds.tag}</div>
            <h2 className="section-h-lg">{c.worlds.title}</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
            {c.worlds.items.map(([title, desc], i) => (
              <TiltCard key={i} className="h-full rounded-2xl" max={6}>
                <Link href={`/beauty/${lang}/worlds`} className="card p-7 card-hover bv-sheen transition-all group h-full block">
                  <div className="w-12 h-12 rounded-2xl bg-brand-violet/[0.08] text-brand-violet flex items-center justify-center mb-4 transition-all duration-300 group-hover:bg-brand-gradient group-hover:text-white group-hover:shadow-brand">
                    <Icon name={WORLD_ICONS[i]} size={24} strokeWidth={1.6} />
                  </div>
                  <h3 className="font-display font-semibold text-[16px] text-ink mb-1.5 group-hover:text-brand-violet transition-colors">{title}</h3>
                  <p className="text-[13px] text-ink-muted leading-relaxed">{desc}</p>
                </Link>
              </TiltCard>
            ))}
          </div>
        </div>
      </section>

      {/* Who we serve */}
      <section className="py-14 md:py-20 bg-canvas">
        <div className="container-x">
          <div className="text-center mb-10"><div className="section-tag">{c.who.tag}</div></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {c.who.items.map(([title, desc], i) => (
              <TiltCard key={i} className="h-full rounded-2xl" max={6}>
                <div className="card p-5 card-hover transition-all h-full">
                  <h3 className="font-display font-semibold text-[15px] text-ink mb-1.5">{title}</h3>
                  <p className="text-[13px] text-ink-muted leading-relaxed">{desc}</p>
                </div>
              </TiltCard>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-14 md:py-20 bg-canvas-soft">
        <div className="container-x">
          <div className="relative bg-brand-gradient-vivid rounded-3xl p-8 md:p-14 shadow-brand-lg overflow-hidden text-center noise">
            <div className="relative max-w-2xl mx-auto">
              <h2 className="font-display text-2xl md:text-4xl font-extrabold text-white mb-3 leading-tight">{c.cta.title}</h2>
              <p className="text-white/85 text-[14px] md:text-base mb-7">{c.cta.sub}</p>
              <div className="flex flex-wrap gap-3 justify-center">
                <Link href={`/beauty/${lang}/catalog`} className="btn h-12 px-7 rounded-2xl text-sm bg-white text-[color:var(--v-navy)] font-bold hover:opacity-90">
                  {t.common.viewCollection}
                  <Icon name={lang === "fa" ? "arrowL" : "arrow"} size={15} />
                </Link>
                <a href={waLink(bulkInquiryMessage(lang))} target="_blank" rel="noopener noreferrer"
                  className="btn h-12 px-7 rounded-2xl text-sm bg-white/15 hover:bg-white/25 text-white border border-white/30 backdrop-blur transition-colors">
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
