// components/catalog/ProductCard.jsx
"use client";
import { useState } from "react";
import Link from "next/link";
import { imageUrl } from "@/lib/supabase";
import { getTranslations, getCategoryName, CATEGORIES } from "@/lib/i18n";
import { waLink, tgLink, quickInquiryMessage } from "@/lib/whatsapp";
import { useCompare } from "@/lib/compare";
import QuoteModal from "@/components/product/QuoteModal";
import Icon from "@/components/shared/Icon";

const BADGE_STYLE = {
  SALE: "bg-accent-pink text-white",
  NEW:  "bg-primary text-white",
  TOP:  "bg-cyan-600 text-white",
};

export default function ProductCard({ product: p, lang, compact = false, view = "grid" }) {
  const t = getTranslations(lang);
  const [copied, setCopied] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const { has, toggle } = useCompare();
  const isCompared = has(p.id);

  const name = p[`name_${lang}`] || p.name_en || "";
  const desc = p[`description_${lang}`] || p.description_en || "";
  const img  = p.image_url ? imageUrl(p.image_url) : null;

  const pageUrl = typeof window !== "undefined" ? `${window.location.origin}/${lang}/catalog/${p.id}` : `/${lang}/catalog/${p.id}`;
  const quickMsg = quickInquiryMessage(p, lang, pageUrl);

  const handleCopy = () => {
    navigator.clipboard?.writeText(`${name} — $${p.price} / ${p.unit}\n${pageUrl}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const handleCompare = (e) => { e.preventDefault(); e.stopPropagation(); toggle(p.id); };

  // ── LIST VIEW ─────────────────────────────────────────────────────────
  if (view === "list") {
    return (
      <>
        {quoteOpen && <QuoteModal product={p} lang={lang} onClose={() => setQuoteOpen(false)} />}
        <article className="card card-hover overflow-hidden flex gap-4 p-3 group">
          <Link href={`/${lang}/catalog/${p.id}`}
                className="block relative w-32 h-32 md:w-40 md:h-40 rounded-xl bg-tint-blue overflow-hidden shrink-0">
            {img ? (
              <img src={img} alt={name} className="w-full h-full object-cover" loading="lazy" />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-tint-blue to-tint-cyan flex items-center justify-center">
                <Icon name={CATEGORIES.find((c) => c.slug === p.category)?.icon || "package"} size={40} className="text-primary/30" strokeWidth={1.2} />
              </div>
            )}
            {p.badge && (
              <span className={`absolute top-2 left-2 ${BADGE_STYLE[p.badge]} tag`}>{p.badge}</span>
            )}
          </Link>

          <div className="flex-1 min-w-0 flex flex-col">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[9px] font-bold tracking-[0.14em] text-primary uppercase">{getCategoryName(p.category, lang)}</span>
              {p.brand && (<><span className="text-ink-faint">·</span><span className="text-[10px] text-ink-muted">{p.brand}</span></>)}
              {p.sku && (<><span className="text-ink-faint">·</span><span className="text-[10px] font-mono text-ink-muted">{p.sku}</span></>)}
            </div>
            <Link href={`/${lang}/catalog/${p.id}`}>
              <h3 className="font-semibold text-[15px] text-ink leading-snug mb-1 hover:text-primary transition-colors">{name}</h3>
            </Link>
            <p className="text-[12px] text-ink-muted leading-relaxed line-clamp-2 mb-3">{desc}</p>

            <div className="flex items-center justify-between mt-auto flex-wrap gap-2">
              <div className="flex items-baseline gap-1">
                <span className="font-display text-xl font-extrabold text-ink leading-none tabular">${p.price}</span>
                <span className="text-[11px] text-ink-faint">/ {p.unit}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={handleCompare}
                  className={[
                    "w-9 h-9 rounded-lg flex items-center justify-center transition-colors",
                    isCompared ? "bg-primary text-white" : "bg-canvas-soft hover:bg-tint-blue text-ink-muted hover:text-primary",
                  ].join(" ")}
                  title={isCompared ? t.product.inCompare : t.product.addToCompare}>
                  <Icon name={isCompared ? "check" : "switchH"} size={16} />
                </button>
                <a href={waLink(quickMsg)} target="_blank" rel="noopener noreferrer" className="btn-wa size-sm">
                  <Icon name="chat" size={14} /> WhatsApp
                </a>
                <a href={tgLink(quickMsg)} target="_blank" rel="noopener noreferrer" className="btn-tg size-sm">
                  <Icon name="send" size={14} /> Telegram
                </a>
                <Link href={`/${lang}/catalog/${p.id}`} className="btn-primary size-sm">{t.common.details}</Link>
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

      <article className="card card-hover overflow-hidden flex flex-col group">
        {/* Image */}
        <Link href={`/${lang}/catalog/${p.id}`} className="block relative aspect-[4/3] bg-tint-blue overflow-hidden">
          {img ? (
            <img
              src={img}
              alt={name}
              className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-tint-blue via-white to-tint-cyan">
              <Icon
                name={CATEGORIES.find((c) => c.slug === p.category)?.icon || "package"}
                size={56}
                className="text-primary/30"
                strokeWidth={1.1}
              />
              <span className="text-[10px] text-ink-faint uppercase tracking-wider">{p.sku || p.brand || "Medoria"}</span>
            </div>
          )}

          {/* Badge */}
          {p.badge && (
            <span className={`absolute top-3 left-3 ${BADGE_STYLE[p.badge] || "bg-primary text-white"} tag`}>
              {p.badge}
            </span>
          )}

          {/* Compare button (top right) */}
          <button
            onClick={handleCompare}
            className={[
              "absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center transition-all shadow-soft backdrop-blur",
              isCompared
                ? "bg-primary text-white scale-105"
                : "bg-white/90 text-ink-muted hover:bg-white hover:text-primary opacity-0 group-hover:opacity-100",
            ].join(" ")}
            title={isCompared ? t.product.inCompare : t.product.addToCompare}
            aria-label="Compare"
          >
            <Icon name={isCompared ? "check" : "switchH"} size={16} />
          </button>

          {/* Out of stock overlay */}
          {!p.in_stock && (
            <div className="absolute inset-0 bg-white/65 flex items-center justify-center backdrop-blur-[2px]">
              <span className="bg-white text-[11px] font-bold text-warn px-3 py-1.5 rounded-full border border-warn/30 shadow-soft">
                {t.common.onOrder}
              </span>
            </div>
          )}

          {/* SKU */}
          {p.sku && (
            <span className="absolute bottom-3 right-3 bg-white/95 backdrop-blur text-[10px] font-mono font-semibold text-ink-muted px-2 py-0.5 rounded-md border border-line tabular">
              {p.sku}
            </span>
          )}
        </Link>

        {/* Content */}
        <div className="p-4 flex-1 flex flex-col">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-[9px] font-bold tracking-[0.14em] text-primary uppercase">
              {getCategoryName(p.category, lang)}
            </span>
            {p.brand && (
              <>
                <span className="text-ink-faint">·</span>
                <span className="text-[10px] text-ink-faint font-medium">{p.brand}</span>
              </>
            )}
          </div>

          <Link href={`/${lang}/catalog/${p.id}`}>
            <h3 className="font-semibold text-[14px] text-ink leading-snug mb-1 hover:text-primary transition-colors">
              {name}
            </h3>
          </Link>

          {!compact && desc && (
            <p className="text-[12px] text-ink-muted leading-relaxed line-clamp-2 mb-3">{desc}</p>
          )}

          {/* Price + stock */}
          <div className="flex items-center justify-between mt-auto mb-3">
            <div className="flex items-baseline gap-1">
              <span className="font-display text-[22px] font-extrabold text-ink leading-none tabular">${p.price}</span>
              <span className="text-[11px] text-ink-faint">/ {p.unit}</span>
            </div>
            <span className={`pill ${p.in_stock ? "bg-ok/10 text-ok border border-ok/20" : "bg-warn/10 text-warn border border-warn/20"}`}>
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
              className="btn h-9 text-[10px] rounded-lg bg-tint-blue text-primary border border-primary/20 hover:bg-primary/10">
              <Icon name="invoice" size={12} />
              {t.common.requestQuote}
            </button>
          </div>

          <Link
            href={`/${lang}/catalog/${p.id}`}
            className="mt-2 flex items-center justify-center gap-1 text-[11px] font-semibold text-primary py-2 rounded-lg border border-primary/20 hover:bg-tint-blue transition-colors"
          >
            {t.common.details} <Icon name="arrow" size={12} />
          </Link>
        </div>
      </article>
    </>
  );
}
