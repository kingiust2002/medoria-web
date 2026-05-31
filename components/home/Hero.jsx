// components/home/Hero.jsx — premium gradient hero (brand spectrum from the logo)
"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getTranslations, CATEGORIES, getCategoryName } from "@/lib/i18n";
import { waLink, bulkInquiryMessage } from "@/lib/whatsapp";
import Icon from "@/components/shared/Icon";
import Aurora from "@/components/shared/Aurora";
import ImagePlaceholder from "@/components/shared/ImagePlaceholder";

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

  return (
    <section className="relative overflow-hidden bg-canvas-soft">
      <Aurora />
      {/* dot grid wash */}
      <div
        className="absolute inset-0 opacity-[0.5] pointer-events-none"
        style={{ backgroundImage: "radial-gradient(circle, rgba(99,102,241,0.10) 1px, transparent 1px)", backgroundSize: "26px 26px", maskImage: "radial-gradient(circle at 50% 30%, black, transparent 75%)" }}
      />

      <div className="container-x relative pt-12 pb-16 md:pt-20 md:pb-28 grid lg:grid-cols-[1.05fr,1fr] gap-12 lg:gap-10 items-center">
        {/* ── Left content ─────────────────────────────────────────── */}
        <div className="relative">
          {/* Eyebrow */}
          <div className="inline-flex items-center gap-2 mb-6 eyebrow animate-fade-up">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-ok opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-ok" />
            </span>
            <span className="gradient-text">{t.home.heroTag}</span>
          </div>

          {/* Headline */}
          <h1 className="font-display text-[38px] sm:text-[46px] md:text-[56px] lg:text-[66px] leading-[1.02] font-extrabold tracking-tight text-ink animate-fade-up" style={{ animationDelay: "100ms" }}>
            <span className="block">{t.home.heroH1Pre}</span>
            <span className="block">{t.home.heroH1Mid}</span>
            <span className="block gradient-text-animated">{t.home.heroH1Accent}</span>
          </h1>

          <p className="mt-6 text-[15px] md:text-[17px] text-ink-muted leading-[1.75] max-w-xl animate-fade-up" style={{ animationDelay: "200ms" }}>
            {t.home.heroSub}
          </p>

          {/* Mega search */}
          <div className="mt-7 relative animate-fade-up max-w-2xl" style={{ animationDelay: "300ms" }}>
            <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <Icon name="search" size={18} className="absolute start-4 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onFocus={() => setSearchFocus(true)}
                  onBlur={() => setTimeout(() => setSearchFocus(false), 200)}
                  placeholder={t.home.heroSearch}
                  className="h-14 w-full ps-12 pe-4 rounded-2xl text-[14px] text-ink bg-white/80 backdrop-blur-xl border border-white/70 shadow-card outline-none transition-all focus:border-brand-violet/50 focus:shadow-ring"
                />
              </div>
              <button type="submit" className="btn-primary h-14 px-7 rounded-2xl text-[14px]">
                {t.common.search}
                <Icon name={lang === "fa" ? "arrowL" : "arrow"} size={16} />
              </button>
            </form>

            {searchFocus && filteredCats.length > 0 && (
              <div className="absolute top-[60px] inset-x-0 sm:end-auto sm:w-[calc(100%-9rem)] glass rounded-2xl p-2 z-30 animate-fade-up">
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

          {/* Quick category chips */}
          <div className="mt-5 flex flex-wrap gap-2 items-center animate-fade-up" style={{ animationDelay: "400ms" }}>
            <span className="text-[11px] text-ink-faint me-1">{t.common.categories}:</span>
            {CATEGORIES.slice(0, 4).map((c) => (
              <Link key={c.slug} href={`/${lang}/catalog?category=${c.slug}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/70 backdrop-blur border border-white/70 text-[11px] font-medium text-ink-muted hover:text-brand-violet hover:border-brand-violet/30 hover:shadow-soft transition-all">
                <Icon name={c.icon} size={12} className="text-brand-violet" strokeWidth={2} />
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
        </div>

        {/* ── Right visual ─────────────────────────────────────────── */}
        <div className="relative hidden lg:block">
          {/* spinning conic glow */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-[80%] aspect-square rounded-full bg-brand-conic blur-[70px] opacity-25 animate-spin-slow" />
          </div>

          <div className="relative grid grid-cols-2 grid-rows-[auto,auto] gap-4">
            {/* Main hero photo zone */}
            <div className="col-span-2 relative animate-fade-up" style={{ animationDelay: "300ms" }}>
              <ImagePlaceholder
                icon="image"
                label={lang === "fa" ? "تصویر محصولات یا انبار" : lang === "tg" ? "Расм" : lang === "en" ? "Product / facility photo" : "Фото товаров"}
                className="aspect-[16/10] w-full"
                rounded="rounded-[2rem]"
              />
              {/* logo badge floating over */}
              <div className="absolute -bottom-6 start-6 glass rounded-2xl px-4 py-3 flex items-center gap-3 animate-float-slow">
                <img src="/logo.png" alt="Medoria" className="w-10 h-10 object-contain drop-shadow" />
                <div className="leading-tight">
                  <div className="font-display font-extrabold text-ink text-[15px]">Medoria</div>
                  <div className="text-[10px] text-ink-muted">B2B Medical · Tajikistan</div>
                </div>
              </div>
              {/* verified pill */}
              <div className="absolute top-4 end-4 glass rounded-full ps-2 pe-3 py-1.5 flex items-center gap-1.5 animate-float">
                <span className="w-6 h-6 rounded-full bg-ok/15 text-ok flex items-center justify-center">
                  <Icon name="badgeCheck" size={13} />
                </span>
                <span className="text-[10px] font-bold text-ink">Verified Supplier</span>
              </div>
            </div>

            {/* Stat card */}
            <div className="relative card p-4 overflow-hidden animate-fade-up" style={{ animationDelay: "450ms" }}>
              <div className="absolute -top-6 -end-6 w-20 h-20 rounded-full bg-brand-gradient opacity-10 blur-xl" />
              <div className="relative">
                <div className="text-2xl font-display font-extrabold gradient-text leading-none">1000+</div>
                <div className="text-[11px] text-ink-muted mt-1.5">{t.home.stats?.[0]?.[1] || "Products"}</div>
              </div>
            </div>

            {/* Category mini card */}
            <div className="relative card p-4 flex items-center gap-3 animate-fade-up" style={{ animationDelay: "600ms" }}>
              <div className="w-10 h-10 rounded-xl bg-brand-gradient text-white flex items-center justify-center shadow-brand shrink-0">
                <Icon name="truck" size={18} />
              </div>
              <div className="leading-tight min-w-0">
                <div className="text-[12px] font-bold text-ink truncate">{lang === "fa" ? "تحویل سریع" : lang === "tg" ? "Расондан" : lang === "en" ? "Fast delivery" : "Доставка"}</div>
                <div className="text-[10px] text-ink-faint truncate">{lang === "fa" ? "سراسر تاجیکستان" : "Tajikistan"}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* bottom fade into next section */}
      <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-b from-transparent to-white pointer-events-none" />
    </section>
  );
}
