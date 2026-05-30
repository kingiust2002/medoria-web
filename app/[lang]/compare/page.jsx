// app/[lang]/compare/page.jsx
"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useCompare } from "@/lib/compare";
import { supabase, imageUrl } from "@/lib/supabase";
import { getTranslations, getCategoryName } from "@/lib/i18n";
import { waLink, tgLink, productInquiryMessage } from "@/lib/whatsapp";
import { priceLabel, isOnRequest } from "@/lib/price";
import Icon from "@/components/shared/Icon";

export const dynamic = "force-dynamic";

export default function ComparePage({ params }) {
  const { lang } = params;
  const t = getTranslations(lang);
  const { ids, remove, clear } = useCompare();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (ids.length === 0) { setProducts([]); setLoading(false); return; }
    setLoading(true);
    supabase
      .from("products")
      .select("*")
      .in("id", ids)
      .then(({ data }) => {
        // Preserve order from ids
        const ordered = ids.map((id) => data?.find((p) => p.id === id)).filter(Boolean);
        setProducts(ordered);
        setLoading(false);
      });
  }, [ids]);

  // Empty state
  if (!loading && products.length === 0) {
    return (
      <div className="bg-canvas-soft min-h-screen">
        <div className="container-x py-20 text-center max-w-md">
          <div className="w-20 h-20 mx-auto rounded-2xl bg-tint-blue text-primary flex items-center justify-center mb-4"><Icon name="switchH" size={36} /></div>
          <h1 className="font-display text-3xl font-extrabold text-ink mb-3">{t.compare.empty}</h1>
          <p className="text-ink-muted mb-8">{t.compare.emptySub}</p>
          <Link href={`/${lang}/catalog`} className="btn-primary size-lg">
            {t.compare.goCatalog} →
          </Link>
        </div>
      </div>
    );
  }

  // Build comparison rows
  const rows = products.length > 0 ? [
    {
      label: t.product.brand,
      values: products.map((p) => p.brand || "—"),
    },
    {
      label: t.product.sku,
      values: products.map((p) => p.sku || "—"),
    },
    {
      label: t.common.price,
      values: products.map((p) => priceLabel(p, lang)),
      highlight: "min",
    },
    {
      label: t.common.unit,
      values: products.map((p) => p.unit),
    },
    {
      label: t.product.minOrder,
      values: products.map((p) => p.min_order_qty || 1),
    },
    {
      label: t.product.category,
      values: products.map((p) => getCategoryName(p.category, lang)),
    },
    {
      label: t.common.inStock,
      values: products.map((p) => p.in_stock ? "✓" : "✗"),
    },
  ] : [];

  // Find min price index (on-request items never win "best price")
  const priceOf = (p) => (isOnRequest(p) ? Infinity : Number(p.price));
  const hasAnyPriced = products.some((p) => !isOnRequest(p));
  const minPriceIdx = products.reduce((min, p, i) => (priceOf(p) < priceOf(products[min]) ? i : min), 0);

  return (
    <div className="bg-canvas-soft min-h-screen">
      {/* Header */}
      <div className="bg-white border-b border-line">
        <div className="container-x py-6">
          <nav className="text-[11px] text-ink-muted mb-3 flex items-center gap-2">
            <Link href={`/${lang}`} className="hover:text-primary">{t.common.home}</Link>
            <span className="text-line">/</span>
            <Link href={`/${lang}/catalog`} className="hover:text-primary">{t.common.catalog}</Link>
            <span className="text-line">/</span>
            <span className="text-primary font-semibold">{t.compare.title}</span>
          </nav>
          <div className="flex items-end justify-between gap-4 flex-wrap">
            <div>
              <h1 className="font-display text-3xl md:text-4xl font-extrabold text-ink tracking-tight mb-1">
                {t.compare.title}
              </h1>
              <p className="text-[14px] text-ink-muted">{t.compare.subtitle}</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={clear} className="btn-ghost size-md text-warn border-warn/20 hover:border-warn/40">
                {t.compare.clear}
              </button>
              <Link href={`/${lang}/catalog`} className="btn-primary size-md">
                + {t.compare.goCatalog}
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Comparison table */}
      <div className="container-x py-8 md:py-10">
        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: ids.length || 2 }).map((_, i) => (
              <div key={i} className="card p-4 space-y-2">
                <div className="aspect-square skeleton" />
                <div className="h-4 skeleton" />
                <div className="h-3 skeleton w-3/4" />
              </div>
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0 pb-4">
            {/* Product cards row */}
            <div className={`grid gap-3 mb-1 min-w-fit`} style={{ gridTemplateColumns: `140px repeat(${products.length}, minmax(200px, 1fr))` }}>
              <div /> {/* Label column header */}
              {products.map((p) => {
                const name = p[`name_${lang}`] || p.name_en;
                return (
                  <div key={p.id} className="card p-4 relative">
                    <button
                      onClick={() => remove(p.id)}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-canvas-soft hover:bg-warn/10 hover:text-warn text-ink-muted flex items-center justify-center transition-colors"
                      aria-label="Remove"
                    ><Icon name="close" size={15} /></button>

                    <Link href={`/${lang}/catalog/${p.slug || p.id}`} className="block">
                      <div className="aspect-square rounded-xl overflow-hidden bg-gradient-to-br from-tint-blue to-tint-cyan mb-3">
                        {p.image_url ? (
                          <img src={imageUrl(p.image_url)} alt={name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-primary/40"><Icon name="package" size={40} strokeWidth={1.2} /></div>
                        )}
                      </div>
                      <h3 className="text-[13px] font-semibold text-ink leading-snug line-clamp-2 hover:text-primary transition-colors mb-2">
                        {name}
                      </h3>
                    </Link>

                    {/* Quick CTAs */}
                    <div className="grid grid-cols-2 gap-1.5 mt-2">
                      <a href={waLink(productInquiryMessage(p, lang))} target="_blank" rel="noopener noreferrer" className="btn-wa h-8 text-[10px] rounded-md"><Icon name="chat" size={14} /></a>
                      <a href={tgLink(productInquiryMessage(p, lang))} target="_blank" rel="noopener noreferrer" className="btn-tg h-8 text-[10px] rounded-md"><Icon name="send" size={14} /></a>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Comparison rows */}
            <div className="card overflow-hidden">
              {rows.map((row, ri) => (
                <div
                  key={ri}
                  className={`grid gap-3 px-3 py-3 min-w-fit ${ri % 2 === 0 ? "bg-canvas-soft/60" : "bg-white"} ${ri > 0 ? "border-t border-line" : ""}`}
                  style={{ gridTemplateColumns: `140px repeat(${products.length}, minmax(200px, 1fr))` }}
                >
                  <div className="text-[11px] font-semibold text-ink-muted uppercase tracking-wide self-center">
                    {row.label}
                  </div>
                  {row.values.map((val, i) => {
                    const isMin = row.highlight === "min" && i === minPriceIdx && products.length > 1 && hasAnyPriced && !isOnRequest(products[i]);
                    return (
                      <div
                        key={i}
                        className={[
                          "text-[13px] self-center px-2",
                          isMin ? "font-bold text-ok" : "text-ink",
                        ].join(" ")}
                      >
                        {val}
                        {isMin && <span className="ml-1.5 text-[9px] bg-ok/10 text-ok px-1.5 py-0.5 rounded uppercase">best</span>}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-8 text-center">
          <Link href={`/${lang}/catalog`} className="text-[13px] font-semibold text-primary hover:opacity-80">
            ← {t.common.catalog}
          </Link>
        </div>
      </div>
    </div>
  );
}
