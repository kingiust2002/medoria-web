"use client";
// components/beauty/BeautyHero.jsx — full-viewport nude-luxury hero.
// Serif headline with line-mask reveal, floating ribbon mark with scroll
// parallax, champagne shimmer, magnetic CTA. Reduced-motion → calm static.
import { useRef } from "react";
import Link from "next/link";
import {
  motion,
  useScroll,
  useTransform,
  useReducedMotion,
} from "framer-motion";
import BeautyMark from "./BeautyMark";
import { beautyCopy } from "./copy";

function MagneticLink({ href, children, primary }) {
  const ref = useRef(null);
  const onMove = (e) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = e.clientX - (r.left + r.width / 2);
    const y = e.clientY - (r.top + r.height / 2);
    el.style.transform = `translate(${x * 0.18}px, ${y * 0.24}px)`;
  };
  const onLeave = () => {
    if (ref.current) ref.current.style.transform = "translate(0,0)";
  };
  return (
    <span onPointerMove={onMove} onPointerLeave={onLeave} className="inline-block motion-reduce:pointer-events-auto">
      <Link
        ref={ref}
        href={href}
        className={[
          "v-focus inline-flex items-center gap-2 rounded-full px-7 py-3.5 text-sm font-semibold transition-[transform,box-shadow] duration-300 will-change-transform",
          primary ? "text-white shadow-[var(--v-shadow)]" : "",
        ].join(" ")}
        style={
          primary
            ? { backgroundImage: "linear-gradient(120deg, var(--v-navy), #31427C)" }
            : { color: "var(--v-accent)", border: "1px solid rgb(var(--v-ring))", background: "rgb(var(--v-surface) / 0.6)" }
        }
      >
        {children}
      </Link>
    </span>
  );
}

export default function BeautyHero({ lang }) {
  const t = beautyCopy(lang);
  const reduced = useReducedMotion();
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const markY = useTransform(scrollYProgress, [0, 1], ["0%", "34%"]);
  const markRotate = useTransform(scrollYProgress, [0, 1], [0, 28]);
  const textY = useTransform(scrollYProgress, [0, 1], ["0%", "12%"]);
  const fade = useTransform(scrollYProgress, [0, 0.75], [1, 0]);

  const lineReveal = (delay) =>
    reduced
      ? {}
      : {
          initial: { y: "112%" },
          animate: { y: "0%" },
          transition: { duration: 0.9, delay, ease: [0.22, 0.9, 0.24, 1] },
        };

  return (
    <section ref={ref} className="relative flex min-h-[100svh] flex-col overflow-hidden">
      {/* warm atmosphere + champagne shimmer */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(70% 55% at 72% 18%, var(--v-glow), transparent 62%)," +
            "radial-gradient(55% 45% at 12% 78%, rgba(28,41,81,0.07), transparent 65%)",
        }}
      />
      <div
        aria-hidden="true"
        className="v-shimmer pointer-events-none absolute -inset-x-16 top-[30%] h-48 rotate-[-10deg]"
        style={{ background: "linear-gradient(110deg, transparent 34%, var(--v-sheen) 50%, transparent 66%)" }}
      />

      {/* floating ribbon mark */}
      <motion.div
        aria-hidden="true"
        style={reduced ? {} : { y: markY, rotate: markRotate }}
        className="pointer-events-none absolute -end-14 top-[16%] opacity-[0.9] sm:end-[6%] lg:end-[10%]"
      >
        <div className={reduced ? "" : "v-float"}>
          <BeautyMark size={280} className="drop-shadow-[0_30px_60px_rgba(140,90,45,0.35)] sm:h-[340px] sm:w-[340px]" />
        </div>
      </motion.div>

      <motion.div
        style={reduced ? {} : { y: textY, opacity: fade }}
        className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-5 pb-24 pt-32"
      >
        <p
          className="mb-6 text-[11px] font-bold uppercase tracking-[0.34em]"
          style={{ color: "var(--v-accent)" }}
        >
          {t.hero.eyebrow}
        </p>

        <h1 className="font-beauty max-w-3xl text-[13vw] font-bold leading-[1.04] tracking-tight sm:text-6xl lg:text-7xl" style={{ color: "var(--v-navy)" }}>
          <span className="block overflow-hidden pb-1">
            <motion.span className="block" {...lineReveal(0.05)}>{t.hero.h1a}</motion.span>
          </span>
          <span className="block overflow-hidden pb-2">
            <motion.span className="block italic" style={{ color: "var(--v-accent)" }} {...lineReveal(0.18)}>
              {t.hero.h1b}
            </motion.span>
          </span>
        </h1>

        <motion.p
          initial={reduced ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.8 }}
          className="mt-6 max-w-xl text-[15px] leading-relaxed sm:text-base"
          style={{ color: "rgb(var(--v-ink-muted))" }}
        >
          {t.hero.sub}
        </motion.p>

        <motion.div
          initial={reduced ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.8 }}
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
        style={{ color: "rgb(var(--v-ink-muted))", opacity: 0.6 }}
      >
        {t.hero.scroll}
      </div>
    </section>
  );
}
