// components/home/CategoryGrid.jsx
import Link from "next/link";
import { getTranslations, CATEGORIES, getCategoryName, getCategoryCount } from "@/lib/i18n";
import Icon from "@/components/shared/Icon";

export default function CategoryGrid({ lang }) {
  const t = getTranslations(lang);

  return (
    <section className="py-14 md:py-20 bg-canvas-soft border-y border-line">
      <div className="container-x">
        <div className="flex items-end justify-between mb-8 md:mb-10 gap-4">
          <div>
            <div className="section-tag mb-2.5">{t.home.catTag}</div>
            <h2 className="section-h">{t.home.catH}</h2>
            <p className="section-sub">{t.home.catSub}</p>
          </div>
          <Link href={`/${lang}/categories`} className="hidden sm:inline-flex items-center gap-1 text-[13px] font-semibold text-primary hover:opacity-80 whitespace-nowrap">
            {t.home.catAll} <Icon name="arrow" size={14} />
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
          {CATEGORIES.map((c) => (
            <Link
              key={c.slug}
              href={`/${lang}/catalog?category=${c.slug}`}
              className="card card-hover overflow-hidden group p-5 text-center"
            >
              <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-tint-blue group-hover:bg-primary group-hover:text-white text-primary flex items-center justify-center transition-colors">
                <Icon name={c.icon} size={28} strokeWidth={1.6} />
              </div>
              <div className="font-semibold text-[13px] md:text-sm text-ink leading-tight mb-1">
                {getCategoryName(c.slug, lang)}
              </div>
              <div className="text-[11px] text-ink-faint">
                {getCategoryCount(c.slug, lang)}
              </div>
            </Link>
          ))}
        </div>

        <Link href={`/${lang}/categories`} className="sm:hidden flex items-center justify-center gap-1 mt-6 text-[13px] font-semibold text-primary">
          {t.home.catAll} <Icon name="arrow" size={14} />
        </Link>
      </div>
    </section>
  );
}
