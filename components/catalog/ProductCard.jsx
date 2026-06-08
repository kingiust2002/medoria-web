// components/catalog/ProductCard.jsx
"use client";
import { useState } from "react";
import Link from "next/link";
import { imageUrl } from "@/lib/supabase";
import { getTranslations, getCategoryName, CATEGORIES } from "@/lib/i18n";
import { waLink, tgLink, quickInquiryMessage } from "@/lib/whatsapp";
import { priceLabel, isOnRequest, formatPrice } from "@/lib/price";
import { useCompare } from "@/lib/compare";
import { useWishlist } from "@/lib/wishlist";
import QuoteModal from "@/components/product/QuoteModal";
import Icon from "@/components/shared/Icon";
import TiltCard from "@/components/shared/TiltCard";

const BADGE_STYLE = {
  SALE: "bg-brand-pink text-white",
  NEW:  "bg-brand-gradient text-white",
  TOP:  "bg-cyan-600 text-white",
};

export default function ProductCard({ product: p, lang, compact = false, view = "grid", onQuickView }) {
  const t = getTranslations(lang);
  const [copied, setCopied] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const { has, toggle } = useCompare();
  const isCompared = has(p.id);
  const { has: hasWish, toggle: toggleWish } = useWishlist();
  const isWished = hasWish(p.id);
  const wishLabel = { fa: "علاقه‌مندی", ru: "В избранное", tg: "Дӯстдошта", en: "Wishlist" }[lang] || "Wishlist";

  const name = p[`name_${lang}`] || p.name_en || "";
  const desc = p[`description_${lang}`] || p.description_en || "";
  const img  = p.image_url ? imageUrl(p.image_url) : null;
  const catIcon = (CATEGORIES.find((c) => c.slug === p.category) || {}).icon || "package";
  const onRequest = isOnRequest(p);

  const pageUrl = typeof window !== "undefined" ? `${window.location.origin}/${lang}/catalog/${p.slug || p.id}` : `/${lang}/catalog/${p.slug || p.id}`;
  const quickMsg = quickInquiryMessage(p, lang, pageUrl);
  const priceText = onRequest ? priceLabel(p, lang) : `${formatPrice(p.price)} / ${p.unit}`;

  const handleCopy = () => {
    navigator.clipboard?.writeText(`${name} — ${priceText}\n${pageUrl}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleCompare = (e) => { e.preventDefault(); e.stopPropagation(); toggle(p.id); };
  const handleWish = (e) => { e.preventDefault(); e.stopPropagation(); toggleWish(p.id); };
  const handleQuickView = (e) => { e.preventDefault(); e.stopPropagation(); onQuickView?.(p); };

  // ── LIST VIEW ─────────────────────────────────────────────────────────
  if (view === "list") {
    return (
      <>
        {quoteOpen && <QuoteModal product={p} lang={lang} onClose={() => setQuoteOpen(false)} />}
        <article className="card card-hover overflow-hidden flex gap-4 p-3 group">
          <Link href={`/${lang}/catalog/${p.slug || p.id}`}
                className="block relative w-32 h-32 md:w-40 md:h-40 rounded-xl img-ph overflow-hidden shrink-0">
            {img ? (
              <img src={img} alt={name} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="relative w-12 h-12 rounded-xl bg-surface/70 backdrop-blur flex items-center justify-center shadow-soft">
                  <span className="absolute inset-0 rounded-xl bg-brand-gradient opacity-10" />
                  <Icon name={catIcon} size={22} className="relative text-brand-violet/70" strokeWidth={1.5} />
                </span>
              </div>
            )}
            {p.badge && (
              <span className={`absolute top-2 start-2 ${BADGE_STYLE[p.badge]} tag`}>{p.badge}</span>
            )}
          </Link>

          <div className="flex-1 min-w-0 flex flex-col">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <span className="text-[9px] font-bold tracking-[0.14em] gradient-text uppercase">{getCategoryName(p.category, lang)}</span>
              {p.brand && (<><span className="text-ink-faint">·</span><span className="text-[10px] text-ink-muted">{p.brand}</span></>)}
              {p.sku && (<><span className="text-ink-faint">·</span><span className="text-[10px] font-mono text-ink-muted tabular">{p.sku}</span></>)}
            </div>
            <Link href={`/${lang}/catalog/${p.slug || p.id}`}>
              <h3 className="font-semibold text-[15px] text-ink leading-snug mb-1 hover:text-brand-violet transition-colors">{name}</h3>
            </Link>
            <p className="text-[12px] text-ink-muted leading-relaxed line-clamp-2 mb-3">{desc}</p>

            <div className="flex items-center justify-between mt-auto flex-wrap gap-2">
              <div className="flex items-baseline gap-1">
                {onRequest ? (
                  <span className="font-display text-[15px] font-bold gradient-text">{priceLabel(p, lang)}</span>
                ) : (
                  <>
                    <span className="font-display text-xl font-extrabold text-ink leading-none tabular">{formatPrice(p.price)}</span>
                    <span className="text-[11px] text-ink-faint">/ {p.unit}</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                {onQuickView && (
                  <button onClick={handleQuickView}
                    className="w-9 h-9 rounded-lg flex items-center justify-center bg-canvas-soft hover:bg-brand-violet/10 text-ink-muted hover:text-brand-violet transition-colors"
                    title={t.catalog.quickView} aria-label={t.catalog.quickView}>
                    <Icon name="eye" size={16} />
                  </button>
                )}
                <button onClick={handleCompare}
                  className={[
                    "w-9 h-9 rounded-lg flex items-center justify-center transition-colors",
                    isCompared ? "bg-brand-gradient text-white" : "bg-canvas-soft hover:bg-brand-violet/10 text-ink-muted hover:text-brand-violet",
                  ].join(" ")}
                  title={isCompared ? t.product.inCompare : t.product.addToCompare}>
                  <Icon name={isCompared ? "check" : "switchH"} size={16} />
                </button>
                <button onClick={handleWish}
                  className={[
                    "w-9 h-9 rounded-lg flex items-center justify-center transition-colors",
                    isWished ? "bg-accent-gold/15 text-accent-gold" : "bg-canvas-soft hover:bg-accent-gold/10 text-ink-muted hover:text-accent-gold",
                  ].join(" ")}
                  title={wishLabel} aria-label={wishLabel}>
                  <Icon name="star" size={16} fill={isWished ? "currentColor" : "none"} />
                </button>
                <a href={waLink(quickMsg)} target="_blank" rel="noopener noreferrer" className="btn-wa size-sm">
                  <Icon name="chat" size={14} /> WhatsApp
                </a>
                <Link href={`/${lang}/catalog/${p.slug || p.id}`} className="btn-primary size-sm">{t.common.details}</Link>
              </div>
            </div>
          </div>
        </article>
      </>
    );
  }

  // ── GRID VIEW (default) ───────────────────────────────────────────────
  return (
    <>
      {quoteOpen && <QuoteModal product={p} lang={lang} onClose={() => setQuoteOpen(false)} />}

      <TiltCard className="h-full rounded-2xl" max={5}>
      <article className="card card-hover overflow-hidden flex flex-col group h-full">
        {/* Image */}
        <Link href={`/${lang}/catalog/${p.slug || p.id}`} className="block relative aspect-[4/3] img-ph overflow-hidden">
          {img ? (
            <img
              src={img}
              alt={name}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center transition-transform duration-500 group-hover:scale-105">
              <span className="relative w-16 h-16 rounded-2xl bg-surface/70 backdrop-blur flex items-center justify-center shadow-soft">
                <span className="absolute inset-0 rounded-2xl bg-brand-gradient opacity-10" />
                <Icon name={catIcon} size={30} className="relative text-brand-violet/70" strokeWidth={1.5} />
              </span>
            </div>
          )}

          {/* Badge (start) */}
          {p.badge && (
            <span className={`absolute top-3 start-3 ${BADGE_STYLE[p.badge] || "bg-brand-gradient text-white"} tag shadow-soft`}>
              {p.badge}
            </span>
          )}

          {/* Compare button (top end) */}
          <button
            onClick={handleCompare}
            className={[
              "absolute top-3 end-3 w-9 h-9 rounded-full flex items-center justify-center transition-all shadow-soft backdrop-blur",
              isCompared
                ? "bg-brand-gradient text-white scale-105"
                : "bg-surface/90 text-ink-muted hover:bg-surface hover:text-brand-violet opacity-0 group-hover:opacity-100",
            ].join(" ")}
            title={isCompared ? t.product.inCompare : t.product.addToCompare}
            aria-label="Compare"
          >
            <Icon name={isCompared ? "check" : "switchH"} size={16} />
          </button>

          {/* Wishlist button (below compare) */}
          <button
            onClick={handleWish}
            className={[
              "absolute top-[52px] end-3 w-9 h-9 rounded-full flex items-center justify-center transition-all shadow-soft backdrop-blur",
              isWished
                ? "bg-accent-gold/20 text-accent-gold scale-105"
                : "bg-surface/90 text-ink-muted hover:bg-surface hover:text-accent-gold opacity-0 group-hover:opacity-100",
            ].join(" ")}
            title={wishLabel}
            aria-label={wishLabel}
          >
            <Icon name="star" size={16} fill={isWished ? "currentColor" : "none"} />
          </button>

          {/* Quick view button (below wishlist) */}
          {onQuickView && (
            <button
              onClick={handleQuickView}
              className="absolute top-[92px] end-3 w-9 h-9 rounded-full flex items-center justify-center bg-surface/90 text-ink-muted hover:bg-surface hover:text-brand-violet shadow-soft backdrop-blur opacity-0 group-hover:opacity-100 transition-all"
              title={t.catalog.quickView}
              aria-label={t.catalog.quickView}
            >
              <Icon name="eye" size={16} />
            </button>
          )}

          {/* Out of stock overlay */}
          {!p.in_stock && (
            <div className="absolute inset-0 bg-canvas/70 flex items-center justify-center backdrop-blur-[2px]">
              <span className="bg-surface text-[11px] font-bold text-warn px-3 py-1.5 rounded-full border border-warn/30 shadow-soft">
                {t.common.onOrder}
              </span>
            </div>
          )}

          {/* SKU */}
          {p.sku && (
            <span className="absolute bottom-3 end-3 bg-surface/95 backdrop-blur text-[10px] font-mono font-semibold text-ink-muted px-2 py-0.5 rounded-md border border-line tabular">
              {p.sku}
            </span>
          )}
        </Link>

        {/* Content */}
        <div className="p-4 flex-1 flex flex-col">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-[9px] font-bold tracking-[0.14em] gradient-text uppercase">
              {getCategoryName(p.category, lang)}
            </span>
            {p.brand && (
              <>
                <span className="text-ink-faint">·</span>
                <span className="text-[10px] text-ink-faint font-medium">{p.brand}</span>
              </>
            )}
          </div>

          <Link href={`/${lang}/catalog/${p.slug || p.id}`}>
            <h3 className="font-semibold text-[14px] text-ink leading-snug mb-1 hover:text-brand-violet transition-colors">
              {name}
            </h3>
          </Link>

          {!compact && desc && (
            <p className="text-[12px] text-ink-muted leading-relaxed line-clamp-2 mb-3">{desc}</p>
          )}

          {/* Price + stock */}
          <div className="flex items-center justify-between mt-auto mb-3 gap-2">
            <div className="flex items-baseline gap-1 min-w-0">
              {onRequest ? (
                <span className="font-display text-[15px] font-bold gradient-text truncate">{priceLabel(p, lang)}</span>
              ) : (
                <>
                  <span className="font-display text-[22px] font-extrabold text-ink leading-none tabular">{formatPrice(p.price)}</span>
                  <span className="text-[11px] text-ink-faint">/ {p.unit}</span>
                </>
              )}
            </div>
            <span className={`pill shrink-0 ${p.in_stock ? "bg-ok/10 text-ok border border-ok/20" : "bg-warn/10 text-warn border border-warn/20"}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${p.in_stock ? "bg-ok" : "bg-warn"}`} />
              {p.in_stock ? t.common.inStock : t.common.onOrder}
            </span>
          </div>

          {/* Buttons grid */}
          <div className="grid grid-cols-2 gap-1.5">
            <a href={waLink(quickMsg)} target="_blank" rel="noopener noreferrer"
               className="btn-wa h-9 text-[11px] rounded-lg" onClick={(e) => e.stopPropagation()}>
              <Icon name="chat" size={13} />
              {t.common.whatsapp}
            </a>
            <a href={tgLink(quickMsg)} target="_blank" rel="noopener noreferrer"
               className="btn-tg h-9 text-[11px] rounded-lg" onClick={(e) => e.stopPropagation()}>
              <Icon name="send" size={13} />
              {t.common.telegram}
            </a>
            <button onClick={handleCopy} className="btn-ghost h-9 text-[10px] rounded-lg">
              <Icon name={copied ? "check" : "copy"} size={12} />
              {copied ? t.common.copied : t.common.copy}
            </button>
            <button onClick={() => setQuoteOpen(true)}
              className="btn h-9 text-[10px] rounded-lg bg-brand-violet/[0.07] text-brand-violet border border-brand-violet/20 hover:bg-brand-violet/10">
              <Icon name="invoice" size={12} />
              {t.common.requestQuote}
            </button>
          </div>

          <Link
            href={`/${lang}/catalog/${p.slug || p.id}`}
            className="mt-2 flex items-center justify-center gap-1 text-[11px] font-semibold text-brand-violet py-2 rounded-lg border border-brand-violet/20 hover:bg-brand-violet/[0.06] transition-colors"
          >
            {t.common.details} <Icon name={lang === "fa" ? "arrowL" : "arrow"} size={12} />
          </Link>
        </div>
      </article>
      </TiltCard>
    </>
  );
}
