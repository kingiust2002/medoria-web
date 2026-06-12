// app/[lang]/contact/ContactInner.jsx — contact page (client).
"use client";
import { useState } from "react";
import Link from "next/link";
import { getTranslations } from "@/lib/i18n";
import { WA_NUMBER, TG_USER, waLink, tgLink } from "@/lib/whatsapp";
import { submitQuoteRequest } from "@/lib/actions/quote";
import MathCaptcha, { captchaErrorText } from "@/components/shared/MathCaptcha";
import Icon from "@/components/shared/Icon";
import TiltCard from "@/components/shared/TiltCard";
import Breadcrumb from "@/components/shared/Breadcrumb";
import PageHeaderVisual from "@/components/shared/PageHeaderVisual";
import SplitText from "@/components/shared/SplitText";

const PHONE = process.env.NEXT_PUBLIC_PHONE || "+992900000000";

export default function ContactInner({ lang }) {
  const t = getTranslations(lang);
  const c = t.contact;
  const email = process.env.NEXT_PUBLIC_EMAIL || "sales@medoria.tj";

  return (
    <div className="bg-canvas-soft">
      {/* Hero */}
      <section className="bg-canvas-soft border-b border-line relative overflow-hidden">
        <PageHeaderVisual name="contact-header" light={0.5} dark={0.5} lightFilter="saturate(1.35) contrast(1.18)" tint={0.16} />
        <div className="blob w-[44vw] h-[44vw] -top-1/3 -end-[6%] animate-aurora"
             style={{ background: "radial-gradient(circle, rgba(139,47,247,0.14) 0%, transparent 70%)" }} />
        <div className="blob w-[32vw] h-[32vw] top-0 start-[8%] animate-aurora"
             style={{ background: "radial-gradient(circle, rgba(6,182,212,0.12) 0%, transparent 70%)", animationDelay: "4s" }} />
        <div className="container-x py-12 md:py-20 relative">
          <Breadcrumb lang={lang} className="mb-4" crumbs={[{ label: t.common.home, href: `/${lang}` }, { label: t.common.contact }]} />
          <div className="eyebrow mb-4"><span className="gradient-text">{c.hero.tag}</span></div>
          <h1 className="section-h-lg mb-5 max-w-2xl"><SplitText text={c.hero.title} delay={0.1} /></h1>
          <p className="text-base md:text-lg text-ink-muted leading-relaxed max-w-2xl">
            {c.hero.sub}
          </p>
        </div>
      </section>

      <div className="container-x py-12 md:py-16">
        <div className="grid lg:grid-cols-3 gap-6 md:gap-8">
          {/* Contact methods */}
          <div className="space-y-3 lg:col-span-1">
            <MethodCard
              icon="chat"
              iconBg="bg-ok/10 text-ok"
              iconHover="hover:border-ok/30"
              label={t.common.whatsapp}
              value={`+${WA_NUMBER}`}
              desc={c.methods.whatsapp}
              href={waLink("")}
            />
            <MethodCard
              icon="send"
              iconBg="bg-[#229ED9]/10 text-[#229ED9]"
              iconHover="hover:border-[#229ED9]/30"
              label={t.common.telegram}
              value={`@${TG_USER}`}
              desc={c.methods.telegram}
              href={`https://t.me/${TG_USER}`}
            />
            <MethodCard
              icon="phone"
              iconBg="bg-primary/10 text-primary"
              iconHover="hover:border-primary/30"
              label={t.common.phone}
              value={PHONE}
              desc={c.methods.whatsapp}
              href={`tel:${PHONE}`}
            />
            <MethodCard
              icon="mail"
              iconBg="bg-primary/10 text-primary"
              iconHover="hover:border-primary/30"
              label={t.common.email}
              value={email}
              desc={c.methods.email}
              href={`mailto:${email}`}
            />
            <MethodCard
              icon="mapPin"
              iconBg="bg-cyan-600/10 text-cyan-600"
              label={t.common.address}
              value={t.common.address}
              desc={c.methods.address}
            />

            {/* Working hours */}
            <div className="card p-5">
              <h3 className="font-semibold text-ink text-[14px] mb-3 flex items-center gap-2">
                <Icon name="clock" size={16} className="text-primary" />
                {c.hours.title}
              </h3>
              <dl className="space-y-1.5">
                {c.hours.items.map(([day, time], i) => (
                  <div key={i} className="flex justify-between text-[12px]">
                    <dt className="text-ink-muted">{day}</dt>
                    <dd className="font-semibold text-ink tabular">{time}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-[11px] text-ink-faint mt-3 leading-relaxed">{c.hours.note}</p>
            </div>
          </div>

          {/* Form */}
          <div className="lg:col-span-2">
            <ContactForm lang={lang} t={t} />
          </div>
        </div>
      </div>
    </div>
  );
}

function MethodCard({ icon, iconBg, iconHover = "", label, value, desc, href }) {
  const inner = (
    <>
      <div className={`w-12 h-12 rounded-2xl ${iconBg} flex items-center justify-center shrink-0`}>
        <Icon name={icon} size={22} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] text-ink-faint uppercase tracking-wide mb-0.5">{label}</div>
        <div className="font-semibold text-ink text-[14px] mb-1 truncate">{value}</div>
        <div className="text-[11px] text-ink-muted leading-relaxed">{desc}</div>
      </div>
    </>
  );

  return href ? (
    <TiltCard className="rounded-2xl" max={6}>
    <a href={href} target="_blank" rel="noopener noreferrer"
       className={`card p-5 flex items-start gap-4 hover:shadow-hover transition-all ${iconHover}`}>
      {inner}
    </a>
    </TiltCard>
  ) : (
    <TiltCard className="rounded-2xl" max={6}>
    <div className="card p-5 flex items-start gap-4">{inner}</div>
    </TiltCard>
  );
}

const CHANNELS = [
  ["whatsapp", "chat",  "WhatsApp"],
  ["telegram", "send",  "Telegram"],
  ["phone",    "phone", null],
];

// Per-channel selected colour (each on its own brand colour, not all blue).
const CHANNEL_ACTIVE = {
  whatsapp: "bg-[#22C55E] text-white border-[#22C55E] shadow-[0_6px_16px_rgba(34,197,94,0.30)]",
  telegram: "bg-[#229ED9] text-white border-[#229ED9] shadow-[0_6px_16px_rgba(34,158,217,0.30)]",
  phone:    "bg-brand-violet text-white border-brand-violet shadow-[0_6px_16px_rgba(139,47,247,0.30)]",
};

function ContactForm({ lang, t }) {
  const c = t.contact;
  const [form, setForm] = useState({
    name: "", org: "", phone: "", email: "", subject: "", message: "",
  });
  const [hp, setHp] = useState(""); // honeypot — humans never fill this
  const [captcha, setCaptcha] = useState({ token: "", answer: "" });
  const [captchaReset, setCaptchaReset] = useState(0);
  const [formError, setFormError] = useState(null);
  const [via, setVia] = useState("whatsapp");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  const update = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name.trim() || sending) return;
    setSending(true);
    setFormError(null);

    const msg = [
      lang === "fa" ? "📝 پیام از وب‌سایت" :
      lang === "tg" ? "📝 Паём аз вебсайт" :
      lang === "en" ? "📝 Website message" :
                      "📝 Сообщение с сайта",
      "",
      `👤 ${c.form.name}: ${form.name || "—"}`,
      `🏥 ${c.form.org}: ${form.org || "—"}`,
      `📞 ${c.form.phone}: ${form.phone || "—"}`,
      form.email ? `✉ ${c.form.emailField}: ${form.email}` : "",
      form.subject ? `📋 ${c.form.subject}: ${form.subject}` : "",
      "",
      `💬 ${c.form.message}:`,
      form.message || "—",
    ].filter(Boolean).join("\n");

    // Persist the inquiry to the canonical quote_requests store (best-effort).
    const composedMessage = [
      form.subject ? `[${form.subject}] ` : "",
      form.message,
      form.email ? `\n${c.form.emailField}: ${form.email}` : "",
    ].join("");
    let res = null;
    try {
      res = await submitQuoteRequest({
        name: form.name,
        organization: form.org,
        phone: form.phone,
        message: composedMessage,
        preferredContact: via,
        language: lang,
        website: hp,
        captchaToken: captcha.token,
        captchaAnswer: captcha.answer,
      });
    } catch (err) {
      console.warn("submitQuoteRequest failed:", err);
    }

    // Captcha / rate-limit rejections BLOCK the submission with clear feedback.
    // Other persistence failures stay non-blocking — messaging is the channel.
    if (res && res.ok === false && (res.error === "captcha" || res.error === "rate_limited")) {
      setFormError(captchaErrorText(lang, res.error));
      if (res.error === "captcha") setCaptchaReset((k) => k + 1); // fresh question
      setSending(false);
      return;
    }

    if (via === "phone") {
      window.location.href = `tel:${PHONE}`;
    } else {
      window.open(via === "telegram" ? tgLink(msg) : waLink(msg), "_blank", "noopener");
    }
    setSending(false);
    setSent(true);
  };

  if (sent) {
    return (
      <div className="card p-8 md:p-12 text-center">
        <div className="w-20 h-20 mx-auto rounded-full bg-ok/10 text-ok flex items-center justify-center mb-5">
          <Icon name="check" size={36} strokeWidth={2.5} />
        </div>
        <h3 className="font-display text-2xl font-bold text-ink mb-3">{c.form.success}</h3>
        <p className="text-[14px] text-ink-muted leading-relaxed mb-6 max-w-md mx-auto">{c.form.successSub}</p>
        {via === "phone" && (
          <a href={`tel:${PHONE}`} className="btn-primary size-md mb-3 inline-flex tabular">
            <Icon name="phone" size={15} /> {PHONE}
          </a>
        )}
        <div>
          <button
            onClick={() => { setSent(false); setForm({ name: "", org: "", phone: "", email: "", subject: "", message: "" }); }}
            className="btn-ghost size-md"
          >
            {lang === "fa" ? "ارسال پیام جدید" :
             lang === "tg" ? "Паёми нав" :
             lang === "en" ? "Send another" : "Отправить ещё"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card p-6 md:p-8">
      <h2 className="font-display text-2xl font-bold text-ink mb-2">{c.form.title}</h2>
      <p className="text-[13px] text-ink-muted mb-6">{c.form.sub}</p>

      {/* Honeypot: visually hidden, ignored by humans, filled by bots. */}
      <input
        type="text" value={hp} onChange={(e) => setHp(e.target.value)}
        name="website" tabIndex={-1} autoComplete="off" aria-hidden="true"
        className="absolute opacity-0 h-0 w-0 pointer-events-none"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <Field label={c.form.name} required>
          <input value={form.name} onChange={update("name")} required maxLength={150} className="input w-full" />
        </Field>
        <Field label={c.form.org}>
          <input value={form.org} onChange={update("org")} maxLength={160} className="input w-full" />
        </Field>
        <Field label={c.form.phone} required>
          <input value={form.phone} onChange={update("phone")} type="tel" required maxLength={40} className="input w-full" />
        </Field>
        <Field label={c.form.emailField}>
          <input value={form.email} onChange={update("email")} type="email" maxLength={120} className="input w-full" />
        </Field>
      </div>

      <Field label={c.form.subject} className="mb-4">
        <input value={form.subject} onChange={update("subject")} maxLength={150} className="input w-full" />
      </Field>

      <Field label={c.form.message} required className="mb-5">
        <textarea
          value={form.message}
          onChange={update("message")}
          required
          rows={5}
          maxLength={2000}
          className="input w-full h-auto py-3 resize-none"
        />
      </Field>

      <div className="mb-5">
        <MathCaptcha lang={lang} value={captcha} onChange={setCaptcha} resetKey={captchaReset} invalid={Boolean(formError)} />
      </div>

      <div className="mb-5">
        <label className="block text-[11px] font-semibold text-ink mb-2">{c.form.sendVia}</label>
        <div className="grid grid-cols-3 gap-2">
          {CHANNELS.map(([v, icon, fixedLabel]) => (
            <button
              key={v}
              type="button"
              onClick={() => setVia(v)}
              className={[
                "h-11 rounded-xl text-[13px] font-semibold border transition-colors flex items-center justify-center gap-2",
                via === v
                  ? CHANNEL_ACTIVE[v]
                  : "bg-surface text-ink-muted border-line hover:border-ink-faint",
              ].join(" ")}
            >
              <Icon name={icon} size={15} />
              {fixedLabel || t.quoteModal.viaPhone}
            </button>
          ))}
        </div>
      </div>

      {formError ? (
        <p role="alert" className="text-[11px] text-warn mb-3 text-center">{formError}</p>
      ) : null}
      <button type="submit" disabled={sending} className="btn-primary size-xl w-full disabled:opacity-60">
        <Icon name={via === "phone" ? "phone" : "send"} size={16} />
        {via === "phone" ? t.quoteModal.callUs : c.form.send}
      </button>
    </form>
  );
}

function Field({ label, required, children, className = "" }) {
  return (
    <div className={className}>
      <label className="block text-[11px] font-semibold text-ink mb-1.5">
        {label} {required && <span className="text-warn">*</span>}
      </label>
      {children}
    </div>
  );
}
