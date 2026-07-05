"use client";
// components/beauty/BeautyHero.jsx — mirrors the Health hero skeleton
// (eyebrow pill → 3-line H1 with gradient accent → sub → chips → CTAs → trust
// row, plus the floating parallax brand card on lg+) in the nude-copper
// identity. Campaign banner slot sits behind at low opacity, like Health's.
import Link from "next/link";
import Image from "next/image";
import { motion, useReducedMotion, useMotionValue, useSpring, useTransform } from "framer-motion";
import { BeautyMarkImg, BeautyWordmarkImg } from "./BeautyBrand";
import Icon from "@/components/shared/Icon";
import { waLink, bulkInquiryMessage } from "@/lib/whatsapp";
import { beautyCopy } from "./copy";

const EASE = [0.2, 0.8, 0.2, 1];
const WORLD_ICONS = ["sparkles", "star", "package"];

export default function BeautyHero({ lang, media }) {
  const t = beautyCopy(lang);
  const reduce = useReducedMotion();

  // subtle mouse parallax for the floating card (desktop, motion-safe) — same
  // spring feel as the Health hero card.
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

  const container = { hidden: {}, show: { transition: { staggerChildren: reduce ? 0 : 0.09, delayChildren: 0.05 } } };
  const item = {
    hidden: reduce ? {} : { opacity: 0, y: 22, filter: "blur(10px)" },
    show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.7, ease: EASE } },
  };

  return (
    <section onMouseMove={onMove} className="relative overflow-hidden isolate text-ink">
      {/* warm ivory base + nude-copper bloom (mirrors Health's light washes) */}
      <div className="absolute inset-0 -z-20" style={{ background: "rgb(var(--canvas))" }} />
      <div className="absolute inset-0 -z-10" style={{
        background:
          "radial-gradient(60% 55% at 78% 18%, rgba(200,125,78,0.16) 0%, transparent 60%)," +
          "radial-gradient(55% 50% at 88% 60%, rgba(231,197,151,0.20) 0%, transparent 60%)," +
          "radial-gradient(70% 60% at 10% 90%, rgba(28,41,81,0.08) 0%, transparent 60%)," +
          "linear-gradient(180deg,#FFFFFF 0%,#FAF3EB 60%,#FCF7F2 100%)",
      }} />
      {/* campaign banner slot — same behaviour as Health's photo layer */}
      {media?.["hero-banner"] && (
        <div className="absolute inset-0 -z-10" aria-hidden="true">
          <Image src={media["hero-banner"]} alt="" fill sizes="100vw" priority className="object-cover opacity-[0.22]" style={{ objectPosition: "right center" }} />
        </div>
      )}
      {/* champagne sheen + copper dot grid */}
      <div aria-hidden="true" className="v-shimmer pointer-events-none absolute -inset-x-16 top-[30%] -z-10 h-44 rotate-[-9deg]"
        style={{ background: "linear-gradient(110deg, transparent 36%, var(--v-sheen) 50%, transparent 64%)" }} />
      <div className="absolute inset-0 -z-10 pointer-events-none opacity-[0.5]"
        style={{ backgroundImage: "radial-gradient(circle, rgba(178,110,63,0.14) 1px, transparent 1px)", backgroundSize: "30px 30px", maskImage: "radial-gradient(circle at 50% 10%, black, transparent 72%)" }} />

      <motion.div
        variants={container} initial="hidden" animate="show"
        className="container-x relative pt-14 pb-20 md:pt-20 md:pb-28 grid lg:grid-cols-[1.12fr,0.88fr] gap-10 items-center min-h-[76vh]"
      >
        {/* ── Content ─────────────────────────────────────────────── */}
        <div className="relative max-w-2xl">
          <motion.div variants={item} className="inline-flex items-center gap-2 mb-6 rounded-full px-3.5 py-1.5 border bg-surface/80 border-line text-ink-soft backdrop-blur shadow-soft">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: "var(--v-copper)" }} />
              <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: "var(--v-copper)" }} />
            </span>
            <span className="text-[10px] font-bold tracking-[0.18em] uppercase">{t.hero.eyebrow}</span>
          </motion.div>

          <motion.h1 variants={item} className="font-beauty text-[40px] sm:text-[50px] md:text-[58px] lg:text-[64px] leading-[1.08] font-semibold tracking-tight" style={{ color: "var(--v-navy)" }}>
            <span className="block">{t.hero.h1a}</span>
            <span className="block">{t.hero.h1b}</span>
            <span className="block gradient-text-animated italic leading-[1.2] pb-2">{t.hero.h1c}</span>
          </motion.h1>

          <motion.p variants={item} className="mt-6 text-[15px] md:text-[17px] text-ink-muted leading-[1.75] max-w-xl">
            {t.hero.sub}
          </motion.p>

          {/* world chips (mirrors Health's category chips) */}
          <motion.div variants={item} className="mt-6 flex flex-wrap gap-2 items-center">
            <span className="text-[11px] text-ink-faint me-1">{t.hero.chipsLabel}</span>
            {t.worlds.items.map((w, i) => (
              <Link key={i} href="#worlds"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-medium transition-all bg-surface/80 border-line text-ink-muted shadow-soft hover:border-[color:var(--v-ring)]"
                style={{ "--tw-shadow-color": "transparent" }}>
                <Icon name={WORLD_ICONS[i]} size={12} strokeWidth={2} className="text-[color:var(--v-copper)]" />
                {w.t}
              </Link>
            ))}
          </motion.div>

          {/* CTAs — same slots as Health (primary + contact) */}
          <motion.div variants={item} className="mt-8 flex flex-wrap gap-3">
            <Link href="#collections" className="btn-primary size-xl group">
              {t.hero.ctaPrimary}
              <Icon name={lang === "fa" ? "arrowL" : "arrow"} size={16} className="transition-transform group-hover:translate-x-0.5 rtl:group-hover:-translate-x-0.5" />
            </Link>
            <a href={waLink(bulkInquiryMessage(lang))} target="_blank" rel="noopener noreferrer" className="btn-contact size-xl">
              <Icon name="chat" size={16} />
              {t.hero.ctaContact}
            </a>
          </motion.div>

          {/* trust row */}
          <motion.div variants={item} className="mt-8 flex flex-wrap gap-x-5 gap-y-2">
            {t.hero.trust.map((label) => (
              <div key={label} className="flex items-center gap-2 text-[12px] text-ink-muted">
                <Icon name="badgeCheck" size={15} className="text-[color:var(--v-copper)]" />
                {label}
              </div>
            ))}
          </motion.div>
        </div>

        {/* ── Floating brand card (lg+), same parallax tilt as Health ── */}
        <motion.div variants={item} className="relative hidden lg:flex items-center justify-center" style={{ perspective: 1200 }}>
          <motion.div style={reduce ? undefined : { x: cardX, y: cardY, rotateX: rotX, rotateY: rotY }} className="relative w-full max-w-md will-change-transform">
            <div className="absolute inset-0 rounded-[2rem] blur-[64px] opacity-25 animate-spin-slow"
              style={{ background: "conic-gradient(from 180deg at 50% 50%, #1C2951, #B26E3F, #EFC894, #1C2951)" }} />
            <div className="relative rounded-[2rem] p-7 border bg-white/75 border-line shadow-card backdrop-blur-xl">
              <div className="flex items-center justify-between gap-3 mb-5">
                <span dir="ltr"><BeautyWordmarkImg height={20} /></span>
                <span className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "rgba(200,125,78,0.14)", color: "var(--v-accent)" }}>
                  <Icon name="badgeCheck" size={16} />
                </span>
              </div>
              <div className="text-[11px] text-ink-muted -mt-3 mb-4">{t.hero.card.region}</div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-ink-faint mb-2">{t.hero.card.label}</div>
              <div className="flex flex-col gap-2 mb-4">
                {t.worlds.items.map((w, i) => (
                  <Link key={i} href="#worlds"
                    className="flex items-center gap-3 rounded-xl border px-3 py-2 transition-colors group border-line hover:bg-[rgba(200,125,78,0.07)]"
                    style={{ background: "rgba(200,125,78,0.045)" }}>
                    <span className="w-10 h-10 rounded-lg img-ph overflow-hidden grid place-items-center shrink-0" style={{ color: "var(--v-accent)" }}>
                      <Icon name={WORLD_ICONS[i]} size={18} strokeWidth={1.6} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] font-semibold text-ink truncate">{w.t}</span>
                      <span className="block text-[11px] font-semibold" style={{ color: "var(--v-accent)" }}>{t.hero.card.soon}</span>
                    </span>
                    <Icon name={lang === "fa" ? "arrowL" : "arrow"} size={14} className="text-ink-faint transition-colors group-hover:text-[color:var(--v-accent)]" />
                  </Link>
                ))}
              </div>
              <Link href="#collections" className="flex items-center justify-between rounded-xl border px-4 py-3 transition-colors border-line hover:bg-[rgba(200,125,78,0.07)]" style={{ background: "rgba(200,125,78,0.045)" }}>
                <span className="text-[12px] font-semibold text-ink">{t.hero.card.cta}</span>
                <Icon name={lang === "fa" ? "arrowL" : "arrowUpRight"} size={15} className="text-[color:var(--v-accent)]" />
              </Link>
              <div className="mt-4 flex justify-center"><BeautyMarkImg size={30} opacity={0.9} /></div>
            </div>
          </motion.div>
        </motion.div>
      </motion.div>

      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-canvas pointer-events-none" />
    </section>
  );
}
