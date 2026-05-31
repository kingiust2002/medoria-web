// components/home/Hero.jsx — premium full-width cinematic banner (brand spectrum)
// Background image slots (drop-in, silent fallback to brand gradient):
//   /public/images/hero-medical-banner.jpg         (desktop, ~2400×1200)
//   /public/images/hero-medical-banner-mobile.jpg  (mobile,  ~1080×1350)
"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getTranslations, CATEGORIES, getCategoryName } from "@/lib/i18n";
import { waLink, bulkInquiryMessage } from "@/lib/whatsapp";
import Icon from "@/components/shared/Icon";
import Aurora from "@/components/shared/Aurora";

// Lazy, client-only premium WebGL aurora (self-gates to desktop / non-reduced-motion).
const HeroShader = dynamic(() => import("@/components/home/HeroShader"), { ssr: false });

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

  const filteredCats = q.trim()
    ? CATEGORIES.filter((c) => getCategoryName(c.slug, lang).toLowerCase().includes(q.toLowerCase()))
    : [];

  const trust = [
    { icon: "package", label: lang === "fa" ? "۱۰۰۰+ محصول" : lang === "ru" ? "1000+ товаров" : lang === "tg" ? "1000+ мол" : "1000+ products" },
    { icon: "truck",   label: lang === "fa" ? "تحویل سریع" : lang === "ru" ? "Быстрая доставка" : lang === "tg" ? "Расондани зуд" : "Fast delivery" },
    { icon: "badgeCheck", label: lang === "fa" ? "تأمین‌کننده‌ی معتبر" : lang === "ru" ? "Проверенный поставщик" : lang === "tg" ? "Таъминкунандаи боэътимод" : "Verified supplier" },
  ];

  return (
    <section className="relative overflow-hidden bg-navy text-white isolate">
      {/* base brand gradient (shows when no banner photo yet) */}
      <div className="absolute inset-0 -z-10" style={{ background: "linear-gradient(135deg,#0A0E1A 0%,#15123A 45%,#0B1E45 75%,#06243B 100%)" }} />

      {/* drop-in banner photo slots (silently absent until the file exists) */}
      <div className="absolute inset-0 -z-10 bg-cover bg-center hidden md:block opacity-60"
           style={{ backgroundImage: "url(/images/hero-medical-banner.jpg)" }} />
      <div className="absolute inset-0 -z-10 bg-cover bg-center md:hidden opacity-50"
           style={{ backgroundImage: "url(/images/hero-medical-banner-mobile.jpg)" }} />

      {/* animated aurora (CSS fallback) + premium WebGL aurora on top (desktop, gated) */}
      <Aurora variant="dark" className="-z-10 opacity-70" />
      <HeroShader />
      <div className="absolute inset-0 -z-10 bg-gradient-to-t from-navy via-navy/55 to-navy/25" />
      <div className="absolute inset-0 -z-10 opacity-[0.35]"
           style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.16) 1px, transparent 1px)", backgroundSize: "30px 30px", maskImage: "radial-gradient(circle at 50% 0%, black, transparent 70%)" }} />

      <div className="container-x relative pt-14 pb-20 md:pt-20 md:pb-28 grid lg:grid-cols-[1.15fr,0.85fr] gap-10 items-center min-h-[78vh]">
        {/* ── Content ─────────────────────────────────────────────── */}
        <div className="relative max-w-2xl">
          {/* eyebrow */}
          <div className="inline-flex items-center gap-2 mb-6 rounded-full px-3.5 py-1.5 bg-white/10 backdrop-blur border border-white/15 animate-fade-up">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400" />
            </span>
            <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-white/90">{t.home.heroTag}</span>
          </div>

          {/* headline */}
          <h1 className="font-display text-[40px] sm:text-[50px] md:text-[58px] lg:text-[68px] leading-[1.01] font-extrabold tracking-tight animate-fade-up" style={{ animationDelay: "100ms" }}>
            <span className="block text-white">{t.home.heroH1Pre}</span>
            <span className="block text-white">{t.home.heroH1Mid}</span>
            <span className="block gradient-text-animated">{t.home.heroH1Accent}</span>
          </h1>

          <p className="mt-6 text-[15px] md:text-[17px] text-white/70 leading-[1.75] max-w-xl animate-fade-up" style={{ animationDelay: "200ms" }}>
            {t.home.heroSub}
          </p>

          {/* search */}
          <div className="mt-7 relative animate-fade-up max-w-xl" style={{ animationDelay: "300ms" }}>
            <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <Icon name="search" size={18} className="absolute start-4 top-1/2 -translate-y-1/2 text-white/50 pointer-events-none" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onFocus={() => setSearchFocus(true)}
                  onBlur={() => setTimeout(() => setSearchFocus(false), 200)}
                  placeholder={t.home.heroSearch}
                  className="h-14 w-full ps-12 pe-4 rounded-2xl text-[14px] text-white placeholder:text-white/50 bg-white/10 backdrop-blur-xl border border-white/20 outline-none transition-all focus:border-cyan-400/60 focus:bg-white/15"
                />
              </div>
              <button type="submit" className="btn-primary h-14 px-7 rounded-2xl text-[14px]">
                {t.common.search}
                <Icon name={lang === "fa" ? "arrowL" : "arrow"} size={16} />
              </button>
            </form>

            {searchFocus && filteredCats.length > 0 && (
              <div className="absolute top-[60px] inset-x-0 sm:end-auto sm:w-[calc(100%-9rem)] bg-surface rounded-2xl shadow-hover border border-line p-2 z-30 animate-fade-up">
                <div className="text-[10px] font-bold tracking-wider text-ink-faint uppercase px-3 pt-1.5 pb-1">{t.common.categories}</div>
                {filteredCats.map((c) => (
                  <Link key={c.slug} href={`/${lang}/catalog?category=${c.slug}`}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-brand-violet/5 transition-colors">
                    <div className="w-9 h-9 rounded-lg bg-brand-violet/10 text-brand-violet flex items-center justify-center">
                      <Icon name={c.icon} size={18} strokeWidth={1.75} />
                    </div>
                    <span className="text-[13px] font-medium text-ink">{getCategoryName(c.slug, lang)}</span>
                    <Icon name={lang === "fa" ? "arrowL" : "arrow"} size={13} className="ms-auto text-ink-faint" />
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* category chips */}
          <div className="mt-5 flex flex-wrap gap-2 items-center animate-fade-up" style={{ animationDelay: "400ms" }}>
            <span className="text-[11px] text-white/50 me-1">{t.common.categories}:</span>
            {CATEGORIES.slice(0, 4).map((c) => (
              <Link key={c.slug} href={`/${lang}/catalog?category=${c.slug}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur border border-white/15 text-[11px] font-medium text-white/80 hover:bg-white/20 hover:text-white transition-all">
                <Icon name={c.icon} size={12} className="text-cyan-300" strokeWidth={2} />
                {getCategoryName(c.slug, lang)}
              </Link>
            ))}
          </div>

          {/* CTAs */}
          <div className="mt-8 flex flex-wrap gap-3 animate-fade-up" style={{ animationDelay: "500ms" }}>
            <Link href={`/${lang}/catalog`} className="btn-primary size-xl">
              {t.home.heroCta}
              <Icon name={lang === "fa" ? "arrowL" : "arrow"} size={16} />
            </Link>
            <a href={waLink(bulkInquiryMessage(lang))} target="_blank" rel="noopener noreferrer" className="btn-wa size-xl">
              <Icon name="chat" size={16} />
              {t.common.contactUs}
            </a>
          </div>

          {/* trust row */}
          <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 animate-fade-up" style={{ animationDelay: "600ms" }}>
            {trust.map((it) => (
              <div key={it.label} className="flex items-center gap-2 text-[12px] text-white/65">
                <Icon name={it.icon} size={15} className="text-cyan-300" />
                {it.label}
              </div>
            ))}
          </div>
        </div>

        {/* ── Floating brand card (lg+) ───────────────────────────── */}
        <div className="relative hidden lg:flex items-center justify-center">
          <div className="relative w-full max-w-sm animate-fade-up" style={{ animationDelay: "350ms" }}>
            {/* glow */}
            <div className="absolute inset-0 rounded-[2rem] bg-brand-conic blur-[60px] opacity-30 animate-spin-slow" />
            <div className="relative rounded-[2rem] p-7 bg-white/[0.07] backdrop-blur-xl border border-white/15 shadow-brand-lg">
              <div className="flex items-center gap-3 mb-5">
                <img src="/logo-mark.png" alt="Medoria" className="w-12 h-12 object-contain animate-float-slow" />
                <div>
                  <div className="font-display font-extrabold text-white text-lg leading-none">Medoria</div>
                  <div className="text-[11px] text-white/60 mt-1">B2B Medical · Tajikistan</div>
                </div>
                <span className="ms-auto w-8 h-8 rounded-full bg-cyan-400/15 text-cyan-300 flex items-center justify-center">
                  <Icon name="badgeCheck" size={16} />
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2.5 mb-5">
                {CATEGORIES.slice(0, 6).map((c) => (
                  <Link key={c.slug} href={`/${lang}/catalog?category=${c.slug}`}
                    className="aspect-square rounded-2xl bg-white/[0.06] border border-white/10 flex flex-col items-center justify-center gap-1.5 hover:bg-white/[0.12] transition-colors group">
                    <Icon name={c.icon} size={20} className="text-cyan-200 group-hover:scale-110 transition-transform" strokeWidth={1.6} />
                    <span className="text-[8px] text-white/55 leading-none text-center px-1">{getCategoryName(c.slug, lang).split(" ")[0]}</span>
                  </Link>
                ))}
              </div>
              <Link href={`/${lang}/catalog`} className="flex items-center justify-between rounded-xl bg-white/[0.06] border border-white/10 px-4 py-3 hover:bg-white/[0.12] transition-colors">
                <span className="text-[12px] font-semibold text-white">{t.home.heroCta}</span>
                <Icon name={lang === "fa" ? "arrowL" : "arrowUpRight"} size={15} className="text-cyan-300" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* fade into light body */}
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-canvas pointer-events-none" />
    </section>
  );
}
