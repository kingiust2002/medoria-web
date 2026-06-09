// app/[lang]/categories/page.jsx
"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getTranslations, CATEGORIES, getCategoryName } from "@/lib/i18n";
import Icon from "@/components/shared/Icon";
import TiltCard from "@/components/shared/TiltCard";
import Breadcrumb from "@/components/shared/Breadcrumb";
import PageHeaderVisual from "@/components/shared/PageHeaderVisual";
import SpotlightCard from "@/components/shared/SpotlightCard";
import SplitText from "@/components/shared/SplitText";

export const dynamic = "force-dynamic";

export default function CategoriesPage({ params }) {
  const { lang } = params;
  const t = getTranslations(lang);
  const [counts, setCounts] = useState({});

  useEffect(() => {
    Promise.all(
      CATEGORIES.map((c) =>
        supabase
          .from("products")
          .select("*", { count: "exact", head: true })
          .eq("category", c.slug)
          .then(({ count }) => [c.slug, count || 0])
      )
    ).then((entries) => setCounts(Object.fromEntries(entries)));
  }, []);

  const labelFor = (slug) => {
    const n = counts[slug];
    if (n === undefined) return "…";
    if (n === 0) return lang === "fa" ? "به‌زودی" : lang === "tg" ? "ба зудӣ" : lang === "en" ? "coming soon" : "скоро";
    const noun = {
      ru: n === 1 ? "товар" : "товаров",
      tg: "мол",
      en: n === 1 ? "product" : "products",
      fa: "محصول",
    };
    return `${n} ${noun[lang] || noun.en}`;
  };

  return (
    <div className="bg-canvas-soft min-h-screen">
      <div className="bg-canvas-soft border-b border-line relative overflow-hidden">
        <PageHeaderVisual name="categories-header" light={0.2} dark={0.3} lightFilter="saturate(1.4) contrast(1.25)" darkFilter="saturate(1.25) contrast(1.12) brightness(1.12)" tint={0.12} />
        <div className="blob w-[44vw] h-[44vw] -top-1/3 -end-[6%] animate-aurora"
             style={{ background: "radial-gradient(circle, rgba(139,47,247,0.14) 0%, transparent 70%)" }} />
        <div className="blob w-[34vw] h-[34vw] top-0 start-[10%] animate-aurora"
             style={{ background: "radial-gradient(circle, rgba(6,182,212,0.12) 0%, transparent 70%)", animationDelay: "4s" }} />
        <div className="container-x py-12 md:py-16 relative">
          <Breadcrumb lang={lang} className="mb-4" crumbs={[{ label: t.common.home, href: `/${lang}` }, { label: t.common.categories }]} />
          <div className="eyebrow mb-4"><span className="gradient-text">{t.home.catTag}</span></div>
          <h1 className="section-h-lg mb-3"><SplitText text={t.categories.title} delay={0.1} /></h1>
          <p className="text-base text-ink-muted max-w-xl">{t.categories.subtitle}</p>
        </div>
      </div>

      <div className="container-x py-10 md:py-14">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {CATEGORIES.map((c) => (
            <TiltCard key={c.slug} className="h-full rounded-2xl" max={5}>
            <SpotlightCard className="h-full rounded-2xl">
            <Link
              href={`/${lang}/catalog?category=${c.slug}`}
              className="card card-hover overflow-hidden group flex h-full"
            >
              <div className="w-32 md:w-40 shrink-0 img-ph flex items-center justify-center text-brand-violet group-hover:bg-brand-gradient group-hover:text-white transition-colors">
                <Icon name={c.icon} size={56} strokeWidth={1.3} className="relative" />
              </div>

              <div className="p-5 md:p-6 flex-1 flex flex-col">
                <div className="flex items-baseline justify-between gap-3 mb-2">
                  <h2 className="font-display text-lg md:text-xl font-bold text-ink group-hover:text-brand-violet transition-colors">
                    {getCategoryName(c.slug, lang)}
                  </h2>
                  <span className="text-[11px] text-ink-faint shrink-0">{labelFor(c.slug)}</span>
                </div>
                <p className="text-[13px] text-ink-muted leading-relaxed mb-4 flex-1">
                  {t.categories.details[c.slug]}
                </p>
                <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-violet">
                  {t.categories.viewProducts} <Icon name={lang === "fa" ? "arrowL" : "arrow"} size={12} />
                </span>
              </div>
            </Link>
            </SpotlightCard>
            </TiltCard>
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
