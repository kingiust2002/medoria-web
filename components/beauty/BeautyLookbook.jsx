"use client";
// components/beauty/BeautyLookbook.jsx — the signature moment: a pinned,
// scroll-scrubbed horizontal lookbook. The section is tall (260vh); a sticky
// viewport maps vertical scroll to horizontal travel across five editorial
// plates (satin slots awaiting real photography). Scrolling back reverses it.
// Mobile (<lg) and reduced-motion get a swipeable static strip instead.
import { useRef } from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";
import BeautyMark from "./BeautyMark";
import { beautyCopy } from "./copy";

function Plate({ label, index, soon }) {
  return (
    <figure className="relative h-[62vh] w-[78vw] shrink-0 overflow-hidden rounded-[1.8rem] sm:w-[44vw] lg:h-[66vh] lg:w-[30vw]">
      <div className="v-satin absolute inset-0" />
      <div className="absolute inset-0 grid place-items-center">
        <BeautyMark size={96} opacity={0.32} />
      </div>
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, var(--v-sheen), transparent)" }}
      />
      <figcaption className="absolute inset-x-0 bottom-0 flex items-end justify-between p-6">
        <span className="font-beauty text-2xl font-bold italic" style={{ color: "var(--v-navy)" }}>
          {label}
        </span>
        <span className="font-beauty text-sm italic" style={{ color: "var(--v-accent)" }}>
          0{index + 1}
        </span>
      </figcaption>
      <span className="sr-only">{soon}</span>
    </figure>
  );
}

export default function BeautyLookbook({ lang }) {
  const t = beautyCopy(lang).lookbook;
  const reduced = useReducedMotion();
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const x = useTransform(scrollYProgress, [0, 1], ["2%", "-64%"]);

  const Head = (
    <div className="mx-auto mb-10 flex max-w-6xl flex-col gap-3 px-5">
      <span className="text-[11px] font-bold uppercase tracking-[0.3em]" style={{ color: "var(--v-accent)" }}>
        {t.eyebrow}
      </span>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-beauty text-4xl font-bold tracking-tight sm:text-5xl" style={{ color: "var(--v-navy)" }}>
          {t.title}
        </h2>
        <span className="text-[12px]" style={{ color: "rgb(var(--v-ink-muted))" }}>{t.soon}</span>
      </div>
    </div>
  );

  // Static/mobile/reduced-motion variant: swipeable strip, no pinning.
  const StaticStrip = (
    <div dir="ltr" className="no-scrollbar flex gap-5 overflow-x-auto px-5 pb-4">
      {t.items.map((label, i) => (
        <Plate key={i} label={label} index={i} soon={t.soon} />
      ))}
    </div>
  );

  if (reduced) {
    return (
      <section className="py-24">
        {Head}
        {StaticStrip}
      </section>
    );
  }

  return (
    <>
      {/* pinned scrub — desktop */}
      <section ref={ref} className="relative hidden h-[260vh] lg:block">
        <div className="sticky top-0 flex h-screen flex-col justify-center overflow-hidden">
          {Head}
          <motion.div dir="ltr" style={{ x }} className="flex w-max gap-6 ps-10 will-change-transform">
            {t.items.map((label, i) => (
              <Plate key={i} label={label} index={i} soon={t.soon} />
            ))}
          </motion.div>
        </div>
      </section>
      {/* swipe strip — below lg */}
      <section className="py-24 lg:hidden">
        {Head}
        {StaticStrip}
      </section>
    </>
  );
}
