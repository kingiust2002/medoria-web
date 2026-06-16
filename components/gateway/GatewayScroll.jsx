"use client";

/**
 * Medoria — Desktop scroll-scrubbing split gateway
 * ------------------------------------------------
 * Left = Medoria Health (cool)   |   Right = Medoria Beauty (warm)
 *
 * As you scroll, each side cycles through its frames:
 *   item rises from below  →  settles center (name fades in)  →  lifts up & out
 * Scroll up reverses it (free, because everything is scroll-linked).
 *
 * - Desktop only: the scroll experience renders on `lg` and up.
 *   Below `lg` a simple static fallback with two links is shown instead.
 * - Respects prefers-reduced-motion: renders a calm static version.
 *
 * DROP-IN NOTES
 *  1) Put generated images in /public/images/hero/ with the names in FRAMES below.
 *  2) Tailwind classes here are plain utilities + inline gradient so it runs as-is.
 *     If you want your design tokens, swap:
 *        bg-[#0b0d12]      -> bg-canvas
 *        text-white/...    -> text-ink/...
 *        the BRAND_GRADIENT inline style -> your `brand-gradient` utility
 *  3) BrandLockup below is a lightweight stand-in. If you prefer your existing
 *     component, replace <BrandLockup vertical="health" /> with
 *     <Lockup vertical="health" /> (import it at the top).
 */

import { useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";

/* ----------------------------------------------------------------------------
 * 1) CONTENT — edit these. Each `frames` array is what that side cycles through.
 *    The first frame doubles as the static fallback / reduced-motion image.
 *    Right now Beauty has 2 frames (scene + lipstick) so it actually cycles;
 *    Health has 1 (scene) and sits calm until you generate more items.
 * -------------------------------------------------------------------------- */
const HEALTH = {
  label: "Medoria Health",
  href: "/health",
  accent: "#38bdf8", // cyan
  frames: [
    { src: "/images/hero/health-scene.webp", name: "Clinical Suite" },
    { src: "/images/hero/health-bp.webp", name: "Blood Pressure Monitor" },
    // { src: "/images/hero/health-glucose.webp", name: "Glucose Meter" },
    // { src: "/images/hero/health-oximeter.webp", name: "Pulse Oximeter" },
  ],
};

const BEAUTY = {
  label: "Medoria Beauty",
  href: "/beauty",
  accent: "#fb7185", // rose
  frames: [
    { src: "/images/hero/beauty-scene.webp", name: "The Collection" },
    { src: "/images/hero/beauty-lipstick.webp", name: "Signature Lip" },
    // { src: "/images/hero/beauty-foundation.webp", name: "Luminous Base" },
    // { src: "/images/hero/beauty-cream.webp",      name: "Night Cream" },
  ],
};

const BRAND_GRADIENT =
  "linear-gradient(135deg, #1e3a8a 0%, #6d28d9 45%, #db2777 100%)";

/* ----------------------------------------------------------------------------
 * 2) A single cycling frame. Hooks are always called (no conditional hooks);
 *    `solo` switches the math to a calm always-visible parallax when a side
 *    only has one frame.
 * -------------------------------------------------------------------------- */
function ScrollFrame({ progress, index, total, src, name, accent, priority }) {
  const solo = total <= 1;
  const seg = 1 / Math.max(total, 1);
  const start = index * seg;
  const mid = start + seg / 2;
  const end = (index + 1) * seg;
  const inAt = start + seg * 0.18;
  const outAt = end - seg * 0.18;

  // Vertical travel: below -> center -> above (responsive %, relative to own height)
  const y = useTransform(
    progress,
    solo ? [0, 0.5, 1] : [start, mid, end],
    solo ? ["6%", "0%", "-6%"] : ["55%", "0%", "-55%"]
  );
  const opacity = useTransform(
    progress,
    solo ? [0, 1] : [start, inAt, outAt, end],
    solo ? [1, 1] : [0, 1, 1, 0]
  );
  const scale = useTransform(
    progress,
    solo ? [0, 0.5, 1] : [start, mid, end],
    solo ? [1, 1.02, 1] : [0.9, 1, 0.95]
  );
  const labelOpacity = useTransform(
    progress,
    solo ? [0, 1] : [start, inAt, outAt, end],
    solo ? [1, 1] : [0, 1, 1, 0]
  );
  const labelY = useTransform(
    progress,
    solo ? [0, 1] : [start, inAt],
    solo ? [0, 0] : [18, 0]
  );

  return (
    <motion.div
      style={{ y, opacity, scale }}
      className="absolute inset-0 flex flex-col items-center justify-center px-10"
    >
      <div className="relative h-[68vh] w-full max-w-[34rem]">
        <Image
          src={src}
          alt={name}
          fill
          priority={priority}
          sizes="(min-width: 1024px) 34rem, 90vw"
          className="object-contain drop-shadow-2xl"
        />
      </div>

      <motion.div
        style={{ opacity: labelOpacity, y: labelY }}
        className="mt-6 flex flex-col items-center text-center"
      >
        <span
          className="h-px w-10"
          style={{ background: accent }}
          aria-hidden
        />
        <span className="mt-3 text-sm font-medium uppercase tracking-[0.28em] text-white/85">
          {name}
        </span>
      </motion.div>
    </motion.div>
  );
}

/* ----------------------------------------------------------------------------
 * 3) One half of the split. Holds the side's tint, lockup and its frames.
 * -------------------------------------------------------------------------- */
function GatewaySide({ side, progress, align }) {
  return (
    <Link
      href={side.href}
      className="group relative block h-full w-full overflow-hidden"
    >
      {/* tint wash */}
      <div
        className="absolute inset-0 transition-opacity duration-500 group-hover:opacity-100 opacity-80"
        style={{
          background:
            align === "left"
              ? `radial-gradient(120% 90% at 30% 40%, ${side.accent}22 0%, transparent 60%)`
              : `radial-gradient(120% 90% at 70% 40%, ${side.accent}22 0%, transparent 60%)`,
        }}
        aria-hidden
      />

      {/* lockup — swap for your <Lockup vertical=... /> if you like */}
      <div
        className={
          "absolute top-12 z-10 " +
          (align === "left" ? "left-12" : "right-12 text-right")
        }
      >
        <BrandLockup vertical={align === "left" ? "health" : "beauty"} accent={side.accent} />
      </div>

      {/* cycling frames */}
      {side.frames.map((f, i) => (
        <ScrollFrame
          key={f.src}
          progress={progress}
          index={i}
          total={side.frames.length}
          src={f.src}
          name={f.name}
          accent={side.accent}
          priority={i === 0}
        />
      ))}

      {/* enter hint */}
      <div
        className={
          "absolute bottom-10 z-10 text-xs uppercase tracking-[0.3em] text-white/40 transition-colors group-hover:text-white/80 " +
          (align === "left" ? "left-12" : "right-12")
        }
      >
        Enter →
      </div>
    </Link>
  );
}

/* ----------------------------------------------------------------------------
 * 4) Lightweight brand lockup stand-in (replace with your real component).
 * -------------------------------------------------------------------------- */
function BrandLockup({ vertical, accent }) {
  return (
    <div className="flex flex-col gap-1">
      <span
        className="text-3xl font-semibold tracking-tight text-transparent"
        style={{
          backgroundImage: BRAND_GRADIENT,
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
        }}
      >
        Medoria
      </span>
      <span
        className="text-xs font-medium uppercase tracking-[0.32em]"
        style={{ color: accent }}
      >
        {vertical === "health" ? "Health" : "Beauty"}
      </span>
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * 5) Static fallback — used for reduced-motion AND below the lg breakpoint.
 * -------------------------------------------------------------------------- */
function StaticGateway() {
  const sides = [
    { ...HEALTH, align: "left" },
    { ...BEAUTY, align: "right" },
  ];
  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2 bg-[#0b0d12]">
      {sides.map((side) => (
        <Link
          key={side.href}
          href={side.href}
          className="group relative flex min-h-[60vh] flex-col items-center justify-center gap-6 overflow-hidden px-8 py-16"
        >
          <div
            className="absolute inset-0 opacity-70"
            style={{
              background: `radial-gradient(120% 90% at 50% 40%, ${side.accent}22 0%, transparent 60%)`,
            }}
            aria-hidden
          />
          <div className="relative z-10 flex flex-col items-center gap-5">
            <BrandLockup
              vertical={side.align === "left" ? "health" : "beauty"}
              accent={side.accent}
            />
            <div className="relative h-[44vh] w-full max-w-[22rem]">
              <Image
                src={side.frames[0].src}
                alt={side.frames[0].name}
                fill
                sizes="(min-width: 1024px) 22rem, 80vw"
                className="object-contain"
              />
            </div>
            <span className="text-xs uppercase tracking-[0.3em] text-white/50 transition-colors group-hover:text-white/85">
              Enter →
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------------------
 * 6) The desktop scroll experience.
 * -------------------------------------------------------------------------- */
function MotionGateway() {
  const sectionRef = useRef(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end end"],
  });

  // Scroll length scales with the busier side so each frame gets room to breathe.
  const maxFrames = Math.max(HEALTH.frames.length, BEAUTY.frames.length);
  const sectionVh = Math.max(240, (maxFrames + 1) * 85);

  return (
    <section
      ref={sectionRef}
      style={{ height: `${sectionVh}vh` }}
      className="relative w-full"
    >
      {/* sticky stage */}
      <div className="sticky top-0 h-screen w-full overflow-hidden bg-[#0b0d12]">
        <div className="grid h-full grid-cols-2">
          <GatewaySide side={HEALTH} progress={scrollYProgress} align="left" />
          <GatewaySide side={BEAUTY} progress={scrollYProgress} align="right" />
        </div>

        {/* center divider with brand gradient + scroll progress */}
        <div className="pointer-events-none absolute inset-y-0 left-1/2 z-20 -translate-x-1/2">
          <div className="h-full w-px bg-white/10" />
          <motion.div
            className="absolute left-0 top-0 w-px origin-top"
            style={{
              height: "100%",
              scaleY: scrollYProgress,
              background: BRAND_GRADIENT,
            }}
          />
        </div>

        {/* scroll cue */}
        <div className="pointer-events-none absolute bottom-6 left-1/2 z-20 -translate-x-1/2 text-[10px] uppercase tracking-[0.4em] text-white/35">
          Scroll
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------------------
 * 7) Public component — picks motion vs static.
 * -------------------------------------------------------------------------- */
export default function GatewayScroll() {
  const prefersReduced = useReducedMotion();

  if (prefersReduced) {
    return <StaticGateway />;
  }

  return (
    <>
      {/* desktop: scroll experience */}
      <div className="hidden lg:block">
        <MotionGateway />
      </div>
      {/* below lg: simple static fallback */}
      <div className="lg:hidden">
        <StaticGateway />
      </div>
    </>
  );
}
