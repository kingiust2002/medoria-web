// app/[lang]/contact/page.jsx
"use client";
import { useState } from "react";
import Link from "next/link";
import { getTranslations } from "@/lib/i18n";
import { WA_NUMBER, TG_USER, waLink, tgLink } from "@/lib/whatsapp";
import Icon from "@/components/shared/Icon";

export default function ContactPage({ params }) {
  const { lang } = params;
  const t = getTranslations(lang);
  const c = t.contact;
  const email = process.env.NEXT_PUBLIC_EMAIL || "sales@medoria.tj";

  return (
    <div className="bg-canvas-soft">
      {/* Hero */}
      <section className="bg-white border-b border-line relative overflow-hidden">
        <div className="absolute -top-1/2 right-0 w-[40vw] h-[40vw] rounded-full pointer-events-none"
             style={{ background: "radial-gradient(circle, rgba(37,99,235,0.05) 0%, transparent 70%)" }} />
        <div className="container-x py-12 md:py-20 relative">
          <nav className="text-[11px] text-ink-muted mb-4 flex items-center gap-2">
            <Link href={`/${lang}`} className="hover:text-primary">{t.common.home}</Link>
            <span className="text-line">/</span>
            <span className="text-primary font-semibold">{t.common.contact}</span>
          </nav>
          <div className="section-tag mb-3">{c.hero.tag}</div>
          <h1 className="section-h-lg mb-5 max-w-2xl">{c.hero.title}</h1>
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
    <a href={href} target="_blank" rel="noopener noreferrer"
       className={`card p-5 flex items-start gap-4 hover:shadow-hover transition-all ${iconHover}`}>
      {inner}
    </a>
  ) : (
    <div className="card p-5 flex items-start gap-4">{inner}</div>
  );
}

function ContactForm({ lang, t }) {
  const c = t.contact;
  const [form, setForm] = useState({
    name: "", org: "", phone: "", email: "", subject: "", message: "",
  });
  const [via, setVia] = useState("whatsapp");
  const [sent, setSent] = useState(false);

  const update = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const handleSubmit = (e) => {
    e.preventDefault();
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

    const url = via === "telegram" ? tgLink(msg) : waLink(msg);
    window.open(url, "_blank");
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
        <button
          onClick={() => { setSent(false); setForm({ name: "", org: "", phone: "", email: "", subject: "", message: "" }); }}
          className="btn-ghost size-md"
        >
          {lang === "fa" ? "ارسال پیام جدید" :
           lang === "tg" ? "Паёми нав" :
           lang === "en" ? "Send another" : "Отправить ещё"}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card p-6 md:p-8">
      <h2 className="font-display text-2xl font-bold text-ink mb-2">{c.form.title}</h2>
      <p className="text-[13px] text-ink-muted mb-6">{c.form.sub}</p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <Field label={c.form.name} required>
          <input value={form.name} onChange={update("name")} required className="input w-full" />
        </Field>
        <Field label={c.form.org}>
          <input value={form.org} onChange={update("org")} className="input w-full" />
        </Field>
        <Field label={c.form.phone} required>
          <input value={form.phone} onChange={update("phone")} type="tel" required className="input w-full" />
        </Field>
        <Field label={c.form.emailField}>
          <input value={form.email} onChange={update("email")} type="email" className="input w-full" />
        </Field>
      </div>

      <Field label={c.form.subject} className="mb-4">
        <input value={form.subject} onChange={update("subject")} className="input w-full" />
      </Field>

      <Field label={c.form.message} required className="mb-5">
        <textarea
          value={form.message}
          onChange={update("message")}
          required
          rows={5}
          className="input w-full h-auto py-3 resize-none"
        />
      </Field>

      <div className="mb-5">
        <label className="block text-[11px] font-semibold text-ink mb-2">{c.form.sendVia}</label>
        <div className="grid grid-cols-2 gap-2">
          {[["whatsapp", "chat", "WhatsApp"], ["telegram", "send", "Telegram"]].map(([v, icon, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => setVia(v)}
              className={[
                "h-11 rounded-xl text-[13px] font-semibold border transition-colors flex items-center justify-center gap-2",
                via === v
                  ? "bg-primary text-white border-primary"
                  : "bg-white text-ink-muted border-line hover:border-ink-faint",
              ].join(" ")}
            >
              <Icon name={icon} size={15} />
              {l}
            </button>
          ))}
        </div>
      </div>

      <button type="submit" className="btn-primary size-xl w-full">
        <Icon name="send" size={16} />
        {c.form.send}
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
