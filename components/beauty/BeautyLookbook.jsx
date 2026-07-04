"use client";
// components/beauty/BeautyLookbook.jsx — horizontal editorial lookbook.
// SINGLE rendering (no duplicate DOM): SSR + mobile + reduced-motion get a
// native snap-scroll strip; after hydration, viewports ≥1024px with fine
// pointers upgrade to the pinned scroll-scrub sequence (vertical scroll drives
// horizontal travel, fully reversible, no scroll trap — the section simply
// ends). Plates are data-driven and accept campaign images via the manifest.
import { useEffect, useRef, useState } from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";
import MediaSlot from "./MediaSlot";
import { beautyCopy } from "./copy";

function Plate({ label, index, src }) {
  return (
    <figure className="relative h-[58vh] w-[76vw] shrink-0 snap-center overflow-hidden rounded-[1.6rem] sm:w-[44vw] lg:h-[64vh] lg:w-[30vw]">
      <MediaSlot
        src={src}
        alt={label}
        sizes="(min-width: 1024px) 30vw, 76vw"
        markSize={84}
        className="absolute inset-0"
      />
      <figcaption
        className="v-glass absolute inset-x-4 bottom-4 flex items-baseline justify-between rounded-lg px-4 py-2.5"
      >
        <span className="font-beauty text-xl font-semibold italic" style={{ color: "var(--v-navy)" }}>
          {label}
        </span>
        <span className="font-beauty text-sm italic" style={{ color: "var(--v-accent)" }}>
          0{index + 1}
        </span>
      </figcaption>
    </figure>
  );
}

export default function BeautyLookbook({ lang, media }) {
  const t = beautyCopy(lang).lookbook;
  const reduced = useReducedMotion();
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    if (reduced) return;
    const mq = window.matchMedia("(min-width: 1024px) and (pointer: fine)");
    const apply = () => setPinned(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [reduced]);

  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const x = useTransform(scrollYProgress, [0, 1], ["2%", "-62%"]);

  const srcs = t.items.map((_, i) => media?.[`lookbook-0${i + 1}`]);

  const Head = (
    <div className="mx-auto mb-10 flex max-w-6xl flex-col gap-3 px-5">
      <span className="text-[11px] font-bold uppercase tracking-[0.3em]" style={{ color: "var(--v-accent)" }}>
        {t.eyebrow}
      </span>
      <h2 className="font-beauty text-4xl font-semibold tracking-tight sm:text-5xl" style={{ color: "var(--v-navy)" }}>
        {t.title}
      </h2>
    </div>
  );

  if (!pinned) {
    // Native, accessible horizontal strip (SSR default; mobile; reduced motion).
    // Peeking next plate + snap points provide the progression affordance.
    return (
      <section className="py-24">
        {Head}
        <div dir="ltr" className="no-scrollbar flex snap-x snap-mandatory gap-5 overflow-x-auto px-5 pb-4">
          {t.items.map((label, i) => (
            <Plate key={i} label={label} index={i} src={srcs[i]} />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section ref={ref} className="relative h-[240vh]">
      <div className="sticky top-0 flex h-screen flex-col justify-center overflow-hidden">
        {Head}
        <motion.div dir="ltr" style={{ x }} className="flex w-max gap-6 ps-10 will-change-transform">
          {t.items.map((label, i) => (
            <Plate key={i} label={label} index={i} src={srcs[i]} />
          ))}
        </motion.div>
      </div>
    </section>
  );
}
