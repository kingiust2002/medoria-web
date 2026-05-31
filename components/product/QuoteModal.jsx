// components/product/QuoteModal.jsx
"use client";
import { useState, useEffect } from "react";
import { getTranslations, LANG_META } from "@/lib/i18n";
import { waLink, tgLink } from "@/lib/whatsapp";
import { createQuoteRequest } from "@/lib/supabase";
import { priceLabel, priceLine, isOnRequest, formatPrice } from "@/lib/price";
import Icon from "@/components/shared/Icon";

const PHONE = process.env.NEXT_PUBLIC_PHONE || "+992900000000";

const CHANNELS = [
  ["whatsapp", "chat",  "WhatsApp"],
  ["telegram", "send",  "Telegram"],
  ["phone",    "phone", null],       // label comes from t.quoteModal.viaPhone
];

export default function QuoteModal({ product, lang, onClose }) {
  const t = getTranslations(lang);
  const dir = LANG_META[lang]?.dir || "ltr";
  const [name, setName] = useState("");
  const [org, setOrg]   = useState("");
  const [phone, setPhone] = useState("");
  const [qty, setQty]   = useState(1);
  const [note, setNote] = useState("");
  const [via, setVia]   = useState("whatsapp");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = ""; window.removeEventListener("keydown", onKey); };
  }, [onClose]);

  const buildMessage = () => {
    const pageUrl = typeof window !== "undefined" ? window.location.href : "";
    const productName = product[`name_${lang}`] || product.name_en;
    return [
      lang === "fa" ? "📋 درخواست پیشنهاد تجاری" :
      lang === "tg" ? "📋 Дархости пешниҳоди тиҷоратӣ" :
      lang === "en" ? "📋 Commercial offer request" :
                      "📋 Запрос коммерческого предложения",
      "",
      `📦 ${productName}`,
      `🔖 ${product.sku || "—"}`,
      `💵 ${priceLine(product, lang)}`,
      `🔢 ${t.quoteModal.qty}: ${qty}`,
      "",
      `👤 ${t.quoteModal.name}: ${name || "—"}`,
      `🏥 ${t.quoteModal.org}: ${org || "—"}`,
      `📞 ${t.quoteModal.phone}: ${phone || "—"}`,
      note ? `💬 ${note}` : "",
      "",
      `🔗 ${pageUrl}`,
    ].filter(Boolean).join("\n");
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!name.trim() || sending) return;
    setSending(true);

    // Persist the inquiry (non-blocking — a DB failure must not stop routing).
    try {
      await createQuoteRequest({
        name, organization: org, phone, product, quantity: qty,
        message: note, preferredContact: via, language: lang,
      });
    } catch (err) {
      console.warn("createQuoteRequest failed:", err);
    }

    // Route to the chosen channel.
    if (via === "phone") {
      window.location.href = `tel:${PHONE}`;
    } else {
      const msg = buildMessage();
      window.open(via === "telegram" ? tgLink(msg) : waLink(msg), "_blank", "noopener");
    }
    setSending(false);
    setSent(true);
  };

  return (
    <div
      onClick={onClose}
      dir={dir}
      className="fixed inset-0 z-[100] bg-navy/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-surface rounded-3xl w-full max-w-md shadow-hover max-h-[92vh] overflow-y-auto"
      >
        {sent ? (
          <div className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-ok/10 text-ok flex items-center justify-center mx-auto mb-4">
              <Icon name="check" size={28} strokeWidth={2.5} />
            </div>
            <h3 className="font-display text-xl font-bold text-ink mb-2">{t.quoteModal.sentTitle}</h3>
            <p className="text-sm text-ink-muted mb-5 leading-relaxed">{t.quoteModal.sentSub}</p>
            {via === "phone" && (
              <a href={`tel:${PHONE}`} className="btn-primary size-lg w-full mb-2 tabular">
                <Icon name="phone" size={16} /> {PHONE}
              </a>
            )}
            <button onClick={onClose} className="btn-ghost size-md w-full">
              {t.quoteModal.cancel}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSend} className="p-6 md:p-7">
            <div className="flex items-start justify-between mb-1.5">
              <h3 className="font-display text-xl font-bold text-ink">{t.quoteModal.title}</h3>
              <button type="button" onClick={onClose} aria-label={t.quoteModal.cancel} className="text-ink-faint hover:text-ink -mt-1 -me-1 p-1">
                <Icon name="close" size={20} />
              </button>
            </div>
            <p className="text-xs text-ink-muted mb-5">{t.quoteModal.sub}</p>

            <div className="bg-brand-violet/[0.06] rounded-xl p-3 mb-5 border border-brand-violet/15 flex items-start gap-3">
              <div className="w-12 h-12 rounded-lg bg-surface flex items-center justify-center shrink-0 text-brand-violet">
                <Icon name="package" size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-ink truncate">{product[`name_${lang}`] || product.name_en}</div>
                <div className="text-[11px] text-ink-muted mt-0.5 tabular">
                  {isOnRequest(product) ? priceLabel(product, lang) : `${formatPrice(product.price)} · ${product.unit}`}
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-ink mb-1">{t.quoteModal.name} <span className="text-warn">*</span></label>
                <input value={name} onChange={(e) => setName(e.target.value)} required className="input w-full" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-ink mb-1">{t.quoteModal.org}</label>
                <input value={org} onChange={(e) => setOrg(e.target.value)} className="input w-full" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-ink mb-1">{t.quoteModal.phone}</label>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" className="input w-full" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-ink mb-1">{t.quoteModal.qty}</label>
                  <input value={qty} onChange={(e) => setQty(e.target.value)} type="number" min={1} required className="input w-full tabular" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-ink mb-1">{t.quoteModal.note}</label>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="input w-full h-auto py-2.5 resize-none" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-ink mb-1.5">{t.quoteModal.via}</label>
                <div className="grid grid-cols-3 gap-2">
                  {CHANNELS.map(([v, icon, fixedLabel]) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setVia(v)}
                      className={[
                        "h-10 rounded-xl text-[12px] font-semibold border transition-colors flex items-center justify-center gap-1.5",
                        via === v
                          ? "bg-primary text-white border-primary"
                          : "bg-surface text-ink-muted border-line hover:border-ink-faint",
                      ].join(" ")}
                    >
                      <Icon name={icon} size={14} />
                      {fixedLabel || t.quoteModal.viaPhone}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <button type="submit" disabled={sending} className="btn-primary size-lg w-full mt-5 disabled:opacity-60">
              <Icon name={via === "phone" ? "phone" : "send"} size={15} />
              {via === "phone" ? t.quoteModal.callUs : t.quoteModal.send}
            </button>
            <button type="button" onClick={onClose} className="block w-full mt-2 py-2 text-xs text-ink-muted hover:text-ink">
              {t.quoteModal.cancel}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
