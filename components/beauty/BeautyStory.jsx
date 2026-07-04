"use client";
// components/beauty/BeautyStory.jsx — brand story: large serif statement over a
// champagne material layer with a macro-texture slot; gentle parallax only.
import { useRef } from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";
import MediaSlot from "./MediaSlot";
import { beautyCopy } from "./copy";

export default function BeautyStory({ lang, media }) {
  const t = beautyCopy(lang).story;
  const reduced = useReducedMotion();
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const panelY = useTransform(scrollYProgress, [0, 1], ["-6%", "6%"]);

  return (
    <section ref={ref} className="relative overflow-hidden py-28 sm:py-36">
      <motion.div
        aria-hidden="true"
        style={reduced ? {} : { y: panelY }}
        className="absolute inset-x-5 inset-y-8 -z-10 overflow-hidden rounded-[2rem] sm:inset-x-10"
      >
        <MediaSlot
          src={media?.["story-texture"]}
          alt=""
          sizes="92vw"
          objectPosition="50% 50%"
          markSize={0}
          className="h-full w-full"
        />
        {/* ivory veil keeps the quote readable over any future texture */}
        <span className="absolute inset-0" style={{ background: "rgb(var(--v-canvas) / 0.72)" }} />
      </motion.div>

      <figure className="relative mx-auto max-w-3xl px-8 text-center">
        <blockquote>
          <p className="font-beauty text-3xl font-semibold italic leading-snug sm:text-5xl" style={{ color: "var(--v-navy)" }}>
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
