"use client";
// components/beauty/BeautyStory.jsx — editorial pull-quote with a parallax
// champagne panel behind it. Scroll-linked; reduced-motion → static.
import { useRef } from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";
import BeautyMark from "./BeautyMark";
import { beautyCopy } from "./copy";

export default function BeautyStory({ lang }) {
  const t = beautyCopy(lang).story;
  const reduced = useReducedMotion();
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const panelY = useTransform(scrollYProgress, [0, 1], ["-8%", "8%"]);
  const markRotate = useTransform(scrollYProgress, [0, 1], [-14, 14]);

  return (
    <section ref={ref} className="relative overflow-hidden py-28 sm:py-36">
      <motion.div
        aria-hidden="true"
        style={reduced ? {} : { y: panelY }}
        className="v-satin absolute inset-x-6 inset-y-8 -z-10 rounded-[2.2rem] sm:inset-x-10"
        // panel floats slightly slower than the page — quiet depth
      />
      <motion.div
        aria-hidden="true"
        style={reduced ? {} : { rotate: markRotate }}
        className="pointer-events-none absolute -start-10 top-1/2 -translate-y-1/2 opacity-[0.16]"
      >
        <BeautyMark size={300} />
      </motion.div>

      <figure className="relative mx-auto max-w-3xl px-8 text-center">
        <blockquote>
          <p className="font-beauty text-3xl font-bold italic leading-snug sm:text-5xl" style={{ color: "var(--v-navy)" }}>
            «{t.quote}»
          </p>
        </blockquote>
        <figcaption className="mt-6 text-[14.5px] leading-relaxed" style={{ color: "rgb(var(--v-ink-muted))" }}>
          {t.p}
        </figcaption>
      </figure>
    </section>
  );
}
