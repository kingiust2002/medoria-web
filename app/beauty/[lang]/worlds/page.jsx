// app/beauty/[lang]/worlds/page.jsx — «The Edit»: the three Beauty worlds as a
// short editorial spread (magazine, not shop). Each world is one full-bleed
// mood banner — Stitch-generated brand imagery (no people, no logos, no text
// baked in) + a serif line + a quiet hand-off into the real catalog filtered
// to that world. Server-rendered and crawlable; the only motion is a CSS-only
// slow drift (edit-drift, reduced-motion-safe) and the shared Reveal fades.
import Link from "next/link";
import { LOCALES } from "@/lib/i18n";
import { getBeautyTranslations, BEAUTY_CATEGORIES, getCategoryName } from "@/components/beauty/i18n";
import Icon from "@/components/shared/Icon";
import Breadcrumb from "@/components/shared/Breadcrumb";
import SplitText from "@/components/shared/SplitText";
import { Reveal } from "@/components/shared/Reveal";

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

// Editorial copy only — mood language, no efficacy/authenticity/logistics
// claims (brand law). «дунё/дنیا/world» wording is intentional: the owner
// keeps the "worlds" idea; THE EDIT stays a Latin micro-label per locale law.
const COPY = {
  tg: {
    title: "Се ҷаҳони зебоӣ",
    sub: "Нигоҳубини пӯст, ороиш ва абзорҳои касбӣ — ҳар яке ҷаҳони худ, бо равшанӣ ва назокат.",
    explore: "Дидани ин ҷаҳон",
    askTitle: "Чизи мушаххасе меҷӯед?",
    worlds: {
      skincare: { title: "Бофт ва нур.", line: "Ҷаҳони нигоҳубини касбӣ — ором, бе ғавғо." },
      makeup: { title: "Ранг, андешида.", line: "Пигмент ва дақиқӣ барои ҳунари касбӣ — ранг ҳамчун сохтор, на ғавғо." },
      tools: { title: "Дақиқӣ дар тарҳ.", line: "Меъмории оини зебоӣ — абзорҳои амалӣ барои кори ҳамвор ва покиза." },
    },
  },
  ru: {
    title: "Три мира красоты",
    sub: "Уход, макияж и профессиональные инструменты — каждый как отдельный мир, с ясностью и сдержанностью.",
    explore: "Смотреть этот мир",
    askTitle: "Ищете что-то конкретное?",
    worlds: {
      skincare: { title: "Текстура и свет.", line: "Мир профессионального ухода — спокойно, без шума." },
      makeup: { title: "Цвет, продуманно.", line: "Пигмент и точность для профессионального мастерства — цвет как структура, а не шум." },
      tools: { title: "Точность в замысле.", line: "Архитектура ритуала — практичные инструменты для ровной, аккуратной работы." },
    },
  },
  en: {
    title: "Three worlds of beauty",
    sub: "Skincare, makeup and professional tools — each its own world, seen with clarity and restraint.",
    explore: "Explore this world",
    askTitle: "Looking for something specific?",
    worlds: {
      skincare: { title: "Texture and light.", line: "A world of professional care — presented calmly, without noise." },
      makeup: { title: "Colour, considered.", line: "Pigment and precision for professional artistry — colour as structure, not noise." },
      tools: { title: "Precision, by design.", line: "The architecture of the ritual — practical tools for consistent, polished work." },
    },
  },
  fa: {
    title: "سه دنیای زیبایی",
    sub: "مراقبت پوست، آرایش و ابزار حرفه‌ای — هر یک دنیایی جدا، با شفافیت و خویشتن‌داری.",
    explore: "دیدن این دنیا",
    askTitle: "دنبال چیز خاصی هستید؟",
    worlds: {
      skincare: { title: "بافت و نور.", line: "دنیای مراقبت حرفه‌ای — آرام و بی‌هیاهو." },
      makeup: { title: "رنگ، سنجیده.", line: "رنگ‌دانه و دقت برای هنر حرفه‌ای — رنگ همچون ساختار، نه شلوغی." },
      tools: { title: "دقت، در طراحی.", line: "معماریِ آیین زیبایی — ابزارهای کاربردی برای کاری یکدست و پاکیزه." },
    },
  },
};

// Center-safe focal point per image (tools is a 1:1 source inside wide crops).
const IMG = {
  skincare: { src: "/beauty/edit/edit-skincare.webp", pos: "50% 55%" },
  makeup: { src: "/beauty/edit/edit-makeup.webp", pos: "50% 50%" },
  tools: { src: "/beauty/edit/edit-tools.webp", pos: "50% 45%" },
};

export async function generateMetadata({ params }) {
  const { lang } = params;
  if (!LOCALES.includes(lang)) return {};
  const c = COPY[lang] || COPY.en;
  const t = getBeautyTranslations(lang);
  return {
    title: `${c.title} — ${t.common.brand}`,
    description: c.sub,
    robots: lang === "fa" ? { index: false, follow: true } : undefined,
  };
}

export default function BeautyWorldsPage({ params }) {
  const { lang } = params;
  const t = getBeautyTranslations(lang);
  const c = COPY[lang] || COPY.en;
  const arrow = lang === "fa" ? "arrowL" : "arrow";

  return (
    <div className="bg-canvas-soft min-h-screen">
      {/* Header */}
      <div className="bg-canvas-soft border-b border-line relative overflow-hidden">
        <div aria-hidden="true" className="absolute inset-0 pointer-events-none" style={{
          background: "radial-gradient(50% 60% at 85% 0%, var(--v-glow), transparent 60%), radial-gradient(40% 50% at 8% 100%, rgba(28,41,81,0.07), transparent 60%)",
        }} />
        <div className="container-x pt-12 md:pt-16 pb-14 md:pb-20 relative">
          <Breadcrumb lang={lang} className="mb-4" crumbs={[{ label: t.nav.home, href: `/beauty/${lang}` }, { label: t.nav.worlds }]} />
          {/* Latin micro-label (locale law) — the editorial signature */}
          <div className="section-tag mb-4" dir="ltr">THE EDIT</div>
          <h1 className="bv-display section-h-lg mb-3 leading-[1.15] pb-1"><SplitText text={c.title} delay={0.1} /></h1>
          <p className="text-base md:text-lg text-ink-muted max-w-xl leading-relaxed">{c.sub}</p>
        </div>
      </div>

      {/* The three worlds — full-bleed editorial banners */}
      <div className="container-x py-10 md:py-16 space-y-8 md:space-y-12">
        {BEAUTY_CATEGORIES.map((cat, i) => {
          const w = c.worlds[cat.slug] || {};
          const img = IMG[cat.slug];
          const name = getCategoryName(cat.slug, lang);
          const end = i % 2 === 1; // alternate the text side for magazine rhythm
          return (
            <Reveal key={cat.slug} delay={0.05}>
              <Link
                href={`/beauty/${lang}/catalog?world=${cat.slug}`}
                className="group relative block overflow-hidden rounded-[2rem] shadow-card bv-sheen aspect-[4/5] sm:aspect-[16/9] xl:aspect-[21/10] bg-navy"
              >
                {/* Mood image — CSS-only slow drift, static under reduced motion */}
                <img
                  src={img.src}
                  alt={name}
                  loading={i === 0 ? "eager" : "lazy"}
                  fetchPriority={i === 0 ? "high" : undefined}
                  className="edit-drift absolute inset-0 w-full h-full object-cover"
                  style={{ objectPosition: img.pos }}
                />
                {/* Legibility scrim (works in both themes — text sits on image) */}
                <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-transparent" />
                {/* Thin brand hairline at the top edge */}
                <div aria-hidden="true" className="absolute inset-x-10 top-0 h-px opacity-70"
                  style={{ background: "linear-gradient(90deg, transparent, var(--v-copper), transparent)" }} />

                {/* Editorial index */}
                <div className="absolute top-5 end-6 text-[11px] font-semibold tracking-[0.3em] text-white/60 tabular" dir="ltr">
                  {String(i + 1).padStart(2, "0")}
                </div>

                {/* Text block — bottom-start / bottom-end alternating */}
                <div className={`absolute inset-x-0 bottom-0 p-6 sm:p-9 md:p-12 flex ${end ? "justify-end text-end" : "justify-start text-start"}`}>
                  <div className="max-w-md">
                    <div className="text-[10px] font-bold tracking-[0.22em] uppercase text-[color:#EFC894] mb-2.5">
                      {name}
                    </div>
                    <h2 className="bv-display text-3xl sm:text-4xl md:text-[2.75rem] text-white leading-[1.08] mb-3">
                      {w.title}
                    </h2>
                    <p className="text-[13px] sm:text-[14px] text-white/80 leading-relaxed mb-5">
                      {w.line}
                    </p>
                    <span className="inline-flex items-center gap-2 h-11 px-5 rounded-2xl text-[13px] font-semibold text-white border border-white/35 backdrop-blur-sm bg-white/[0.06] transition-colors group-hover:bg-white/15 group-hover:border-white/55">
                      {c.explore}
                      <Icon name={arrow} size={14} />
                    </span>
                  </div>
                </div>
              </Link>
            </Reveal>
          );
        })}
      </div>

      {/* Hand-off */}
      <div className="container-x pb-14 md:pb-20 text-center">
        <p className="text-[14px] text-ink-muted mb-4">{c.askTitle}</p>
        <Link href={`/beauty/${lang}/contact`} className="btn-primary size-lg">
          {t.common.contactUs} <Icon name={arrow} size={15} />
        </Link>
      </div>
    </div>
  );
}
