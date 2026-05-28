// components/home/Hero.jsx
"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getTranslations, CATEGORIES, getCategoryName } from "@/lib/i18n";
import { waLink, bulkInquiryMessage } from "@/lib/whatsapp";
import Icon from "@/components/shared/Icon";

export default function Hero({ lang }) {
  const t = getTranslations(lang);
  const router = useRouter();
  const [q, setQ] = useState("");

  const submit = (e) => {
    e.preventDefault();
    const url = q.trim()
      ? `/${lang}/catalog?q=${encodeURIComponent(q.trim())}`
      : `/${lang}/catalog`;
    router.push(url);
  };

  return (
    <section className="relative overflow-hidden bg-white">
      {/* Soft grid background */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: "linear-gradient(to right, #0F172A 1px, transparent 1px), linear-gradient(to bottom, #0F172A 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />
      {/* Subtle blue glow */}
      <div className="absolute -top-1/4 -right-1/4 w-[60vw] h-[60vw] rounded-full pointer-events-none"
           style={{ background: "radial-gradient(circle, rgba(37,99,235,0.06) 0%, rgba(6,182,212,0.03) 50%, transparent 75%)" }} />
      <div className="absolute -bottom-1/4 -left-1/4 w-[40vw] h-[40vw] rounded-full pointer-events-none"
           style={{ background: "radial-gradient(circle, rgba(6,182,212,0.05) 0%, transparent 70%)" }} />

      <div className="container-x relative pt-12 pb-16 md:pt-20 md:pb-28 grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
        {/* Left */}
        <div>
          {/* Trust badge */}
          <div className="inline-flex items-center gap-2 mb-6 px-3.5 py-1.5 rounded-full bg-tint-blue border border-primary/15">
            <span className="w-1.5 h-1.5 rounded-full bg-ok animate-pulse" />
            <span className="text-[10px] font-bold tracking-[0.18em] text-primary-700 uppercase">
              {t.home.heroTag}
            </span>
          </div>

          {/* Headline */}
          <h1 className="font-display text-[36px] sm:text-[42px] md:text-[52px] lg:text-[60px] leading-[1.05] font-extrabold tracking-tight text-ink">
            <span className="block">{t.home.heroH1Pre}</span>
            <span className="block">{t.home.heroH1Mid}</span>
            <span className="block gradient-text">{t.home.heroH1Accent}</span>
          </h1>

          <p className="mt-5 text-[15px] md:text-[17px] text-ink-muted leading-[1.75] max-w-xl">
            {t.home.heroSub}
          </p>

          {/* Search */}
          <form onSubmit={submit} className="mt-7 flex flex-col sm:flex-row gap-2.5 max-w-2xl">
            <div className="relative flex-1">
              <Icon name="search" size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={t.home.heroSearch}
                className="input h-14 pl-12 w-full rounded-2xl shadow-soft text-[14px] border-line"
              />
            </div>
            <button type="submit" className="btn-primary h-14 px-7 rounded-2xl text-[14px]">
              {t.common.search}
              <Icon name="arrow" size={16} />
            </button>
          </form>

          {/* Quick category links */}
          <div className="mt-5 flex flex-wrap gap-1.5 items-center">
            <span className="text-[11px] text-ink-faint mr-2">{t.common.categories}:</span>
            {CATEGORIES.slice(0, 4).map((c) => (
              <Link
                key={c.slug}
                href={`/${lang}/catalog?category=${c.slug}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-line text-[11px] font-medium text-ink-muted hover:border-primary/30 hover:text-primary hover:bg-tint-blue transition-all"
              >
                <Icon name={c.icon} size={12} className="text-primary" strokeWidth={2} />
                {getCategoryName(c.slug, lang)}
              </Link>
            ))}
          </div>

          {/* CTAs */}
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={`/${lang}/catalog`} className="btn-primary size-xl">
              {t.home.heroCta}
              <Icon name="arrow" size={16} />
            </Link>
            <a href={waLink(bulkInquiryMessage(lang))} target="_blank" rel="noopener noreferrer"
               className="btn-wa size-xl">
              <Icon name="chat" size={16} />
              {t.common.contactUs}
            </a>
          </div>
        </div>

        {/* Right — visual */}
        <div className="relative hidden lg:block">
          {/* Main card with logo */}
          <div className="aspect-square rounded-3xl bg-brand-gradient-soft p-1 shadow-card overflow-hidden border border-primary/10">
            <div className="w-full h-full rounded-[22px] bg-white flex items-center justify-center relative overflow-hidden">
              {/* Floating cards */}
              <FloatingCard top="6%"  left="4%"   delay={0}    icon="gloves"       label={getCategoryName("gloves", lang)} />
              <FloatingCard top="22%" right="3%"  delay={150}  icon="stethoscope"  label={getCategoryName("instruments", lang)} />
              <FloatingCard top="52%" left="6%"   delay={300}  icon="mask"         label={getCategoryName("masks", lang)} />
              <FloatingCard top="70%" right="6%"  delay={450}  icon="thermometer"  label={getCategoryName("diagnostics", lang)} />
              <FloatingCard bottom="6%" left="35%" delay={600} icon="flask"        label={getCategoryName("lab", lang)} />

              {/* Center logo */}
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-brand-gradient blur-3xl opacity-15 scale-150" />
                <img src="/logo.png" alt="" className="relative w-36 h-36 object-contain drop-shadow-2xl" />
              </div>
            </div>
          </div>

          {/* Trust badge */}
          <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 bg-white shadow-card rounded-2xl px-5 py-3 flex items-center gap-3 border border-line">
            <Icon name="shield" size={20} className="text-ok" />
            <div className="text-[11px] leading-tight">
              <div className="font-bold text-ink">B2B Verified</div>
              <div className="text-ink-muted">{t.home.stats[0][1]}</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FloatingCard({ top, left, right, bottom, delay, icon, label }) {
  return (
    <div
      className="absolute card px-3 py-2 flex items-center gap-2.5 shadow-card border-primary/10 opacity-0 animate-fade-up"
      style={{ top, left, right, bottom, animationDelay: `${delay}ms`, animationDuration: "0.8s" }}
    >
      <div className="w-8 h-8 rounded-lg bg-tint-blue flex items-center justify-center shrink-0">
        <Icon name={icon} size={16} className="text-primary" strokeWidth={2} />
      </div>
      <div className="text-[11px] font-semibold text-ink leading-tight">{label}</div>
    </div>
  );
}
