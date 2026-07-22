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
    hero: { tag: "ДАР БОРАИ MEDORIA BEAUTY", title: "Нигоҳи андешидашуда ба зебоии касбӣ", sub: "Medoria Beauty нигоҳубини пӯст, ороиш ва абзорҳои касбиро дар каталоги мутамарказ барои салонҳо, бутикҳо ва мутахассисони Тоҷикистон ҷамъ мекунад." },
    mission: { tag: "НИГОҲИ МО", title: "Бо мақсад интихобшуда", body: "Зебоии касбӣ ба садои бештар ниёз надорад. Он ба интихоби равшантар ниёз дорад: маҳсулоти муносиб, заминаи муфид ва роҳи мустақим барои муҳокимаи мавҷудӣ ва ниёзҳои тиҷоратӣ." },
    values: { tag: "АРЗИШҲОИ МО", items: [
      ["Хештандорӣ", "Интихоби мутамарказ, бе изофагӣ пешниҳод шуда."],
      ["Равшанӣ", "Маълумоти мол пеш аз забони таблиғотӣ."],
      ["Мувофиқат", "Каталоги дар атрофи истифода ва кашфи касбӣ ташаккулёфта."],
      ["Гуфтугӯ", "Робитаи мустақим барои саволҳои мол ва ҳамкорӣ."],
    ] },
    worlds: { tag: "СЕ САМТ", title: "Интихоби касбии зебоӣ", items: [
      ["Нигоҳубини пӯст", "Маҳсулоти касбии нигоҳубин ва дастгирии табобат барои равандҳои муосири салон ва студия."],
      ["Ороиш", "Асосҳои ранг ва тарҳи рӯй, интихобшуда барои ҳунар, иҷро ва пешниҳод."],
      ["Абзорҳои зебоӣ", "Абзор ва маводи амалӣ барои хидматрасонии мунтазам ва хушсифат."],
    ] },
    who: { tag: "БАРОИ КӢ", items: [
      ["Салонҳо ва студияҳо", "Барои ниёзҳои утоқи табобат, чакана ва хидматрасонӣ."],
      ["Бутикҳо ва дӯконҳо", "Барои интихоби мутамаркази чаканафурӯшии касбӣ."],
      ["Мутахассисони зебоӣ", "Барои кашфи мол ва абзор дар кори ҳаррӯза."],
    ] },
    cta: { title: "Аз он чи бизнеси шумо лозим дорад сар кунед", sub: "Каталогро кушоед ё ба Medoria дархости мутамаркази маҳсулот фиристед." },
  },
  ru: {
    hero: { tag: "О MEDORIA BEAUTY", title: "Продуманная точка зрения на профессиональную красоту", sub: "Medoria Beauty собирает уход, макияж и профессиональные инструменты в сфокусированный каталог для салонов, бутиков и специалистов Таджикистана." },
    mission: { tag: "НАША ТОЧКА ЗРЕНИЯ", title: "Отобрано с целью", body: "Профессиональной красоте не нужно больше шума. Ей нужен более понятный отбор: релевантные продукты, полезный контекст и прямой способ обсудить наличие и коммерческие условия." },
    values: { tag: "НАШИ ЦЕННОСТИ", items: [
      ["Сдержанность", "Сфокусированный отбор, представленный без излишеств."],
      ["Ясность", "Информация о товаре — прежде маркетингового языка."],
      ["Актуальность", "Каталог, сформированный вокруг профессионального использования и открытий."],
      ["Диалог", "Прямое общение по вопросам товара и партнёрства."],
    ] },
    worlds: { tag: "ТРИ НАПРАВЛЕНИЯ", title: "Профессиональный отбор красоты", items: [
      ["Уход за кожей", "Профессиональные средства ухода и поддержки процедур для современных салонных и студийных практик."],
      ["Макияж", "Основы цвета и колористики, отобранные для творчества, исполнения и презентации."],
      ["Бьюти-инструменты", "Практичные инструменты и расходники для стабильного, аккуратного оказания услуг."],
    ] },
    who: { tag: "ДЛЯ КОГО", items: [
      ["Салоны и студии", "Для потребностей кабинета, розницы и услуг."],
      ["Бутики и магазины", "Для сфокусированного профессионального розничного отбора."],
      ["Бьюти-специалисты", "Для изучения товаров и инструментов в повседневной практике."],
    ] },
    cta: { title: "Начните с того, что нужно вашему бизнесу", sub: "Откройте каталог или отправьте Medoria сфокусированный запрос по товару." },
  },
  en: {
    hero: { tag: "ABOUT MEDORIA BEAUTY", title: "A considered point of view on professional beauty", sub: "Medoria Beauty brings skincare, makeup and professional tools into a focused catalog for salons, boutiques and specialists in Tajikistan." },
    mission: { tag: "OUR POINT OF VIEW", title: "Selected with purpose", body: "Professional beauty does not need more noise. It needs a clearer edit: relevant products, useful context and a direct way to discuss availability and commercial requirements." },
    values: { tag: "OUR VALUES", items: [
      ["Restraint", "A focused selection, presented without excess."],
      ["Clarity", "Product information before marketing language."],
      ["Relevance", "A catalog shaped around professional use and discovery."],
      ["Conversation", "Direct communication for product and partnership questions."],
    ] },
    worlds: { tag: "THREE DIRECTIONS", title: "The professional beauty edit", items: [
      ["Skincare", "Professional skincare and treatment-support products for modern salon and studio routines."],
      ["Makeup", "Colour and complexion essentials selected for artistry, performance and presentation."],
      ["Beauty tools", "Practical tools and consumables for consistent, polished service delivery."],
    ] },
    who: { tag: "WHO IT IS FOR", items: [
      ["Salons & studios", "For treatment-room, retail and service requirements."],
      ["Boutiques & stores", "For a focused professional retail selection."],
      ["Beauty specialists", "For product and tool discovery across daily practice."],
    ] },
    cta: { title: "Start with what your business needs", sub: "Explore the catalog or send Medoria a focused product request." },
  },
  fa: {
    hero: { tag: "درباره مدوریا بیوتی", title: "نگاهی سنجیده به زیبایی حرفه‌ای", sub: "مدوریا بیوتی مراقبت پوست، آرایش و ابزار حرفه‌ای را در کاتالوگی متمرکز برای سالن‌ها، بوتیک‌ها و متخصصان تاجیکستان گرد می‌آورد." },
    mission: { tag: "دیدگاه ما", title: "منتخب با هدف", body: "زیبایی حرفه‌ای به سروصدای بیشتر نیاز ندارد. آن به گزینشی شفاف‌تر نیاز دارد: محصولات مرتبط، زمینه‌ای مفید و راهی مستقیم برای گفتگو درباره موجودی و نیازهای تجاری." },
    values: { tag: "ارزش‌های ما", items: [
      ["خویشتن‌داری", "انتخابی متمرکز، بدون زیاده‌روی ارائه شده."],
      ["شفافیت", "اطلاعات محصول پیش از زبان تبلیغاتی."],
      ["تناسب", "کاتالوگی شکل‌گرفته حول کاربرد و کشف حرفه‌ای."],
      ["گفتگو", "ارتباط مستقیم برای سؤالات محصول و همکاری."],
    ] },
    worlds: { tag: "سه جهت", title: "منتخب حرفه‌ای زیبایی", items: [
      ["مراقبت پوست", "محصولات حرفه‌ای مراقبت و پشتیبانی درمان برای روال‌های مدرن سالن و استودیو."],
      ["آرایش", "اصول رنگ و فرم صورت، منتخب برای هنر، اجرا و ارائه."],
      ["ابزار زیبایی", "ابزار و مواد مصرفی عملی برای ارائه خدمات باثبات و حرفه‌ای."],
    ] },
    who: { tag: "برای چه کسانی", items: [
      ["سالن‌ها و استودیوها", "برای نیازهای اتاق درمان، خرده‌فروشی و خدمات."],
      ["بوتیک‌ها و فروشگاه‌ها", "برای انتخابی متمرکز خرده‌فروشی حرفه‌ای."],
      ["متخصصان زیبایی", "برای کشف محصول و ابزار در کار روزمره."],
    ] },
    cta: { title: "با آنچه کسب‌وکار شما نیاز دارد شروع کنید", sub: "کاتالوگ را مرور کنید یا درخواست متمرکز محصول را برای مدوریا بفرستید." },
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
