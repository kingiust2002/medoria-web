// components/beauty/BeautyQuoteModal.jsx — Beauty product quotation request.
// Mirrors components/product/QuoteModal.jsx (honeypot + math captcha + server
// action) but posts to the Beauty quote action and carries Beauty copy. It
// renders inside the data-vertical="beauty" scope, so btn-primary /
// bg-brand-violet / bg-primary automatically wear the nude-copper-navy palette.
"use client";
import { useState, useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { LANG_META } from "@/lib/i18n";
import { waLink, tgLink } from "@/lib/whatsapp";
import { submitBeautyQuoteRequest } from "@/lib/beauty/actions/quote";
import { priceLabel, priceLine, isOnRequest, formatPrice } from "@/lib/price";
import Icon from "@/components/shared/Icon";
import MathCaptcha, { captchaErrorText } from "@/components/shared/MathCaptcha";

const PHONE = process.env.NEXT_PUBLIC_PHONE || "+992900000000";

// Beauty quote-modal copy (canonical wording adapted from the Master Copy Deck
// §5.12 / partnership tone: "professional inquiry", not "commercial offer").
const COPY = {
  tg: {
    title: "Дархости нарх", sub: "Тамос, ташкилот ва миқдори лозимиро нависед.",
    name: "Ном", org: "Салон, студия ё тиҷорат", phone: "Телефон", qty: "Миқдор",
    note: "Талаботи иловагӣ (ихтиёрӣ)", via: "Тавассути", viaPhone: "Занг",
    send: "Фиристодани дархост", callUs: "Занг занед", cancel: "Бекор кардан",
    sentTitle: "Дархост омода аст", sentSub: "Дар канали интихобшуда идома диҳед, то паём фиристода шавад.",
    header: "📋 Дархости нархи Medoria Beauty",
  },
  ru: {
    title: "Запрос цены", sub: "Укажите контакт, организацию и нужное количество.",
    name: "Имя", org: "Салон, студия или бизнес", phone: "Телефон", qty: "Количество",
    note: "Дополнительные требования (необязательно)", via: "Через", viaPhone: "Звонок",
    send: "Отправить запрос", callUs: "Позвонить", cancel: "Отмена",
    sentTitle: "Запрос готов", sentSub: "Продолжите в выбранном канале, чтобы отправить сообщение.",
    header: "📋 Запрос цены Medoria Beauty",
  },
  en: {
    title: "Request pricing", sub: "Share your contact, organization and required quantity.",
    name: "Name", org: "Salon, studio or business", phone: "Phone", qty: "Quantity",
    note: "Additional requirements (optional)", via: "Via", viaPhone: "Call",
    send: "Send inquiry", callUs: "Call us", cancel: "Cancel",
    sentTitle: "Inquiry ready", sentSub: "Continue in your selected channel to send the message.",
    header: "📋 Medoria Beauty pricing request",
  },
  fa: {
    title: "استعلام قیمت", sub: "تماس، سازمان و تعداد موردنیاز را وارد کنید.",
    name: "نام", org: "سالن، استودیو یا کسب‌وکار", phone: "تلفن", qty: "تعداد",
    note: "توضیحات بیشتر (اختیاری)", via: "از طریق", viaPhone: "تماس",
    send: "ارسال درخواست", callUs: "تماس بگیرید", cancel: "انصراف",
    sentTitle: "درخواست آماده است", sentSub: "در کانال انتخابی ادامه دهید تا پیام ارسال شود.",
    header: "📋 درخواست قیمت مدوریا بیوتی",
  },
};

const CHANNELS = [
  ["whatsapp", "chat", "WhatsApp"],
  ["telegram", "send", "Telegram"],
  ["phone", "phone", null],
];

export default function BeautyQuoteModal({ product, lang, onClose }) {
  const t = COPY[lang] || COPY.en;
  const dir = LANG_META[lang]?.dir || "ltr";
  const reduce = useReducedMotion();
  const [name, setName] = useState("");
  const [org, setOrg] = useState("");
  const [phone, setPhone] = useState("");
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const [via, setVia] = useState("whatsapp");
  const [hp, setHp] = useState(""); // honeypot — humans never fill this
  const [captcha, setCaptcha] = useState({ token: "", answer: "" });
  const [captchaReset, setCaptchaReset] = useState(0);
  const [formError, setFormError] = useState(null);
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
      t.header, "",
      `📦 ${productName}`,
      `🔖 ${product.sku || "—"}`,
      `💵 ${priceLine(product, lang)}`,
      `🔢 ${t.qty}: ${qty}`,
      "",
      `👤 ${t.name}: ${name || "—"}`,
      `🏢 ${t.org}: ${org || "—"}`,
      `📞 ${t.phone}: ${phone || "—"}`,
      note ? `💬 ${note}` : "",
      "",
      `🔗 ${pageUrl}`,
    ].filter(Boolean).join("\n");
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if (!name.trim() || sending) return;
    setSending(true);
    setFormError(null);

    let res = null;
    try {
      res = await submitBeautyQuoteRequest({
        name, organization: org, phone, quantity: qty,
        productId: product?.id,
        productName: product?.name_en || product?.[`name_${lang}`] || null,
        productSku: product?.sku || null,
        message: note, preferredContact: via, language: lang,
        sourceUrl: typeof window !== "undefined" ? window.location.href : null,
        website: hp,
        captchaToken: captcha.token, captchaAnswer: captcha.answer,
      });
    } catch (err) {
      console.warn("submitBeautyQuoteRequest failed:", err);
    }

    // Captcha / rate-limit rejections BLOCK; other failures are non-blocking
    // (WhatsApp/Telegram is the primary channel; a DB blip must not stop it).
    if (res && res.ok === false && (res.error === "captcha" || res.error === "rate_limited")) {
      setFormError(captchaErrorText(lang, res.error));
      if (res.error === "captcha") setCaptchaReset((k) => k + 1);
      setSending(false);
      return;
    }

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
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={reduce ? false : { opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
        className="bg-surface rounded-3xl w-full max-w-md shadow-hover max-h-[92vh] overflow-y-auto"
      >
        {sent ? (
          <div className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-ok/10 text-ok flex items-center justify-center mx-auto mb-4">
              <Icon name="check" size={28} strokeWidth={2.5} />
            </div>
            <h3 className="font-display text-xl font-bold text-ink mb-2">{t.sentTitle}</h3>
            <p className="text-sm text-ink-muted mb-5 leading-relaxed">{t.sentSub}</p>
            {via === "phone" && (
              <a href={`tel:${PHONE}`} className="btn-primary size-lg w-full mb-2 tabular">
                <Icon name="phone" size={16} /> {PHONE}
              </a>
            )}
            <button onClick={onClose} className="btn-ghost size-md w-full">{t.cancel}</button>
          </div>
        ) : (
          <form onSubmit={handleSend} className="p-6 md:p-7">
            <div className="flex items-start justify-between mb-1.5">
              <h3 className="font-display text-xl font-bold text-ink">{t.title}</h3>
              <button type="button" onClick={onClose} aria-label={t.cancel} className="text-ink-faint hover:text-ink -mt-1 -me-1 p-1">
                <Icon name="close" size={20} />
              </button>
            </div>
            <p className="text-xs text-ink-muted mb-5">{t.sub}</p>

            <div className="bg-brand-violet/[0.06] rounded-xl p-3 mb-5 border border-brand-violet/15 flex items-start gap-3">
              <div className="w-12 h-12 rounded-lg bg-surface flex items-center justify-center shrink-0 text-brand-violet">
                <Icon name="sparkles" size={20} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-semibold text-ink truncate">{product[`name_${lang}`] || product.name_en}</div>
                <div className="text-[11px] text-ink-muted mt-0.5 tabular">
                  {isOnRequest(product) ? priceLabel(product, lang) : `${formatPrice(product.price)}${product.unit ? ` · ${product.unit}` : ""}`}
                </div>
              </div>
            </div>

            {/* Honeypot: visually hidden, ignored by humans, filled by bots. */}
            <input
              type="text" value={hp} onChange={(e) => setHp(e.target.value)}
              name="website" tabIndex={-1} autoComplete="off" aria-hidden="true"
              className="absolute opacity-0 h-0 w-0 pointer-events-none"
            />
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-semibold text-ink mb-1">{t.name} <span className="text-warn">*</span></label>
                <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={150} className="input w-full" />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-ink mb-1">{t.org}</label>
                <input value={org} onChange={(e) => setOrg(e.target.value)} maxLength={160} className="input w-full" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-ink mb-1">{t.phone}</label>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" maxLength={40} className="input w-full" />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-ink mb-1">{t.qty}</label>
                  <input value={qty} onChange={(e) => setQty(e.target.value)} type="number" min={1} max={1000000} required className="input w-full tabular" />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-ink mb-1">{t.note}</label>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2500} className="input w-full h-auto py-2.5 resize-none" />
              </div>
              <MathCaptcha lang={lang} value={captcha} onChange={setCaptcha} resetKey={captchaReset} invalid={Boolean(formError)} />
              <div>
                <label className="block text-[11px] font-semibold text-ink mb-1.5">{t.via}</label>
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
                      {fixedLabel || t.viaPhone}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {formError ? (
              <p role="alert" className="text-[11px] text-warn mt-3 text-center">{formError}</p>
            ) : null}
            <button type="submit" disabled={sending} className="btn-primary size-lg w-full mt-5 disabled:opacity-60">
              <Icon name={via === "phone" ? "phone" : "send"} size={15} />
              {via === "phone" ? t.callUs : t.send}
            </button>
            <button type="button" onClick={onClose} className="block w-full mt-2 py-2 text-xs text-ink-muted hover:text-ink">
              {t.cancel}
            </button>
          </form>
        )}
      </motion.div>
    </div>
  );
}
