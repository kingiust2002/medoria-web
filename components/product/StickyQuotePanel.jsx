// components/product/StickyQuotePanel.jsx
"use client";
import { useState, useEffect } from "react";
import { getTranslations } from "@/lib/i18n";
import { waLink, tgLink, productInquiryMessage } from "@/lib/whatsapp";
import { imageUrl } from "@/lib/supabase";
import { priceLabel, isOnRequest, formatPrice } from "@/lib/price";
import { useCompare } from "@/lib/compare";
import Icon from "@/components/shared/Icon";

export default function StickyQuotePanel({ product, lang, onQuoteClick }) {
  const t = getTranslations(lang);
  const [show, setShow] = useState(false);
  const { has, toggle } = useCompare();
  const isCompared = has(product.id);

  // Show when scrolled past initial CTA card (~600px)
  useEffect(() => {
    const fn = () => setShow(window.scrollY > 600);
    fn();
    window.addEventListener("scroll", fn);
    return () => window.removeEventListener("scroll", fn);
  }, []);

  if (!show) return null;

  const name = product[`name_${lang}`] || product.name_en;
  const img = product.image_url ? imageUrl(product.image_url) : null;
  const pageUrl = typeof window !== "undefined" ? window.location.href : "";
  const msg = productInquiryMessage(product, lang, { url: pageUrl });

  return (
    <div className="hidden md:block fixed bottom-6 left-1/2 -translate-x-1/2 z-40 animate-fade-up">
      <div className="card flex items-center gap-3 px-4 py-3 shadow-hover backdrop-blur-xl bg-surface/95 border-brand-violet/10">
        {/* Product mini */}
        <div className="flex items-center gap-3 pe-3 border-e border-line min-w-0 max-w-[280px]">
          <div className="w-10 h-10 rounded-lg img-ph flex items-center justify-center shrink-0 overflow-hidden">
            {img ? (
              <img src={img} alt="" className="w-full h-full object-cover" />
            ) : (
              <Icon name="package" size={20} className="text-brand-violet" />
            )}
          </div>
          <div className="min-w-0">
            <div className="text-[12px] font-semibold text-ink truncate">{name}</div>
            <div className="text-[11px] text-ink-muted tabular">
              {isOnRequest(product) ? (
                <span className="font-bold gradient-text">{priceLabel(product, lang)}</span>
              ) : (
                <>
                  <span className="font-bold gradient-text">{formatPrice(product.price)}</span>
                  <span className="text-ink-faint"> / {product.unit}</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <button
          onClick={() => toggle(product.id)}
          className={[
            "w-10 h-10 rounded-lg flex items-center justify-center transition-colors shrink-0",
            isCompared
              ? "bg-brand-gradient text-white"
              : "bg-canvas-soft text-ink-muted hover:text-brand-violet hover:bg-brand-violet/10",
          ].join(" ")}
          title={isCompared ? t.product.inCompare : t.product.addToCompare}
        >
          <Icon name={isCompared ? "check" : "switchH"} size={18} />
        </button>

        {/* Main CTAs */}
        <a href={waLink(msg)} target="_blank" rel="noopener noreferrer" className="btn-wa size-md shrink-0">
          <Icon name="chat" size={16} />
          {t.common.whatsapp}
        </a>

        <a href={tgLink(msg)} target="_blank" rel="noopener noreferrer" className="btn-tg size-md shrink-0">
          <Icon name="send" size={16} />
          {t.common.telegram}
        </a>

        <button onClick={onQuoteClick} className="btn-primary size-md shrink-0">
          <Icon name="invoice" size={16} />
          {t.common.requestQuote}
        </button>
      </div>
    </div>
  );
}
