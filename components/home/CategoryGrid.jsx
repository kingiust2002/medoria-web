// components/home/CategoryGrid.jsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCategories, getProducts } from "@/lib/supabase";
import { getTranslations } from "@/lib/i18n";
import { buildHealthCategoryTree, healthCategoryName, rollupHealthCategoryCounts } from "@/lib/health/categories";
import Icon from "@/components/shared/Icon";
import { Reveal, Stagger, StaggerItem } from "@/components/shared/Reveal";
import TiltCard from "@/components/shared/TiltCard";
import SpotlightCard from "@/components/shared/SpotlightCard";

function labelFor(count, lang) {
  if (count == null) return "…";
  if (count === 0) return lang === "fa" ? "به‌زودی" : lang === "tg" ? "ба зудӣ" : lang === "en" ? "coming soon" : "скоро";
  const noun = { ru: count === 1 ? "товар" : "товаров", tg: "мол", en: count === 1 ? "product" : "products", fa: "محصول" };
  return `${count} ${noun[lang] || noun.en}`;
}

export default function CategoryGrid({ lang }) {
  const t = getTranslations(lang);
  const [categories, setCategories] = useState([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getCategories(), getProducts()]).then(([rows, products]) => {
      if (cancelled) return;
      const tree = buildHealthCategoryTree(rows, { activeOnly: true });
      const counts = new Map();
      for (const product of products) {
        if (product.category_id != null) {
          const key = String(product.category_id);
          counts.set(key, (counts.get(key) || 0) + 1);
        } else if (product.category) {
          const key = `slug:${product.category}`;
          counts.set(key, (counts.get(key) || 0) + 1);
        }
      }
      rollupHealthCategoryCounts(tree, counts);
      setCategories(tree.slice(0, 6));
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);

  const placeholders = Array.from({ length: 6 }, (_, index) => ({ id: `loading-${index}`, loading: true }));

  return (
    <section className="py-14 md:py-20 bg-canvas-soft border-y border-line">
      <div className="container-x">
        <Reveal className="flex items-end justify-between mb-8 md:mb-10 gap-4">
          <div>
            <div className="section-tag mb-2.5">{t.home.catTag}</div>
            <h2 className="section-h">{t.home.catH}</h2>
            <p className="section-sub">{t.home.catSub}</p>
          </div>
          <Link href={`/health/${lang}/categories`} className="hidden sm:inline-flex items-center gap-1 text-[13px] font-semibold text-brand-violet hover:opacity-80 whitespace-nowrap">
            {t.home.catAll} <Icon name={lang === "fa" ? "arrowL" : "arrow"} size={14} />
          </Link>
        </Reveal>

        <Stagger className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
          {(loaded ? categories : placeholders).map((category) => (
            <StaggerItem key={category.id || category.slug}>
              <TiltCard className="h-full rounded-2xl" max={8}>
                <SpotlightCard className="h-full rounded-2xl">
                  {category.loading ? (
                    <div className="card p-5 h-full"><div className="w-14 h-14 mx-auto mb-3 rounded-2xl skeleton" /><div className="h-4 skeleton mb-2" /><div className="h-3 skeleton w-2/3 mx-auto" /></div>
                  ) : (
                    <Link href={`/health/${lang}/categories#${category.slug}`} className="card card-hover overflow-hidden group p-5 text-center block h-full">
                      <div className="relative w-14 h-14 mx-auto mb-3 rounded-2xl bg-brand-violet/[0.08] text-brand-violet flex items-center justify-center transition-all duration-300 group-hover:text-white group-hover:shadow-brand group-hover:-translate-y-0.5">
                        <span className="absolute inset-0 rounded-2xl bg-brand-gradient opacity-0 group-hover:opacity-100 transition-opacity" />
                        <Icon name={category.icon || "layers"} size={28} strokeWidth={1.6} className="relative" />
                      </div>
                      <div className="font-semibold text-[13px] md:text-sm text-ink leading-tight mb-1 group-hover:text-brand-violet transition-colors">{healthCategoryName(category, lang)}</div>
                      <div className="text-[11px] text-ink-faint">{labelFor(category.total_count || 0, lang)}</div>
                    </Link>
                  )}
                </SpotlightCard>
              </TiltCard>
            </StaggerItem>
          ))}
        </Stagger>

        <Link href={`/health/${lang}/categories`} className="sm:hidden flex items-center justify-center gap-1 mt-6 text-[13px] font-semibold text-primary">
          {t.home.catAll} <Icon name="arrow" size={14} />
        </Link>
      </div>
    </section>
  );
}
