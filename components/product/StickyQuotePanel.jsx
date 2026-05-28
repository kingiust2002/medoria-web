// components/product/StickyQuotePanel.jsx
"use client";
import { useState, useEffect } from "react";
import { getTranslations } from "@/lib/i18n";
import { waLink, tgLink, productInquiryMessage } from "@/lib/whatsapp";
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
  const pageUrl = typeof window !== "undefined" ? window.location.href : "";
  const msg = productInquiryMessage(product, lang, { url: pageUrl });

  return (
    <div className="hidden md:block fixed bottom-6 left-1/2 -translate-x-1/2 z-40 animate-fade-up">
      <div className="card flex items-center gap-3 px-4 py-3 shadow-hover backdrop-blur-xl bg-white/95 border-primary/10">
        {/* Product mini */}
        <div className="flex items-center gap-3 pr-3 border-r border-line min-w-0 max-w-[280px]">
          <div className="w-10 h-10 rounded-lg bg-tint-blue flex items-center justify-center shrink-0 overflow-hidden">
            {product.image_url ? (
              <img src={product.image_url.startsWith("http") ? product.image_url : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${product.image_url}`} alt="" className="w-full h-full object-cover" />
            ) : (
              <Icon name="package" size={20} className="text-primary" />
            )}
          </div>
          <div className="min-w-0">
            <div className="text-[12px] font-semibold text-ink truncate">{name}</div>
            <div className="text-[11px] text-ink-muted tabular">
              <span className="font-bold text-primary">${product.price}</span>
              <span className="text-ink-faint"> / {product.unit}</span>
            </div>
          </div>
        </div>

        {/* Quick actions */}
        <button
          onClick={() => toggle(product.id)}
          className={[
            "w-10 h-10 rounded-lg flex items-center justify-center transition-colors shrink-0",
            isCompared
              ? "bg-primary text-white"
              : "bg-canvas-soft text-ink-muted hover:text-primary hover:bg-tint-blue",
          ].join(" ")}
          title={isCompared ? t.product.inCompare : t.product.addToCompare}
        >
          <Icon name={isCompared ? "check" : "switchH"} size={18} />
        </button>

        {/* Main CTAs */}
        <a
          href={waLink(msg)}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-wa size-md shrink-0"
        >
          <Icon name="chat" size={16} />
          {t.common.whatsapp}
        </a>

        <a
          href={tgLink(msg)}
          target="_blank"
          rel="noopener noreferrer"
          className="btn-tg size-md shrink-0"
        >
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
