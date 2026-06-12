// components/home/FeaturedProducts.jsx
"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { getProducts } from "@/lib/supabase";
import { getTranslations } from "@/lib/i18n";
import ProductCard from "@/components/catalog/ProductCard";
import Icon from "@/components/shared/Icon";
import { Reveal } from "@/components/shared/Reveal";

export default function FeaturedProducts({ lang }) {
  const t = getTranslations(lang);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getProducts({ limit: 6 })
      .then((data) => { setProducts(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    // Decorative product-detail preview cards take too much vertical space on
    // mobile — show this section on tablet/desktop only (md+). The catalog stays
    // reachable on mobile via the hero search/CTA, category grid and menu.
    <section className="hidden md:block py-14 md:py-20 bg-canvas border-y border-line">
      <div className="container-x">
        <Reveal className="flex items-end justify-between mb-8 md:mb-10 gap-4">
          <div>
            <div className="section-tag text-cyan-600 mb-2.5">{t.home.featTag}</div>
            <h2 className="section-h">{t.home.featH}</h2>
            <p className="section-sub">{t.home.featSub}</p>
          </div>
          <Link href={`/${lang}/catalog`} className="hidden sm:inline-flex items-center gap-1 text-[13px] font-semibold text-brand-violet hover:opacity-80 whitespace-nowrap">
            {t.home.featAll} <Icon name={lang === "fa" ? "arrowL" : "arrow"} size={14} />
          </Link>
        </Reveal>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card overflow-hidden">
                <div className="aspect-[4/3] skeleton" />
                <div className="p-4 space-y-2">
                  <div className="h-3 skeleton w-1/3" />
                  <div className="h-4 skeleton" />
                  <div className="h-3 skeleton w-3/4" />
                  <div className="h-10 skeleton mt-3 rounded-lg" />
                </div>
              </div>
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-16 text-ink-muted">
            <Icon name="package" size={48} className="text-ink-faint mx-auto mb-3" strokeWidth={1.2} />
            <p className="text-sm">{t.common.noResults}</p>
            <p className="text-xs text-ink-faint mt-2">Add products in Supabase Table Editor</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} lang={lang} />
            ))}
          </div>
        )}

        <div className="mt-10 text-center">
          <Link href={`/${lang}/catalog`} className="btn-primary size-xl">
            {t.home.featAll}
            <Icon name="arrow" size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
}
