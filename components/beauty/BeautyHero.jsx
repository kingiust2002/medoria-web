"use client";
// components/beauty/BeautyHero.jsx — cinematic nude-copper hero.
// Layers: editorial media region (future campaign image) → atmospheric light →
// official mark foreground → content. Line-mask serif reveal; restrained
// magnetic CTAs (fine pointers only); mark parallax is slow and subtle.
// Reduced-motion renders everything static and fully readable.
import { useRef } from "react";
import Link from "next/link";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";
import { BeautyMarkImg } from "./BeautyBrand";
import MediaSlot from "./MediaSlot";
import { beautyCopy } from "./copy";

function MagneticLink({ href, children, primary }) {
  const ref = useRef(null);
  const onMove = (e) => {
    const el = ref.current;
    if (!el || e.pointerType !== "mouse") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect();
    el.style.transform = `translate(${(e.clientX - r.left - r.width / 2) * 0.1}px, ${(e.clientY - r.top - r.height / 2) * 0.12}px)`;
  };
  const reset = () => {
    if (ref.current) ref.current.style.transform = "translate(0,0)";
  };
  return (
    <span onPointerMove={onMove} onPointerLeave={reset} className="inline-block">
      <Link
        ref={ref}
        href={href}
        onBlur={reset}
        className={[
          "v-focus inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-sm font-semibold transition-[transform,box-shadow,background-color] duration-300 will-change-transform",
          primary ? "text-white shadow-[var(--v-shadow)]" : "v-btn",
        ].join(" ")}
        style={primary ? { backgroundImage: "linear-gradient(120deg, var(--v-navy), #31427C)" } : undefined}
      >
        {children}
      </Link>
    </span>
  );
}

export default function BeautyHero({ lang, media }) {
  const t = beautyCopy(lang);
  const reduced = useReducedMotion();
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const markY = useTransform(scrollYProgress, [0, 1], ["0%", "22%"]);
  const markRotate = useTransform(scrollYProgress, [0, 1], [0, 5]);
  const markFade = useTransform(scrollYProgress, [0, 0.8], [1, 0.4]);
  const textY = useTransform(scrollYProgress, [0, 1], ["0%", "8%"]);

  const lineReveal = (delay) =>
    reduced
      ? {}
      : {
          initial: { y: "112%" },
          animate: { y: "0%" },
          transition: { duration: 1.0, delay, ease: [0.22, 0.9, 0.24, 1] },
        };

  return (
    <section ref={ref} className="relative flex min-h-[100svh] flex-col overflow-hidden">
      {/* 1 — editorial media region (campaign image drops in via manifest) */}
      <div aria-hidden="true" className="absolute inset-y-0 end-0 hidden w-[46%] lg:block">
        <MediaSlot
          src={media?.["hero-editorial"]}
          sizes="46vw"
          priority={Boolean(media?.["hero-editorial"])}
          markSize={0}
          className="h-full w-full"
        />
        {/* ivory veil so type always wins over future imagery */}
        <span
          className="absolute inset-0"
          style={{ background: "linear-gradient(90deg, rgb(var(--v-canvas)) 0%, rgb(var(--v-canvas) / 0.35) 40%, transparent 100%)" }}
        />
      </div>

      {/* 2 — atmospheric light */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(64% 50% at 74% 22%, var(--v-glow), transparent 62%)," +
            "radial-gradient(50% 42% at 10% 82%, rgba(28,41,81,0.06), transparent 65%)",
        }}
      />
      <div
        aria-hidden="true"
        className="v-shimmer pointer-events-none absolute -inset-x-16 top-[34%] h-40 rotate-[-9deg]"
        style={{ background: "linear-gradient(110deg, transparent 36%, var(--v-sheen) 50%, transparent 64%)" }}
      />

      {/* 3 — official mark, slow restrained parallax */}
      <motion.div
        aria-hidden="true"
        style={reduced ? {} : { y: markY, rotate: markRotate, opacity: markFade }}
        className="pointer-events-none absolute end-[6%] top-[18%] hidden sm:block lg:end-[16%]"
      >
        <div className={reduced ? "" : "v-float"}>
          <BeautyMarkImg size={250} priority className="drop-shadow-[0_28px_50px_rgba(112,74,44,0.30)]" />
        </div>
      </motion.div>

      {/* 4 — content */}
      <motion.div
        style={reduced ? {} : { y: textY }}
        className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-5 pb-20 pt-32"
      >
        <p className="mb-6 text-[11px] font-bold uppercase tracking-[0.34em]" style={{ color: "var(--v-accent)" }}>
          {t.hero.eyebrow}
        </p>

        <h1
          className="font-beauty max-w-3xl text-[11.5vw] font-semibold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl"
          style={{ color: "var(--v-navy)" }}
        >
          <span className="block overflow-hidden pb-1">
            <motion.span className="block" {...lineReveal(0.05)}>{t.hero.h1a}</motion.span>
          </span>
          <span className="block overflow-hidden pb-2">
            <motion.span className="block italic" style={{ color: "var(--v-accent)" }} {...lineReveal(0.16)}>
              {t.hero.h1b}
            </motion.span>
          </span>
        </h1>

        <motion.p
          initial={reduced ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.42, duration: 0.7 }}
          className="mt-6 max-w-xl text-[15px] leading-relaxed sm:text-base"
          style={{ color: "rgb(var(--v-ink-muted))" }}
        >
          {t.hero.sub}
        </motion.p>

        <motion.div
          initial={reduced ? false : { opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.55, duration: 0.7 }}
          className="mt-9 flex flex-wrap items-center gap-3.5"
        >
          <MagneticLink href="#collections" primary>
            {t.hero.ctaCollection} <span aria-hidden="true">↓</span>
          </MagneticLink>
          <MagneticLink href="#contact">{t.hero.ctaContact}</MagneticLink>
        </motion.div>
      </motion.div>

      <div
        className="relative z-10 pb-7 text-center text-[10px] font-bold uppercase tracking-[0.4em]"
        style={{ color: "rgb(var(--v-ink-muted))", opacity: 0.55 }}
      >
        {t.hero.scroll}
      </div>
    </section>
  );
}
