// components/product/QuickViewModal.jsx
// Lightweight product preview opened from the catalog "Quick view" button,
// without navigating to the detail page. RTL-aware via logical classes.
"use client";
import { useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { getTranslations, getCategoryName, LANG_META } from "@/lib/i18n";
import { imageUrl } from "@/lib/supabase";
import { priceLabel, isOnRequest } from "@/lib/price";
import { waLink, tgLink, productInquiryMessage } from "@/lib/whatsapp";
import Icon from "@/components/shared/Icon";

export default function QuickViewModal({ product, lang, onClose, onRequestQuote }) {
  const t = getTranslations(lang);
  const dir = LANG_META[lang]?.dir || "ltr";
  const reduce = useReducedMotion();

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = ""; window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  if (!product) return null;
  const name = product[`name_${lang}`] || product.name_en;
  const desc = product[`description_${lang}`] || product.description_en;
  const img = product.image_url ? imageUrl(product.image_url) : null;
  const url = typeof window !== "undefined"
    ? `${window.location.origin}/${lang}/catalog/${product.slug || product.id}` : "";
  const inquire = (kind) => {
    const msg = productInquiryMessage(product, lang, { url });
    window.open(kind === "telegram" ? tgLink(msg) : waLink(msg), "_blank", "noopener");
  };

  return (
    <div onClick={onClose} role="dialog" aria-modal="true" aria-label={name} dir={dir}
      className="fixed inset-0 z-[100] bg-navy/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <motion.div onClick={(e) => e.stopPropagation()}
        initial={reduce ? false : { opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
        className="bg-surface rounded-3xl w-full max-w-3xl shadow-hover max-h-[92vh] overflow-y-auto grid md:grid-cols-2">
        {/* Gallery */}
        <div className="relative img-ph flex items-center justify-center p-6 md:p-8 min-h-[220px] md:min-h-[300px]">
          {img ? (
            <img src={img} alt={name} className="w-full h-full object-contain" loading="lazy" />
          ) : (
            <div className="flex flex-col items-center gap-2 text-brand-violet/30">
              <Icon name="package" size={88} strokeWidth={0.9} />
              <span className="text-[10px] text-ink-faint uppercase tracking-wider">{product.sku || product.brand || "Medoria"}</span>
            </div>
          )}
          {product.badge && (
            <span className="absolute top-4 start-4 tag bg-primary text-white">{product.badge}</span>
          )}
          <button onClick={onClose} aria-label="Close"
            className="absolute top-4 end-4 w-9 h-9 rounded-full bg-surface/90 flex items-center justify-center text-ink-muted hover:text-ink shadow-soft md:hidden">
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* Info */}
        <div className="p-6 md:p-7 flex flex-col">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span className="text-[10px] font-bold tracking-[0.14em] text-primary uppercase">
                {getCategoryName(product.category, lang)}
              </span>
              {product.brand && (
                <>
                  <span className="text-ink-faint">·</span>
                  <span className="text-[11px] text-ink-muted">{product.brand}</span>
                </>
              )}
            </div>
            <button onClick={onClose} aria-label="Close" className="hidden md:block text-ink-faint hover:text-ink p-1 -mt-1 -me-1">
              <Icon name="close" size={20} />
            </button>
          </div>

          <h3 className="font-display text-xl font-extrabold text-ink leading-tight">{name}</h3>

          <div className="flex items-center gap-2 mt-2 mb-4 flex-wrap">
            {product.sku && (
              <span className="text-[11px] font-mono text-ink-muted bg-canvas-soft border border-line px-2 py-1 rounded-md tabular">{product.sku}</span>
            )}
            <span className={`pill ${product.in_stock ? "bg-ok/10 text-ok border border-ok/20" : "bg-warn/10 text-warn border border-warn/20"}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${product.in_stock ? "bg-ok" : "bg-warn"}`} />
              {product.in_stock ? t.common.inStock : t.common.onOrder}
            </span>
          </div>

          {desc && (
            <p className="text-[13px] text-ink-muted leading-relaxed mb-4 line-clamp-3">{desc}</p>
          )}

          <div className="mt-auto">
            <div className="flex items-baseline gap-1.5 mb-4">
              <span className={`font-display font-extrabold text-ink tabular ${isOnRequest(product) ? "text-lg text-primary" : "text-2xl"}`}>
                {priceLabel(product, lang)}
              </span>
              {!isOnRequest(product) && <span className="text-[12px] text-ink-faint">/ {product.unit}</span>}
            </div>

            <button onClick={() => { onClose(); onRequestQuote?.(product); }} className="btn-primary size-lg w-full mb-2">
              <Icon name="invoice" size={16} />{t.common.requestQuote}
            </button>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <button onClick={() => inquire("whatsapp")} className="btn-wa size-md"><Icon name="chat" size={15} />WhatsApp</button>
              <button onClick={() => inquire("telegram")} className="btn-tg size-md"><Icon name="send" size={15} />Telegram</button>
            </div>
            <Link href={`/${lang}/catalog/${product.slug || product.id}`} onClick={onClose}
              className="flex items-center justify-center gap-1 text-[12px] font-semibold text-brand-violet py-2 rounded-lg border border-brand-violet/20 hover:bg-brand-violet/10 transition-colors">
              {t.common.details} <Icon name={dir === "rtl" ? "arrowL" : "arrow"} size={13} />
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
