// app/[lang]/catalog/[slug]/ProductDetailClient.jsx — interactive product detail.
"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { getRelatedProducts } from "@/lib/supabase";
import { getTranslations, getCategoryName } from "@/lib/i18n";
import { waLink, tgLink, productInquiryMessage } from "@/lib/whatsapp";
import { priceLabel, priceLine, isOnRequest, formatPrice } from "@/lib/price";
import { useCompare } from "@/lib/compare";
import { useWishlist } from "@/lib/wishlist";
import ProductCard from "@/components/catalog/ProductCard";
import QuoteModal from "@/components/product/QuoteModal";
import ProductGallery from "@/components/product/ProductGallery";
import StickyQuotePanel from "@/components/product/StickyQuotePanel";
import CompareDrawer from "@/components/catalog/CompareDrawer";
import ProductViewTracker from "@/components/product/ProductViewTracker";
import RecentlyViewed from "@/components/product/RecentlyViewed";
import Icon from "@/components/shared/Icon";
import Breadcrumb from "@/components/shared/Breadcrumb";

const BADGE_STYLE = {
  SALE: "bg-accent-pink text-white",
  NEW:  "bg-primary text-white",
  TOP:  "bg-cyan-600 text-white",
};

export default function ProductDetailClient({ product, lang }) {
  const t = getTranslations(lang);
  const [related, setRelated] = useState([]);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const { has, toggle } = useCompare();
  const { has: hasWish, toggle: toggleWish } = useWishlist();

  useEffect(() => {
    getRelatedProducts(product).then(setRelated);
  }, [product]);

  const name = product[`name_${lang}`] || product.name_en;
  const desc = product[`description_${lang}`] || product.description_en;
  const pageUrl = typeof window !== "undefined" ? window.location.href : "";
  const isCompared = has(product.id);
  const isWished = hasWish(product.id);
  const onRequest = isOnRequest(product);

  const handleCopy = () => {
    navigator.clipboard?.writeText(`${name} — ${priceLine(product, lang)}\n${pageUrl}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const specs = product.specs && typeof product.specs === "object" ? product.specs : null;

  return (
    <>
      <ProductViewTracker id={product.id} />
      {quoteOpen && <QuoteModal product={product} lang={lang} onClose={() => setQuoteOpen(false)} />}

      <div className="bg-canvas-soft min-h-screen">
        {/* Breadcrumb */}
        <div className="bg-canvas border-b border-line">
          <div className="container-x py-3">
            <Breadcrumb
              lang={lang}
              crumbs={[
                { label: t.common.home, href: `/health/${lang}` },
                { label: t.common.catalog, href: `/health/${lang}/catalog` },
                { label: getCategoryName(product.category, lang), href: `/health/${lang}/catalog?category=${product.category}` },
                { label: name },
              ]}
            />
          </div>
        </div>

        <div className="container-x py-8 md:py-12">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12">
            {/* Gallery */}
            <ProductGallery product={product} />

            {/* Info */}
            <div>
              <div className="flex items-center gap-3 mb-3 flex-wrap">
                <Link
                  href={`/health/${lang}/catalog?category=${product.category}`}
                  className="text-[10px] font-bold tracking-[0.16em] gradient-text uppercase hover:opacity-70"
                >
                  {getCategoryName(product.category, lang)}
                </Link>
                {product.brand && (
                  <>
                    <span className="text-ink-faint text-xs">·</span>
                    <Link href={`/health/${lang}/catalog?brand=${encodeURIComponent(product.brand)}`}
                      className="text-[12px] font-semibold text-ink-muted hover:text-brand-violet">
                      {product.brand}
                    </Link>
                  </>
                )}
                {product.badge && (
                  <span className={`ms-auto ${BADGE_STYLE[product.badge] || "bg-primary text-white"} tag`}>
                    {product.badge}
                  </span>
                )}
              </div>

              <h1 className="font-display text-3xl md:text-4xl font-extrabold text-ink tracking-tight leading-tight mb-3">
                {name}
              </h1>

              {desc && <p className="text-[15px] text-ink-muted leading-relaxed mb-5">{desc}</p>}

              {/* Price card */}
              <div className="card p-5 mb-5">
                <div className="flex items-end justify-between gap-4 mb-4">
                  <div>
                    <div className="text-[11px] text-ink-faint mb-1">{t.common.price}</div>
                    {onRequest ? (
                      <div className="font-display text-2xl font-extrabold gradient-text leading-none">
                        {priceLabel(product, lang)}
                      </div>
                    ) : (
                      <div className="flex items-baseline gap-1.5">
                        <span className="font-display text-4xl font-extrabold text-ink leading-none tabular">{formatPrice(product.price)}</span>
                        <span className="text-[13px] text-ink-faint">/ {product.unit}</span>
                      </div>
                    )}
                  </div>
                  <span className={`pill ${product.in_stock ? "bg-ok/10 text-ok border border-ok/20" : "bg-warn/10 text-warn border border-warn/20"}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${product.in_stock ? "bg-ok" : "bg-warn"}`} />
                    {product.in_stock ? t.common.inStock : t.common.onOrder}
                  </span>
                </div>

                <button onClick={() => setQuoteOpen(true)} className="btn-primary size-xl w-full mb-2">
                  <Icon name="invoice" size={18} />
                  {onRequest ? t.common.requestPrice : t.product.requestQuoteFull}
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <a href={waLink(productInquiryMessage(product, lang, { url: pageUrl }))} target="_blank" rel="noopener noreferrer" className="btn-wa size-md">
                    <Icon name="chat" size={15} />
                    {t.product.askWhatsApp}
                  </a>
                  <a href={tgLink(productInquiryMessage(product, lang, { url: pageUrl }))} target="_blank" rel="noopener noreferrer" className="btn-tg size-md">
                    <Icon name="send" size={15} />
                    {t.product.askTelegram}
                  </a>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <button onClick={handleCopy} className="btn-ghost size-sm">
                    <Icon name={copied ? "check" : "copy"} size={13} />
                    {copied ? t.common.copied : t.common.copy}
                  </button>
                  <button
                    onClick={() => toggle(product.id)}
                    className={[
                      "btn size-sm transition-colors",
                      isCompared
                        ? "bg-brand-gradient text-white border border-transparent"
                        : "bg-surface text-ink-muted border border-line hover:border-brand-violet/40 hover:text-brand-violet",
                    ].join(" ")}
                  >
                    <Icon name={isCompared ? "check" : "switchH"} size={13} />
                    {isCompared ? t.product.inCompare : t.product.addToCompare}
                  </button>
                </div>
                <button
                  onClick={() => toggleWish(product.id)}
                  className={[
                    "btn size-sm w-full mt-2 transition-colors",
                    isWished
                      ? "bg-accent-gold/15 text-accent-gold border border-accent-gold/30"
                      : "bg-surface text-ink-muted border border-line hover:border-accent-gold/40 hover:text-accent-gold",
                  ].join(" ")}
                >
                  <Icon name="star" size={14} fill={isWished ? "currentColor" : "none"} />
                  {{ fa: "ذخیره در علاقه‌مندی‌ها", ru: "В избранное", tg: "Ба дӯстдошта", en: "Save to wishlist" }[lang] || "Save to wishlist"}
                </button>
              </div>

              {/* Meta */}
              <dl className="grid grid-cols-2 gap-3 text-[13px]">
                <Meta label={t.product.sku}      value={product.sku || "—"} />
                <Meta label={t.common.unit}      value={product.unit || "—"} />
                <Meta label={t.product.minOrder} value={product.min_order_qty || 1} />
                <Meta label={t.product.category} value={getCategoryName(product.category, lang)} />
              </dl>

              {/* Specifications */}
              {specs && Object.keys(specs).length > 0 && (
                <div className="mt-6">
                  <h2 className="font-display text-lg font-bold text-ink mb-3">{t.product.specs}</h2>
                  <div className="card overflow-hidden">
                    <dl className="divide-y divide-line">
                      {Object.entries(specs).map(([k, v]) => (
                        <div key={k} className="flex justify-between px-4 py-2.5 text-[13px]">
                          <dt className="text-ink-muted">{k}</dt>
                          <dd className="font-semibold text-ink">{String(v)}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </div>
              )}

              {/* Brochure */}
              {product.brochure_url && (
                <a
                  href={product.brochure_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-ghost size-md w-full mt-4"
                >
                  <Icon name="download" size={15} />
                  {t.product.brochure}
                </a>
              )}
            </div>
          </div>

          {/* Related */}
          {related.length > 0 && (
            <div className="mt-16">
              <h2 className="section-h mb-6">{t.product.related}</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-5">
                {related.map((p) => (
                  <ProductCard key={p.id} product={p} lang={lang} compact />
                ))}
              </div>
            </div>
          )}

          {/* Recently viewed */}
          <RecentlyViewed lang={lang} excludeId={product.id} />

          <div className="mt-12">
            <Link href={`/health/${lang}/catalog`} className="text-[13px] font-semibold text-primary hover:opacity-80 inline-flex items-center gap-1">
              <Icon name={lang === "fa" ? "arrow" : "arrowL"} size={14} />
              {t.product.backToCatalog.replace(/[←→]/g, "").trim()}
            </Link>
          </div>
        </div>
      </div>

      {/* Sticky panel + drawer */}
      <StickyQuotePanel product={product} lang={lang} onQuoteClick={() => setQuoteOpen(true)} />
      <CompareDrawer lang={lang} />
    </>
  );
}

function Meta({ label, value }) {
  return (
    <div className="card p-3 flex flex-col">
      <span className="text-[10px] text-ink-faint uppercase tracking-wide mb-0.5">{label}</span>
      <span className="text-[13px] font-semibold text-ink">{value}</span>
    </div>
  );
}
