// components/beauty/home/Hero.jsx — verbatim copy of the Health hero, beauty-ized:
// same layout/classes/motion; beauty i18n; light-only (Beauty is light-first);
// no product fetch (worlds + "soon" fill the featured card); banner slot from
// /public/beauty/hero. Colors remap via the [data-vertical="beauty"] scope.
"use client";
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";
import { motion, useReducedMotion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { getBeautyTranslations as getTranslations, BEAUTY_CATEGORIES as CATEGORIES, getCategoryName } from "@/components/beauty/i18n";
import { waLink, bulkInquiryMessage } from "@/lib/whatsapp";
import Icon from "@/components/shared/Icon";
import Aurora from "@/components/shared/Aurora";
import { BeautyWordmarkImg } from "@/components/beauty/BeautyBrand";

const BeautyHeroScene = dynamic(() => import("@/components/beauty/home/BeautyHeroScene"), { ssr: false });
const EASE = [0.2, 0.8, 0.2, 1];

// Localized particle words (canvas-sampled, so short + bold reads best). fa
// keeps the Latin fallback set — Arabic-script canvas text shaping is
// unreliable at small offscreen-canvas sizes, so we deliberately don't sample
// Farsi glyphs here; the rest of the Beauty page is still fully RTL/Farsi.
const PARTICLE_WORDS = {
  tg: ["MEDORIA", "ЗЕБОӢ", "НУР", "ЭЪТИМОД"],
  ru: ["MEDORIA", "КРАСОТА", "СИЯНИЕ", "УХОД"],
  en: ["MEDORIA", "BEAUTY", "GLOW", "RITUAL"],
  fa: ["MEDORIA", "BEAUTY", "GLOW", "TRUST"],
};

export default function Hero({ lang, banner }) {
  const t = getTranslations(lang);
  const reduce = useReducedMotion();
  const [q, setQ] = useState("");
  const [searchFocus, setSearchFocus] = useState(false);

  // ── Particle scene eligibility — same bar as the Health hero (desktop,
  // motion-safe, capable device, no data-saver), plus a graduated particle
  // count instead of a hard on/off so mid-tier devices still get a lighter
  // version of the effect rather than nothing.
  const [mounted, setMounted] = useState(false);
  const [particleCount, setParticleCount] = useState(0); // 0 = ineligible
  useEffect(() => {
    setMounted(true);
    try {
      const desktop = window.matchMedia("(min-width: 1024px)").matches;
      const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const saveData = Boolean(navigator.connection && navigator.connection.saveData);
      const cores = navigator.hardwareConcurrency || 4;
      if (desktop && !reducedMotion && !saveData && cores >= 4) {
        setParticleCount(cores >= 8 ? 3200 : 2000); // reduce particles on weaker devices
      }
    } catch { /* keep the CSS/gradient fallback */ }
  }, []);

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
    document.querySelector("#worlds")?.scrollIntoView({ behavior: "smooth" });
  };
  const filteredCats = q.trim()
    ? CATEGORIES.filter((c) => getCategoryName(c.slug, lang).toLowerCase().includes(q.toLowerCase()))
    : [];

  const trust = [
    { icon: "package", label: lang === "fa" ? "برندهای جهانی" : lang === "ru" ? "Мировые бренды" : lang === "tg" ? "Брендҳои ҷаҳонӣ" : "World brands" },
    { icon: "truck", label: lang === "fa" ? "ارسال سریع" : lang === "ru" ? "Быстрая доставка" : lang === "tg" ? "Расондани зуд" : "Fast delivery" },
    { icon: "badgeCheck", label: lang === "fa" ? "تأمین‌کننده‌ی معتبر" : lang === "ru" ? "Проверенный поставщик" : lang === "tg" ? "Боэътимод" : "Verified supplier" },
  ];

  // entrance variants (blur + rise), reduced-motion safe
  const container = { hidden: {}, show: { transition: { staggerChildren: reduce ? 0 : 0.09, delayChildren: 0.05 } } };
  const item = {
    hidden: reduce ? {} : { opacity: 0, y: 22, filter: "blur(10px)" },
    show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.7, ease: EASE } },
  };

  return (
    <section onMouseMove={onMove} className="relative overflow-hidden isolate text-ink">
      {/* ── LIGHT base: airy ivory + soft copper bloom ── */}
      <div className="absolute inset-0 -z-20 bg-white" />
      <div className="absolute inset-0 -z-10" style={{
        background:
          "radial-gradient(60% 55% at 78% 18%, rgba(200,125,78,0.16) 0%, transparent 60%)," +
          "radial-gradient(55% 50% at 88% 60%, rgba(231,197,151,0.20) 0%, transparent 60%)," +
          "radial-gradient(70% 60% at 10% 90%, rgba(28,41,81,0.10) 0%, transparent 60%)," +
          "linear-gradient(180deg,#FFFFFF 0%,#FAF3EB 60%,#FFFFFF 100%)",
      }} />
      {/* hero banner photo — drop /beauty/hero/hero-banner-light.webp */}
      {banner && (
        <div className="absolute inset-0 -z-10" aria-hidden="true">
          <Image src={banner} alt="" fill sizes="100vw" className="object-cover opacity-[0.25]" style={{ objectPosition: "left center" }} />
        </div>
      )}

      {/* aurora — soft light wash */}
      <Aurora variant="light" className="-z-10 opacity-90" />

      {/* champagne dust / pearl dew particle scene — desktop + capable devices
          only; confined to this hero section, never the whole page. */}
      {mounted && particleCount > 0 && (
        <BeautyHeroScene rtl={lang === "fa"} words={PARTICLE_WORDS[lang] || PARTICLE_WORDS.en} particleCount={particleCount} />
      )}

      {/* dot grid */}
      <div className="absolute inset-0 -z-10 opacity-[0.5] pointer-events-none"
           style={{ backgroundImage: "radial-gradient(circle, rgba(178,110,63,0.13) 1px, transparent 1px)", backgroundSize: "30px 30px", maskImage: "radial-gradient(circle at 50% 10%, black, transparent 72%)" }} />

      <motion.div
        variants={container} initial="hidden" animate="show"
        className="container-x relative pt-14 pb-20 md:pt-20 md:pb-28 grid lg:grid-cols-[1.12fr,0.88fr] gap-10 items-center min-h-[76vh]"
      >
        {/* ── Content ─────────────────────────────────────────────── */}
        <div className="relative max-w-2xl">
          <motion.div variants={item} className="inline-flex items-center gap-2 mb-6 rounded-full px-3.5 py-1.5 border bg-surface/80 border-line text-ink-soft backdrop-blur shadow-soft">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500" />
            </span>
            <span className="text-[10px] font-bold tracking-[0.18em] uppercase">{t.home.heroTag}</span>
          </motion.div>

          <motion.h1 variants={item} className="font-display text-[40px] sm:text-[50px] md:text-[58px] lg:text-[66px] leading-[1.1] font-extrabold tracking-tight">
            <span className="block">{t.home.heroH1Pre}</span>
            <span className="block">{t.home.heroH1Mid}</span>
            <span className="block gradient-text-animated leading-[1.18] pb-2">{t.home.heroH1Accent}</span>
          </motion.h1>

          <motion.p variants={item} className="mt-6 text-[15px] md:text-[17px] text-ink-muted leading-[1.75] max-w-xl">
            {t.home.heroSub}
          </motion.p>

          {/* search */}
          <motion.div variants={item} className="mt-7 relative max-w-xl">
            <form onSubmit={submit} className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <Icon name="search" size={18} className="absolute start-4 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none" />
                <input
                  value={q} onChange={(e) => setQ(e.target.value)}
                  onFocus={() => setSearchFocus(true)} onBlur={() => setTimeout(() => setSearchFocus(false), 200)}
                  placeholder={t.home.heroSearch}
                  className="h-14 w-full ps-12 pe-4 rounded-2xl text-[14px] bg-surface border border-line text-ink placeholder:text-ink-faint shadow-soft outline-none transition-all focus:border-brand-violet/50"
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
                  <a key={c.slug} href="#worlds" className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-brand-violet/5 transition-colors">
                    <div className="w-9 h-9 rounded-lg bg-brand-violet/10 text-brand-violet flex items-center justify-center"><Icon name={c.icon} size={18} strokeWidth={1.75} /></div>
                    <span className="text-[13px] font-medium text-ink">{getCategoryName(c.slug, lang)}</span>
                    <Icon name={lang === "fa" ? "arrowL" : "arrow"} size={13} className="ms-auto text-ink-faint" />
                  </a>
                ))}
              </div>
            )}
          </motion.div>

          {/* category chips */}
          <motion.div variants={item} className="mt-5 flex flex-wrap gap-2 items-center">
            <span className="text-[11px] text-ink-faint me-1">{t.common.categories}:</span>
            {CATEGORIES.map((c) => (
              <a key={c.slug} href="#worlds"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-medium transition-all bg-surface/80 border-line text-ink-muted hover:text-brand-violet hover:border-brand-violet/30 shadow-soft">
                <Icon name={c.icon} size={12} className="text-cyan-600" strokeWidth={2} />
                {getCategoryName(c.slug, lang)}
              </a>
            ))}
          </motion.div>

          {/* CTAs */}
          <motion.div variants={item} className="mt-8 flex flex-wrap gap-3">
            <a href="#collections" className="btn-primary size-xl group">
              {t.home.heroCta}
              <Icon name={lang === "fa" ? "arrowL" : "arrow"} size={16} className="transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
            </a>
            <a href={waLink(bulkInquiryMessage(lang))} target="_blank" rel="noopener noreferrer" className="btn-contact size-xl">
              <Icon name="chat" size={16} />
              {t.common.contactUs}
            </a>
          </motion.div>

          {/* trust row */}
          <motion.div variants={item} className="mt-8 flex flex-wrap gap-x-5 gap-y-2">
            {trust.map((it) => (
              <div key={it.label} className="flex items-center gap-2 text-[12px] text-ink-muted">
                <Icon name={it.icon} size={15} className="text-cyan-600" />
                {it.label}
              </div>
            ))}
          </motion.div>
        </div>

        {/* ── Floating brand card (lg+), with parallax tilt ───────── */}
        <motion.div variants={item} className="relative hidden lg:flex items-center justify-center" style={{ perspective: 1200 }}>
          <motion.div style={reduce ? undefined : { x: cardX, y: cardY, rotateX: rotX, rotateY: rotY }} className="relative w-full max-w-md will-change-transform">
            <div className="absolute inset-0 rounded-[2rem] bg-brand-conic blur-[64px] opacity-20 animate-spin-slow" />
            <div className="relative rounded-[2rem] p-7 border bg-white/70 border-line shadow-card backdrop-blur-xl">
              <div className="flex items-center justify-between gap-3 mb-5">
                <div dir="ltr" className="flex items-center gap-2.5">
                  <BeautyWordmarkImg height={20} />
                </div>
                <span className="w-8 h-8 rounded-full bg-cyan-500/15 text-cyan-600 flex items-center justify-center"><Icon name="badgeCheck" size={16} /></span>
              </div>
              <div className="text-[11px] text-ink-muted -mt-3 mb-4">Luxury Beauty · Tajikistan</div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-ink-faint mb-2">
                {{ fa: "کالکشن ما", ru: "Наша коллекция", tg: "Коллексияи мо", en: "Our collection" }[lang] || "Our collection"}
              </div>
              <div className="flex flex-col gap-2 mb-4">
                {CATEGORIES.map((c) => (
                  <a key={c.slug} href="#worlds"
                    className="flex items-center gap-3 rounded-xl border px-3 py-2 transition-colors group bg-brand-violet/[0.05] border-line hover:bg-brand-violet/[0.09]">
                    <span className="w-10 h-10 rounded-lg img-ph overflow-hidden grid place-items-center shrink-0 text-brand-violet">
                      <Icon name={c.icon} size={18} strokeWidth={1.6} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] font-semibold text-ink truncate">{getCategoryName(c.slug, lang)}</span>
                      <span className="block text-[11px] font-semibold text-brand-violet">{t.common.soon}</span>
                    </span>
                    <Icon name={lang === "fa" ? "arrowL" : "arrow"} size={14} className="text-ink-faint group-hover:text-brand-violet transition-colors" />
                  </a>
                ))}
              </div>
              <a href="#collections" className="flex items-center justify-between rounded-xl border px-4 py-3 transition-colors bg-brand-violet/[0.05] border-line hover:bg-brand-violet/[0.09]">
                <span className="text-[12px] font-semibold text-ink">{t.home.heroCta}</span>
                <Icon name={lang === "fa" ? "arrowL" : "arrowUpRight"} size={15} className="text-brand-violet" />
              </a>
            </div>
          </motion.div>
        </motion.div>
      </motion.div>

      {/* fade into body */}
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-canvas pointer-events-none" />
    </section>
  );
}
