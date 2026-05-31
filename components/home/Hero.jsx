// components/home/Hero.jsx — theme-aware premium hero.
//   LIGHT = airy, bright, clinical (white + soft cyan/pink bloom, light glass)
//   DARK  = cinematic midnight + WebGL aurora/neon (shader runs in dark only)
// Drop-in banner photo slots remain: /public/images/hero-medical-banner[-mobile].jpg
"use client";
import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { motion, useReducedMotion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { getTranslations, CATEGORIES, getCategoryName } from "@/lib/i18n";
import { waLink, bulkInquiryMessage } from "@/lib/whatsapp";
import Icon from "@/components/shared/Icon";
import Aurora from "@/components/shared/Aurora";
import Brand from "@/components/layout/Brand";

const HeroScene = dynamic(() => import("@/components/home/HeroScene"), { ssr: false });
const EASE = [0.2, 0.8, 0.2, 1];

export default function Hero({ lang }) {
  const t = getTranslations(lang);
  const router = useRouter();
  const reduce = useReducedMotion();
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [q, setQ] = useState("");
  const [searchFocus, setSearchFocus] = useState(false);
  const [canRender3D, setCanRender3D] = useState(false);
  useEffect(() => {
    setMounted(true);
    try {
      const desktop = window.matchMedia("(min-width: 1024px)").matches;
      const ok = desktop
        && !window.matchMedia("(prefers-reduced-motion: reduce)").matches
        && (navigator.hardwareConcurrency || 4) >= 4
        && !(navigator.connection && navigator.connection.saveData);
      setCanRender3D(ok);
    } catch { /* keep CSS fallback */ }
  }, []);
  const isDark = mounted && resolvedTheme === "dark";

  // ── subtle mouse parallax for the hero card (desktop, motion-safe) ──
  const mx = useMotionValue(0), my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 38, damping: 26 });
  const sy = useSpring(my, { stiffness: 38, damping: 26 });
  const cardX = useTransform(sx, [-0.5, 0.5], [8, -8]);
  const cardY = useTransform(sy, [-0.5, 0.5], [6, -6]);
  const rotY = useTransform(sx, [-0.5, 0.5], [-3, 3]);
  const rotX = useTransform(sy, [-0.5, 0.5], [2, -2]);
  const onMove = (e) => {
    if (reduce) return;
    const r = e.currentTarget.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width - 0.5);
    my.set((e.clientY - r.top) / r.height - 0.5);
  };

  const submit = (e) => {
    e.preventDefault();
    router.push(q.trim() ? `/${lang}/catalog?q=${encodeURIComponent(q.trim())}` : `/${lang}/catalog`);
  };
  const filteredCats = q.trim()
    ? CATEGORIES.filter((c) => getCategoryName(c.slug, lang).toLowerCase().includes(q.toLowerCase()))
    : [];

  const trust = [
    { icon: "package", label: lang === "fa" ? "۱۰۰۰+ محصول" : lang === "ru" ? "1000+ товаров" : lang === "tg" ? "1000+ мол" : "1000+ products" },
    { icon: "truck", label: lang === "fa" ? "تحویل سریع" : lang === "ru" ? "Быстрая доставка" : lang === "tg" ? "Расондани зуд" : "Fast delivery" },
    { icon: "badgeCheck", label: lang === "fa" ? "تأمین‌کننده‌ی معتبر" : lang === "ru" ? "Проверенный поставщик" : lang === "tg" ? "Боэътимод" : "Verified supplier" },
  ];

  // entrance variants (blur + rise), reduced-motion safe
  const container = { hidden: {}, show: { transition: { staggerChildren: reduce ? 0 : 0.09, delayChildren: 0.05 } } };
  const item = {
    hidden: reduce ? {} : { opacity: 0, y: 22, filter: "blur(10px)" },
    show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.7, ease: EASE } },
  };

  return (
    <section onMouseMove={onMove} className="relative overflow-hidden isolate text-ink dark:text-white">
      {/* ── LIGHT base: airy white + soft brand bloom ── */}
      <div className="absolute inset-0 -z-20 bg-white dark:hidden" />
      <div className="absolute inset-0 -z-10 dark:hidden" style={{
        background:
          "radial-gradient(60% 55% at 78% 18%, rgba(34,211,238,0.16) 0%, transparent 60%)," +
          "radial-gradient(55% 50% at 88% 60%, rgba(240,40,158,0.12) 0%, transparent 60%)," +
          "radial-gradient(70% 60% at 10% 90%, rgba(59,130,246,0.12) 0%, transparent 60%)," +
          "linear-gradient(180deg,#FFFFFF 0%,#F4F8FE 60%,#FFFFFF 100%)",
      }} />
      {/* ── DARK base: cinematic midnight ── */}
      <div className="absolute inset-0 -z-20 hidden dark:block" style={{
        background: "linear-gradient(135deg,#070A14 0%,#141036 45%,#0A1E45 76%,#06243B 100%)",
      }} />
      <div className="absolute inset-0 -z-10 bg-cover bg-center hidden dark:md:block opacity-50"
           style={{ backgroundImage: "url(/images/hero-medical-banner.jpg)" }} />

      {/* auroras — soft on light, neon on dark */}
      <Aurora variant="light" className="-z-10 dark:hidden opacity-90" />
      <Aurora variant="dark" className="-z-10 hidden dark:block opacity-70" />
      {/* 3D particle field — DARK theme, capable desktops only (CSS aurora is the fallback) */}
      {isDark && canRender3D && <HeroScene />}

      {/* dark contrast overlay (keeps text crisp over shader/photo) */}
      <div className="absolute inset-0 -z-10 hidden dark:block bg-gradient-to-t from-navy via-navy/55 to-navy/25" />
      {/* dot grid */}
      <div className="absolute inset-0 -z-10 opacity-[0.5] dark:opacity-[0.35] pointer-events-none"
           style={{ backgroundImage: "radial-gradient(circle, rgba(99,102,241,0.13) 1px, transparent 1px)", backgroundSize: "30px 30px", maskImage: "radial-gradient(circle at 50% 10%, black, transparent 72%)" }} />

      <motion.div
        variants={container} initial="hidden" animate="show"
        className="container-x relative pt-14 pb-20 md:pt-20 md:pb-28 grid lg:grid-cols-[1.12fr,0.88fr] gap-10 items-center min-h-[76vh]"
      >
        {/* ── Content ─────────────────────────────────────────────── */}
        <div className="relative max-w-2xl">
          <motion.div variants={item} className="inline-flex items-center gap-2 mb-6 rounded-full px-3.5 py-1.5 border bg-surface/80 border-line text-ink-soft dark:bg-white/10 dark:border-white/15 dark:text-white/90 backdrop-blur shadow-soft dark:shadow-none">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
            </span>
            <span className="text-[10px] font-bold tracking-[0.18em] uppercase">{t.home.heroTag}</span>
          </motion.div>

          <motion.h1 variants={item} className="font-display text-[40px] sm:text-[50px] md:text-[58px] lg:text-[66px] leading-[1.02] font-extrabold tracking-tight">
            <span className="block">{t.home.heroH1Pre}</span>
            <span className="block">{t.home.heroH1Mid}</span>
            <span className="block gradient-text-animated">{t.home.heroH1Accent}</span>
          </motion.h1>

          <motion.p variants={item} className="mt-6 text-[15px] md:text-[17px] text-ink-muted dark:text-white/70 leading-[1.75] max-w-xl">
            {t.home.heroSub}
          </motion.p>

          {/* search */}
          <motion.div variants={item} className="mt-7 relative max-w-xl">
            <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <Icon name="search" size={18} className="absolute start-4 top-1/2 -translate-y-1/2 text-ink-faint dark:text-white/50 pointer-events-none" />
                <input
                  value={q} onChange={(e) => setQ(e.target.value)}
                  onFocus={() => setSearchFocus(true)} onBlur={() => setTimeout(() => setSearchFocus(false), 200)}
                  placeholder={t.home.heroSearch}
                  className="h-14 w-full ps-12 pe-4 rounded-2xl text-[14px] bg-surface border border-line text-ink placeholder:text-ink-faint shadow-soft outline-none transition-all focus:border-brand-violet/50 dark:bg-white/10 dark:border-white/20 dark:text-white dark:placeholder:text-white/50 dark:shadow-none dark:focus:border-cyan-400/60"
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
                  <Link key={c.slug} href={`/${lang}/catalog?category=${c.slug}`} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-brand-violet/5 transition-colors">
                    <div className="w-9 h-9 rounded-lg bg-brand-violet/10 text-brand-violet flex items-center justify-center"><Icon name={c.icon} size={18} strokeWidth={1.75} /></div>
                    <span className="text-[13px] font-medium text-ink">{getCategoryName(c.slug, lang)}</span>
                    <Icon name={lang === "fa" ? "arrowL" : "arrow"} size={13} className="ms-auto text-ink-faint" />
                  </Link>
                ))}
              </div>
            )}
          </motion.div>

          {/* category chips */}
          <motion.div variants={item} className="mt-5 flex flex-wrap gap-2 items-center">
            <span className="text-[11px] text-ink-faint dark:text-white/50 me-1">{t.common.categories}:</span>
            {CATEGORIES.slice(0, 4).map((c) => (
              <Link key={c.slug} href={`/${lang}/catalog?category=${c.slug}`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-medium transition-all bg-surface/80 border-line text-ink-muted hover:text-brand-violet hover:border-brand-violet/30 shadow-soft dark:bg-white/10 dark:border-white/15 dark:text-white/80 dark:hover:bg-white/20 dark:hover:text-white dark:shadow-none">
                <Icon name={c.icon} size={12} className="text-cyan-600 dark:text-cyan-300" strokeWidth={2} />
                {getCategoryName(c.slug, lang)}
              </Link>
            ))}
          </motion.div>

          {/* CTAs */}
          <motion.div variants={item} className="mt-8 flex flex-wrap gap-3">
            <Link href={`/${lang}/catalog`} className="btn-primary size-xl group">
              {t.home.heroCta}
              <Icon name={lang === "fa" ? "arrowL" : "arrow"} size={16} className="transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
            </Link>
            <a href={waLink(bulkInquiryMessage(lang))} target="_blank" rel="noopener noreferrer" className="btn-wa size-xl">
              <Icon name="chat" size={16} />
              {t.common.contactUs}
            </a>
          </motion.div>

          {/* trust row */}
          <motion.div variants={item} className="mt-8 flex flex-wrap gap-x-5 gap-y-2">
            {trust.map((it) => (
              <div key={it.label} className="flex items-center gap-2 text-[12px] text-ink-muted dark:text-white/65">
                <Icon name={it.icon} size={15} className="text-cyan-600 dark:text-cyan-300" />
                {it.label}
              </div>
            ))}
          </motion.div>
        </div>

        {/* ── Floating brand card (lg+), with parallax tilt ───────── */}
        <motion.div variants={item} className="relative hidden lg:flex items-center justify-center" style={{ perspective: 1200 }}>
          <motion.div style={reduce ? undefined : { x: cardX, y: cardY, rotateX: rotX, rotateY: rotY }} className="relative w-full max-w-md will-change-transform">
            <div className="absolute inset-0 rounded-[2rem] bg-brand-conic blur-[64px] opacity-20 dark:opacity-30 animate-spin-slow" />
            <div className="relative rounded-[2rem] p-7 border bg-white/70 border-line shadow-card backdrop-blur-xl dark:bg-white/[0.07] dark:border-white/15 dark:shadow-brand-lg">
              <div className="flex items-center justify-between gap-3 mb-5">
                <div dir="ltr" className="flex items-center gap-2.5">
                  <Brand height={22} />
                </div>
                <span className="w-8 h-8 rounded-full bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 flex items-center justify-center"><Icon name="badgeCheck" size={16} /></span>
              </div>
              <div className="text-[11px] text-ink-muted dark:text-white/60 -mt-3 mb-5">B2B Medical · Tajikistan</div>
              <div className="grid grid-cols-3 gap-2.5 mb-5">
                {CATEGORIES.slice(0, 6).map((c) => (
                  <Link key={c.slug} href={`/${lang}/catalog?category=${c.slug}`}
                    className="aspect-square rounded-2xl border flex flex-col items-center justify-center gap-1.5 transition-all group bg-brand-violet/[0.05] border-line hover:border-brand-violet/30 hover:bg-brand-violet/[0.09] dark:bg-white/[0.06] dark:border-white/10 dark:hover:bg-white/[0.12]">
                    <Icon name={c.icon} size={20} className="text-brand-violet dark:text-cyan-200 group-hover:scale-110 transition-transform" strokeWidth={1.6} />
                    <span className="text-[8px] text-ink-faint dark:text-white/55 leading-none text-center px-1">{getCategoryName(c.slug, lang).split(" ")[0]}</span>
                  </Link>
                ))}
              </div>
              <Link href={`/${lang}/catalog`} className="flex items-center justify-between rounded-xl border px-4 py-3 transition-colors bg-brand-violet/[0.05] border-line hover:bg-brand-violet/[0.09] dark:bg-white/[0.06] dark:border-white/10 dark:hover:bg-white/[0.12]">
                <span className="text-[12px] font-semibold text-ink dark:text-white">{t.home.heroCta}</span>
                <Icon name={lang === "fa" ? "arrowL" : "arrowUpRight"} size={15} className="text-brand-violet dark:text-cyan-300" />
              </Link>
            </div>
          </motion.div>
        </motion.div>
      </motion.div>

      {/* fade into body */}
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-canvas pointer-events-none" />
    </section>
  );
}
