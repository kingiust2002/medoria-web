// app/[lang]/categories/page.jsx
import Link from "next/link";
import { getTranslations, CATEGORIES, getCategoryName, getCategoryCount } from "@/lib/i18n";
import Icon from "@/components/shared/Icon";

export async function generateMetadata({ params }) {
  const { lang } = params;
  const t = getTranslations(lang);
  return {
    title: `${t.categories.title} — Medoria`,
    description: t.categories.subtitle,
  };
}

export default function CategoriesPage({ params }) {
  const { lang } = params;
  const t = getTranslations(lang);

  return (
    <div className="bg-canvas-soft min-h-screen">
      {/* Hero */}
      <div className="bg-white border-b border-line relative overflow-hidden">
        <div className="absolute -top-1/2 right-0 w-[40vw] h-[40vw] rounded-full pointer-events-none"
             style={{ background: "radial-gradient(circle, rgba(37,99,235,0.05) 0%, transparent 70%)" }} />
        <div className="container-x py-12 md:py-16 relative">
          <nav className="text-[11px] text-ink-muted mb-3 flex items-center gap-2">
            <Link href={`/${lang}`} className="hover:text-primary">{t.common.home}</Link>
            <span className="text-line">/</span>
            <span className="text-primary font-semibold">{t.common.categories}</span>
          </nav>
          <div className="section-tag mb-3">{t.home.catTag}</div>
          <h1 className="section-h-lg mb-3">{t.categories.title}</h1>
          <p className="text-base text-ink-muted max-w-xl">{t.categories.subtitle}</p>
        </div>
      </div>

      {/* Categories list */}
      <div className="container-x py-10 md:py-14">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {CATEGORIES.map((c) => (
            <Link
              key={c.slug}
              href={`/${lang}/catalog?category=${c.slug}`}
              className="card card-hover overflow-hidden group flex"
            >
              <div className="w-32 md:w-40 shrink-0 bg-tint-blue flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-colors">
                <Icon name={c.icon} size={56} strokeWidth={1.3} />
              </div>

              <div className="p-5 md:p-6 flex-1 flex flex-col">
                <div className="flex items-baseline justify-between gap-3 mb-2">
                  <h2 className="font-display text-lg md:text-xl font-bold text-ink group-hover:text-primary transition-colors">
                    {getCategoryName(c.slug, lang)}
                  </h2>
                  <span className="text-[11px] text-ink-faint shrink-0">{getCategoryCount(c.slug, lang)}</span>
                </div>
                <p className="text-[13px] text-ink-muted leading-relaxed mb-4 flex-1">
                  {t.categories.details[c.slug]}
                </p>
                <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary">
                  {t.categories.viewProducts} <Icon name="arrow" size={12} />
                </span>
              </div>
            </Link>
          ))}
        </div>

        <div className="mt-14 text-center">
          <p className="text-[14px] text-ink-muted mb-4">
            {lang === "fa" ? "نمی‌توانید آنچه را که می‌خواهید پیدا کنید؟" :
             lang === "tg" ? "Чизи лозимиро ёфта наметавонед?" :
             lang === "en" ? "Can't find what you're looking for?" : "Не нашли нужное?"}
          </p>
          <Link href={`/${lang}/contact`} className="btn-primary size-lg">
            {t.common.contactUs} <Icon name="arrow" size={15} />
          </Link>
        </div>
      </div>
    </div>
  );
}
