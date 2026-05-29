// components/home/Hero.jsx — Premium hero with logo lockup
"use client";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getTranslations, CATEGORIES, getCategoryName } from "@/lib/i18n";
import { waLink, bulkInquiryMessage } from "@/lib/whatsapp";
import Icon from "@/components/shared/Icon";

export default function Hero({ lang }) {
  const t = getTranslations(lang);
  const router = useRouter();
  const [q, setQ] = useState("");
  const [searchFocus, setSearchFocus] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    const url = q.trim() ? `/${lang}/catalog?q=${encodeURIComponent(q.trim())}` : `/${lang}/catalog`;
    router.push(url);
  };

  // Mega search suggestions
  const filteredCats = q.trim()
    ? CATEGORIES.filter((c) => getCategoryName(c.slug, lang).toLowerCase().includes(q.toLowerCase()))
    : [];

  return (
    <section className="relative overflow-hidden bg-white">
      {/* Grid background */}
      <div
        className="absolute inset-0 opacity-[0.04] pointer-events-none"
        style={{
          backgroundImage: "linear-gradient(to right, #0F172A 1px, transparent 1px), linear-gradient(to bottom, #0F172A 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />

      {/* Animated glows */}
      <div className="absolute -top-1/4 -right-1/4 w-[70vw] h-[70vw] rounded-full pointer-events-none animate-pulse"
           style={{ animationDuration: "8s", background: "radial-gradient(circle, rgba(37,99,235,0.08) 0%, rgba(6,182,212,0.04) 50%, transparent 75%)" }} />
      <div className="absolute -bottom-1/4 -left-1/4 w-[50vw] h-[50vw] rounded-full pointer-events-none animate-pulse"
           style={{ animationDuration: "10s", animationDelay: "2s", background: "radial-gradient(circle, rgba(232,24,138,0.04) 0%, rgba(123,47,247,0.03) 50%, transparent 70%)" }} />

      <div className="container-x relative pt-10 pb-16 md:pt-16 md:pb-28 grid lg:grid-cols-[1.1fr,1fr] gap-10 lg:gap-12 items-center">
        {/* Left content */}
        <div className="relative">
          {/* Trust badge */}
          <div className="inline-flex items-center gap-2 mb-6 px-3.5 py-1.5 rounded-full bg-tint-blue border border-primary/15 animate-fade-up">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-ok opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-ok" />
            </span>
            <span className="text-[10px] font-bold tracking-[0.18em] text-primary-700 uppercase">
              {t.home.heroTag}
            </span>
          </div>

          {/* Headline */}
          <h1 className="font-display text-[36px] sm:text-[44px] md:text-[54px] lg:text-[64px] leading-[1.02] font-extrabold tracking-tight text-ink animate-fade-up" style={{ animationDelay: "100ms" }}>
            <span className="block">{t.home.heroH1Pre}</span>
            <span className="block">{t.home.heroH1Mid}</span>
            <span className="block gradient-text">{t.home.heroH1Accent}</span>
          </h1>

          <p className="mt-6 text-[15px] md:text-[17px] text-ink-muted leading-[1.75] max-w-xl animate-fade-up" style={{ animationDelay: "200ms" }}>
            {t.home.heroSub}
          </p>

          {/* Mega Search */}
          <div className="mt-7 relative animate-fade-up" style={{ animationDelay: "300ms" }}>
            <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2.5 max-w-2xl">
              <div className="relative flex-1">
                <Icon name="search" size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onFocus={() => setSearchFocus(true)}
                  onBlur={() => setTimeout(() => setSearchFocus(false), 200)}
                  placeholder={t.home.heroSearch}
                  className="input h-14 pl-12 w-full rounded-2xl shadow-soft text-[14px] border-line focus:border-primary"
                />
              </div>
              <button type="submit" className="btn-primary h-14 px-7 rounded-2xl text-[14px]">
                {t.common.search}
                <Icon name="arrow" size={16} />
              </button>
            </form>

            {/* Mega search dropdown */}
            {searchFocus && filteredCats.length > 0 && (
              <div className="absolute top-[60px] left-0 right-0 max-w-2xl bg-white rounded-2xl shadow-hover border border-line p-2 z-30 animate-fade-up">
                <div className="text-[10px] font-bold tracking-wider text-ink-faint uppercase px-3 pt-1.5 pb-1">{t.common.categories}</div>
                {filteredCats.map((c) => (
                  <Link
                    key={c.slug}
                    href={`/${lang}/catalog?category=${c.slug}`}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-tint-blue transition-colors"
                  >
                    <div className="w-9 h-9 rounded-lg bg-tint-blue text-primary flex items-center justify-center">
                      <Icon name={c.icon} size={18} strokeWidth={1.75} />
                    </div>
                    <span className="text-[13px] font-medium text-ink">{getCategoryName(c.slug, lang)}</span>
                    <Icon name="arrow" size={13} className="ml-auto text-ink-faint" />
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Quick category chips */}
          <div className="mt-5 flex flex-wrap gap-1.5 items-center animate-fade-up" style={{ animationDelay: "400ms" }}>
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
          <div className="mt-8 flex flex-wrap gap-3 animate-fade-up" style={{ animationDelay: "500ms" }}>
            <Link href={`/${lang}/catalog`} className="btn-primary size-xl">
              {t.home.heroCta}
              <Icon name="arrow" size={16} />
            </Link>
            <a href={waLink(bulkInquiryMessage(lang))} target="_blank" rel="noopener noreferrer" className="btn-wa size-xl">
              <Icon name="chat" size={16} />
              {t.common.contactUs}
            </a>
          </div>
        </div>

        {/* Right — Logo showcase */}
        <div className="relative hidden lg:flex items-center justify-center">
          {/* Main container */}
          <div className="relative w-full aspect-square max-w-[560px]">
            {/* Outer ring with subtle gradient */}
            <div className="absolute inset-0 rounded-[3rem] bg-gradient-to-br from-tint-blue via-white to-tint-cyan p-[2px] shadow-card">
              <div className="w-full h-full rounded-[2.85rem] bg-white relative overflow-hidden">
                {/* Pattern */}
                <div className="absolute inset-0 opacity-[0.025]"
                     style={{
                       backgroundImage: "radial-gradient(circle, #2563EB 1px, transparent 1px)",
                       backgroundSize: "20px 20px",
                     }} />

                {/* Center logo */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="relative">
                    {/* Halo */}
                    <div className="absolute inset-0 rounded-full blur-[60px] opacity-40"
                         style={{ background: "radial-gradient(circle, #E8188A 0%, #7B2FF7 30%, #3B5BDB 60%, transparent 80%)" }} />
                    <img
                      src="/logo.png"
                      alt="Medoria"
                      className="relative w-48 h-48 object-contain drop-shadow-2xl animate-fade-up"
                      style={{ animationDuration: "1.2s" }}
                    />
                  </div>
                </div>

                {/* Floating category cards */}
                <FloatingCard top="8%"  left="6%"   delay={400}  icon="gloves"      label={getCategoryName("gloves", lang)} />
                <FloatingCard top="20%" right="6%"  delay={550}  icon="stethoscope" label={getCategoryName("instruments", lang)} />
                <FloatingCard top="50%" left="3%"   delay={700}  icon="mask"        label={getCategoryName("masks", lang)} />
                <FloatingCard top="68%" right="4%"  delay={850}  icon="thermometer" label={getCategoryName("diagnostics", lang)} />
                <FloatingCard bottom="8%" left="32%" delay={1000} icon="flask"      label={getCategoryName("lab", lang)} />
              </div>
            </div>

            {/* Bottom trust badge */}
            <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 bg-white shadow-card rounded-2xl px-5 py-3 flex items-center gap-3 border border-line animate-fade-up" style={{ animationDelay: "1200ms" }}>
              <div className="w-10 h-10 rounded-xl bg-ok/10 text-ok flex items-center justify-center">
                <Icon name="shield" size={20} />
              </div>
              <div className="text-[11px] leading-tight">
                <div className="font-bold text-ink">B2B Verified Supplier</div>
                <div className="text-ink-muted">Tajikistan · Direct Procurement</div>
              </div>
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
      className="absolute card px-3 py-2 flex items-center gap-2.5 shadow-card border-primary/10 opacity-0 animate-fade-up hover:scale-105 transition-transform"
      style={{ top, left, right, bottom, animationDelay: `${delay}ms`, animationDuration: "0.8s" }}
    >
      <div className="w-8 h-8 rounded-lg bg-tint-blue flex items-center justify-center shrink-0">
        <Icon name={icon} size={16} className="text-primary" strokeWidth={2} />
      </div>
      <div className="text-[11px] font-semibold text-ink leading-tight whitespace-nowrap">{label}</div>
    </div>
  );
}
