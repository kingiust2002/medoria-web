// app/health/[lang]/inquiry/InquiryClient.jsx — review the list, set quantities, send ONE request.
"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getProductsByIds, imageUrl } from "@/lib/supabase";
import { getTranslations, LANG_META } from "@/lib/i18n";
import { waLink, tgLink } from "@/lib/whatsapp";
import { submitQuoteRequest } from "@/lib/actions/quote";
import { priceLabel, isOnRequest, formatPrice } from "@/lib/price";
import { useInquiryList } from "@/lib/inquiryList";
import { copyFor, listMessage } from "@/lib/inquiry/copy";
import Icon from "@/components/shared/Icon";
import Breadcrumb from "@/components/shared/Breadcrumb";
import MathCaptcha, { captchaErrorText } from "@/components/shared/MathCaptcha";

const PHONE = process.env.NEXT_PUBLIC_PHONE || "+992900000000";
const CHANNELS = [["whatsapp", "chat", "WhatsApp"], ["telegram", "send", "Telegram"], ["phone", "phone", null]];

export default function InquiryClient({ lang }) {
  const t = getTranslations(lang);
  const c = copyFor(lang);
  const dir = LANG_META[lang]?.dir || "ltr";
  const { items, remove, setQty, clear } = useInquiryList("health");

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [goneNotice, setGoneNotice] = useState(false);

  const [name, setName] = useState("");
  const [org, setOrg] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [via, setVia] = useState("whatsapp");
  const [hp, setHp] = useState("");
  const [captcha, setCaptcha] = useState({ token: "", answer: "" });
  const [captchaReset, setCaptchaReset] = useState(0);
  const [formError, setFormError] = useState(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  // The list holds only ids; show what the database says about them now.
  const idKey = items.map((x) => x.id).join(",");
  useEffect(() => {
    let cancelled = false;
    if (!items.length) { setProducts([]); setLoading(false); return undefined; }
    setLoading(true); setLoadFailed(false);
    getProductsByIds(items.map((x) => x.id)).then((rows) => {
      if (cancelled) return;
      setProducts(rows);
      // Archived or deleted products cannot be asked about: take them out of the list and say so.
      const alive = new Set(rows.map((r) => r.id));
      const gone = items.filter((x) => !alive.has(x.id));
      if (rows.length || !items.length) { gone.forEach((x) => remove(x.id)); if (gone.length) setGoneNotice(true); }
      else setLoadFailed(true);   // nothing came back at all: more likely a failed request than 30 archived products
      setLoading(false);
    }).catch(() => { if (!cancelled) { setLoadFailed(true); setLoading(false); } });
    return () => { cancelled = true; };
  }, [idKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => items.map((it) => ({ ...it, product: products.find((p) => p.id === it.id) })).filter((r) => r.product), [items, products]);
  const nameOf = (p) => p[`name_${lang}`] || p.name_en || "";

  async function handleSend(e) {
    e.preventDefault();
    if (!name.trim() || sending || !rows.length) return;
    setSending(true); setFormError(null);
    let res = null;
    try {
      res = await submitQuoteRequest({
        name, organization: org, phone, message: note, preferredContact: via, language: lang, website: hp,
        items: rows.map((r) => ({ id: r.id, quantity: r.qty })),
        captchaToken: captcha.token, captchaAnswer: captcha.answer,
      });
    } catch (err) { console.warn("submitQuoteRequest failed:", err); }

    if (res && res.ok === false && (res.error === "captcha" || res.error === "rate_limited")) {
      setFormError(captchaErrorText(lang, res.error));
      if (res.error === "captcha") setCaptchaReset((k) => k + 1);
      setSending(false);
      return;
    }
    if (res && res.ok === false && res.error === "invalid") { setFormError(c.invalid); setSending(false); return; }

    // Hand the same list to the chosen messenger, as the single-product form does.
    if (via === "phone") {
      window.location.href = `tel:${PHONE}`;
    } else {
      const msg = listMessage({
        title: { fa: "📋 درخواست پیشنهاد تجاری", tg: "📋 Дархости пешниҳоди тиҷоратӣ", en: "📋 Commercial offer request", ru: "📋 Запрос коммерческого предложения" }[lang],
        lines: rows.map((r) => ({ name: nameOf(r.product), sku: r.product.sku, quantity: r.qty })),
        name, org, phone, note, url: typeof window !== "undefined" ? window.location.href : "",
        labels: { name: t.quoteModal.name, org: t.quoteModal.org, phone: t.quoteModal.phone },
      });
      window.open(via === "telegram" ? tgLink(msg) : waLink(msg), "_blank", "noopener");
    }
    clear();
    setSending(false);
    setSent(true);
  }

  return (
    <div dir={dir} className="bg-canvas-soft min-h-screen">
      <div className="relative overflow-hidden bg-canvas-soft border-b border-line">
        <div className="container-x py-10 md:py-14">
          <Breadcrumb lang={lang} className="mb-4" crumbs={[{ label: t.common.home, href: `/health/${lang}` }, { label: c.title }]} />
          <h1 className="section-h-lg mb-1">{c.title}</h1>
          <p className="text-ink-muted text-sm">{c.sub}</p>
        </div>
      </div>

      <div className="container-x py-8 md:py-12">
        {sent ? (
          <div className="card p-8 md:p-12 text-center max-w-xl mx-auto">
            <div className="w-16 h-16 rounded-full bg-ok/10 text-ok flex items-center justify-center mx-auto mb-4"><Icon name="check" size={28} strokeWidth={2.5} /></div>
            <h2 className="font-display text-xl font-bold text-ink mb-2">{t.quoteModal.sentTitle}</h2>
            <p className="text-sm text-ink-muted mb-6 leading-relaxed">{t.quoteModal.sentSub}</p>
            <Link href={`/health/${lang}/catalog`} className="btn-primary size-md">{c.go}</Link>
          </div>
        ) : !loading && rows.length === 0 ? (
          <div className="text-center py-16 max-w-md mx-auto">
            <div className="w-16 h-16 mx-auto rounded-2xl bg-brand-violet/10 text-brand-violet grid place-items-center mb-4"><Icon name="invoice" size={32} /></div>
            <h2 className="font-display text-lg font-bold text-ink mb-1">{loadFailed ? c.loadError : c.empty}</h2>
            {!loadFailed && <p className="text-sm text-ink-muted mb-6">{c.emptySub}</p>}
            {goneNotice && <p role="status" className="text-[12px] text-warn mb-4">{c.gone}</p>}
            <Link href={`/health/${lang}/catalog`} className="btn-primary size-md">{c.go}</Link>
            {items.length > 0 && <div><button type="button" onClick={clear} className="mt-4 text-[12px] font-semibold text-warn hover:underline">{c.clear}</button></div>}
          </div>
        ) : (
          <div className="grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-6 lg:gap-8 items-start">
            <section aria-label={c.title}>
              {goneNotice && <p role="status" className="text-[12px] text-warn mb-3">{c.gone}</p>}
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-ink-muted"><span className="font-bold text-ink tabular">{rows.length}</span> {c.products}</p>
                <button type="button" onClick={clear} className="text-[12px] font-semibold text-warn hover:underline">{c.clear}</button>
              </div>
              <ul className="space-y-3">
                {(loading ? [] : rows).map((r) => (
                  <li key={r.id} className="card p-3 flex items-start gap-3 min-w-0">
                    <div className="w-16 h-16 rounded-lg bg-canvas-soft border border-line overflow-hidden shrink-0 grid place-items-center text-brand-violet">
                      {r.product.image_url ? <img src={imageUrl(r.product.image_url)} alt="" className="w-full h-full object-cover" /> : <Icon name="package" size={22} />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <Link href={`/health/${lang}/catalog/${r.product.slug || r.product.id}`} className="block text-[14px] font-semibold text-ink hover:text-brand-violet leading-snug break-words">{nameOf(r.product)}</Link>
                      <p className="text-[11px] text-ink-faint mt-0.5 break-all" dir="ltr">{r.product.sku || ""}</p>
                      <p className="text-[12px] text-ink-muted mt-0.5 tabular">{isOnRequest(r.product) ? priceLabel(r.product, lang) : `${formatPrice(r.product.price)} / ${r.product.unit}`}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <label className="text-[11px] font-semibold text-ink-muted" htmlFor={`qty-${r.id}`}>{c.qty}</label>
                        <input id={`qty-${r.id}`} type="number" min={1} max={1000000} value={r.qty} onChange={(e) => setQty(r.id, e.target.value)} className="input !h-9 w-24 tabular" />
                      </div>
                    </div>
                    <button type="button" onClick={() => remove(r.id)} aria-label={`${c.remove}: ${nameOf(r.product)}`} title={c.remove} className="shrink-0 w-9 h-9 rounded-lg grid place-items-center text-ink-muted hover:text-warn hover:bg-warn/10"><Icon name="trash" size={16} /></button>
                  </li>
                ))}
              </ul>
            </section>

            <form onSubmit={handleSend} className="card p-5 md:p-6 lg:sticky lg:top-24 min-w-0">
              <input type="text" value={hp} onChange={(e) => setHp(e.target.value)} name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute opacity-0 h-0 w-0 pointer-events-none" />
              <div className="space-y-3">
                <div><label className="block text-[11px] font-semibold text-ink mb-1">{t.quoteModal.name} <span className="text-warn">*</span></label>
                  <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={150} className="input w-full" /></div>
                <div><label className="block text-[11px] font-semibold text-ink mb-1">{t.quoteModal.org}</label>
                  <input value={org} onChange={(e) => setOrg(e.target.value)} maxLength={160} className="input w-full" /></div>
                <div><label className="block text-[11px] font-semibold text-ink mb-1">{t.quoteModal.phone}</label>
                  <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" maxLength={40} className="input w-full" /></div>
                <div><label className="block text-[11px] font-semibold text-ink mb-1">{t.quoteModal.note}</label>
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={2000} className="input w-full h-auto py-2.5 resize-none" /></div>
                <MathCaptcha lang={lang} value={captcha} onChange={setCaptcha} resetKey={captchaReset} invalid={Boolean(formError)} />
                <div>
                  <label className="block text-[11px] font-semibold text-ink mb-1.5">{t.quoteModal.via}</label>
                  <div className="grid grid-cols-3 gap-2">
                    {CHANNELS.map(([v, icon, fixed]) => (
                      <button key={v} type="button" onClick={() => setVia(v)} aria-pressed={via === v}
                        className={["h-10 rounded-xl text-[12px] font-semibold border transition-colors flex items-center justify-center gap-1.5 min-w-0", via === v ? "bg-primary text-white border-primary" : "bg-surface text-ink-muted border-line hover:border-ink-faint"].join(" ")}>
                        <Icon name={icon} size={14} /> <span className="truncate">{fixed || t.quoteModal.viaPhone}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              {formError ? <p role="alert" className="text-[11px] text-warn mt-3 text-center">{formError}</p> : null}
              <button type="submit" disabled={sending || loading || rows.length === 0} className="btn-primary size-lg w-full mt-5 disabled:opacity-60">
                <Icon name={via === "phone" ? "phone" : "send"} size={15} /> {via === "phone" ? t.quoteModal.callUs : t.quoteModal.send}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
