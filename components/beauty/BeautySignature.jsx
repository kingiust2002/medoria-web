"use client";
// components/beauty/BeautySignature.jsx — Signature Product Moment.
// A campaign moment, not a catalog: one product slot under a soft spotlight
// with restrained scroll parallax, macro serif title, and three mood notes
// (deliberately non-commercial descriptors — no fabricated claims).
import { useRef } from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";
import MediaSlot from "./MediaSlot";
import { beautyCopy } from "./copy";

export default function BeautySignature({ lang, media }) {
  const t = beautyCopy(lang).signature;
  const reduced = useReducedMotion();
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const productY = useTransform(scrollYProgress, [0, 1], ["5%", "-5%"]);
  const lightX = useTransform(scrollYProgress, [0, 1], ["34%", "66%"]);

  return (
    <section ref={ref} className="relative overflow-hidden py-24 sm:py-32">
      {/* moving spotlight — very slow, scroll-linked; static when reduced */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        <motion.span
          className="absolute inset-y-0 w-[140%]"
          style={{
            background: "radial-gradient(34% 60% at 50% 40%, var(--v-glow), transparent 70%)",
            ...(reduced ? { left: "-20%" } : { left: lightX, x: "-50%" }),
          }}
        />
      </div>

      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 md:grid-cols-2">
        {/* product plate */}
        <motion.div style={reduced ? {} : { y: productY }} className="order-2 md:order-1">
          <div className="relative mx-auto aspect-[4/5] w-full max-w-[420px] overflow-hidden rounded-[1.6rem]" style={{ boxShadow: "var(--v-shadow)" }}>
            <MediaSlot
              src={media?.["signature-product"]}
              alt=""
              sizes="(min-width: 768px) 420px, 88vw"
              objectPosition="50% 50%"
              markSize={110}
              className="absolute inset-0"
            />
          </div>
        </motion.div>

        <div className="order-1 md:order-2">
          <span className="text-[11px] font-bold uppercase tracking-[0.3em]" style={{ color: "var(--v-accent)" }}>
            {t.eyebrow}
          </span>
          <h2 className="font-beauty mt-3 text-4xl font-semibold tracking-tight sm:text-5xl" style={{ color: "var(--v-navy)" }}>
            {t.title}
          </h2>
          <p className="mt-4 max-w-md text-[15px] leading-relaxed" style={{ color: "rgb(var(--v-ink-muted))" }}>
            {t.p}
          </p>
          <ul className="mt-8 space-y-3">
            {t.notes.map((n, i) => (
              <li key={i} className="flex items-center gap-3 text-[14px]" style={{ color: "rgb(var(--v-ink))" }}>
                <span aria-hidden="true" className="h-px w-8" style={{ background: "var(--v-copper)" }} />
                {n}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
