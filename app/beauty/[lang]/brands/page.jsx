// app/beauty/[lang]/brands/page.jsx — «MAISONS»: the Medoria Beauty brand
// directory. A cinematic CSS motion header (navy→copper→champagne pan + silk
// streak, reduced-motion-safe) over a refined grid of brand houses read live
// from beauty_brands (migration 11). Each tile shows the OFFICIAL logo the
// operator uploaded — or a clean monogram placeholder when none is set yet.
// Nothing here scrapes or fabricates a brand mark. Clicking a house opens the
// catalog filtered to that brand. Server-rendered, crawlable; honest "opening
// soon" state before any brand is published.
import Link from "next/link";
import { LOCALES } from "@/lib/i18n";
import { getBeautyTranslations } from "@/components/beauty/i18n";
import { getBeautyBrandDirectory, beautyBrandLogoUrl } from "@/lib/beauty/catalog";
import { waLink, tgLink, bulkInquiryMessage } from "@/lib/whatsapp";
import Icon from "@/components/shared/Icon";
import Breadcrumb from "@/components/shared/Breadcrumb";
import { Reveal, Stagger, StaggerItem } from "@/components/shared/Reveal";

export const dynamic = "force-dynamic";

const COPY = {
  tg: {
    title: "Хонаҳое, ки пешниҳод мекунем",
    sub: "Интихоби андешидашудаи брендҳои касбӣ. Мавҷудӣ ҳангоми дархост мустақим тасдиқ мешавад.",
    soonTitle: "Брендҳо ба зудӣ",
    soonSub: "Бигӯед кадом брендро меҷӯед — мо имконот ва қадами баъдиро тасдиқ мекунем.",
    view: "Дидани маҳсулот",
    note: "Мавҷудии бренд мустақим тасдиқ мешавад.",
    ask: "Гуфтугӯро оғоз кунед",
  },
  ru: {
    title: "Дома, которые мы представляем",
    sub: "Продуманный выбор профессиональных брендов. Наличие подтверждается напрямую при запросе.",
    soonTitle: "Бренды скоро",
    soonSub: "Напишите, какой бренд вы ищете — мы подтвердим варианты и следующий шаг.",
    view: "Смотреть товары",
    note: "Наличие бренда подтверждается напрямую.",
    ask: "Начать диалог",
  },
  en: {
    title: "The houses we carry",
    sub: "A considered selection of professional brands. Availability is confirmed directly on inquiry.",
    soonTitle: "Brands opening soon",
    soonSub: "Tell us which house you are looking for — we'll confirm the options and the next step.",
    view: "View products",
    note: "Brand availability is confirmed directly.",
    ask: "Start a conversation",
  },
  fa: {
    title: "خانه‌هایی که ارائه می‌کنیم",
    sub: "انتخابی سنجیده از برندهای حرفه‌ای. موجودی هنگام استعلام مستقیماً تأیید می‌شود.",
    soonTitle: "برندها به‌زودی",
    soonSub: "بگویید دنبال کدام برند هستید — گزینه‌ها و قدم بعدی را تأیید می‌کنیم.",
    view: "دیدن محصولات",
    note: "موجودی برند مستقیماً تأیید می‌شود.",
    ask: "شروع گفتگو",
  },
};

export async function generateMetadata({ params }) {
  const { lang } = params;
  if (!LOCALES.includes(lang)) return {};
  const c = COPY[lang] || COPY.en;
  const t = getBeautyTranslations(lang);
  return {
    title: `${t.nav.brands} — ${t.common.brand}`,
    description: c.sub,
    robots: lang === "fa" ? { index: false, follow: true } : undefined,
  };
}

function taglineFor(b, lang) {
  return b[`tagline_${lang}`] || b.tagline_en || "";
}

// Two-letter monogram for brands without an uploaded logo (placeholder, never a
// fabricated mark).
function monogram(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "•";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export default async function BeautyBrandsPage({ params }) {
  const { lang } = params;
  const t = getBeautyTranslations(lang);
  const c = COPY[lang] || COPY.en;
  const arrow = lang === "fa" ? "arrowL" : "arrow";
  const brands = await getBeautyBrandDirectory();

  return (
    <div className="bg-canvas-soft min-h-screen">
      {/* Cinematic motion header */}
      <section className="relative overflow-hidden border-b border-line">
        <div className="brand-hero absolute inset-0" aria-hidden="true" />
        <div className="brand-hero-streak" aria-hidden="true" />
        <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/10 to-black/25" />
        <div aria-hidden="true" className="absolute inset-x-10 bottom-0 h-px opacity-70"
          style={{ background: "linear-gradient(90deg, transparent, var(--v-champagne), transparent)" }} />
        <div className="container-x relative py-16 md:py-24">
          <Breadcrumb lang={lang} className="mb-4 [&_*]:!text-white/70" crumbs={[{ label: t.nav.home, href: `/beauty/${lang}` }, { label: t.nav.brands }]} />
          <div className="text-[11px] font-bold tracking-[0.32em] text-[color:#F3DCBE] mb-3" dir="ltr">MAISONS</div>
          <h1 className="bv-display text-4xl md:text-6xl text-white leading-[1.08] mb-4 max-w-3xl">{c.title}</h1>
          <p className="text-[14px] md:text-lg text-white/85 leading-relaxed max-w-2xl">{c.sub}</p>
        </div>
      </section>

      <div className="container-x py-12 md:py-16">
        {brands.length === 0 ? (
          // Honest pre-launch state — no fabricated placeholder tiles.
          <div className="relative overflow-hidden rounded-[2rem] border border-line bg-surface p-8 md:p-14 text-center max-w-2xl mx-auto">
            <div aria-hidden="true" className="absolute inset-0 pointer-events-none img-ph opacity-50" />
            <div className="relative">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-brand-violet/[0.08] text-brand-violet grid place-items-center mb-4">
                <Icon name="award" size={30} strokeWidth={1.3} />
              </div>
              <h2 className="section-h mb-3">{c.soonTitle}</h2>
              <p className="text-[14px] md:text-[15px] text-ink-muted leading-relaxed mb-7">{c.soonSub}</p>
              <div className="flex flex-wrap gap-3 justify-center">
                <a href={waLink(bulkInquiryMessage(lang))} target="_blank" rel="noopener noreferrer" className="btn-wa size-lg">
                  <Icon name="chat" size={16} /> WhatsApp
                </a>
                <a href={tgLink(bulkInquiryMessage(lang))} target="_blank" rel="noopener noreferrer" className="btn-tg size-lg">
                  <Icon name="send" size={16} /> Telegram
                </a>
              </div>
            </div>
          </div>
        ) : (
          <>
            <Stagger className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
              {brands.map((b) => {
                const logo = beautyBrandLogoUrl(b.logo_url);
                const tag = taglineFor(b, lang);
                return (
                  <StaggerItem key={b.id ?? b.slug}>
                    <Link
                      href={`/beauty/${lang}/catalog?brand=${encodeURIComponent(b.name)}`}
                      className="group card card-hover bv-sheen h-full flex flex-col items-center justify-center text-center p-5 md:p-7 min-h-[168px] md:min-h-[196px]"
                    >
                      <div className="grid place-items-center w-full h-16 md:h-20 mb-3">
                        {logo ? (
                          <img src={logo} alt={b.name} loading="lazy" className="max-h-full max-w-[80%] object-contain transition-transform duration-300 group-hover:scale-[1.04]" />
                        ) : (
                          <span className="grid place-items-center w-14 h-14 rounded-full border border-[color:var(--v-copper)]/40 text-[color:var(--v-copper)] font-display text-lg tracking-wide transition-colors group-hover:bg-[color:var(--v-copper)]/[0.08]" dir="ltr">
                            {monogram(b.name)}
                          </span>
                        )}
                      </div>
                      <div className="font-display font-semibold text-[15px] md:text-base text-ink group-hover:text-brand-violet transition-colors" dir="ltr">
                        {b.name}
                      </div>
                      {tag && <p className="text-[11px] text-ink-muted leading-snug mt-1 line-clamp-2">{tag}</p>}
                      <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-violet opacity-0 group-hover:opacity-100 transition-opacity">
                        {c.view} <Icon name={arrow} size={12} />
                      </span>
                    </Link>
                  </StaggerItem>
                );
              })}
            </Stagger>

            <Reveal className="mt-10 text-center">
              <p className="text-[12px] text-ink-faint">{c.note}</p>
            </Reveal>
          </>
        )}

        {/* Hand-off */}
        <div className="mt-14 text-center">
          <Link href={`/beauty/${lang}/contact`} className="btn-primary size-lg">
            {c.ask} <Icon name={arrow} size={15} />
          </Link>
        </div>
      </div>
    </div>
  );
}
