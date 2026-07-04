"use client";
// components/beauty/BeautyCollections.jsx — three editorial collection cards.
// Each card is a tall satin "image slot" (real photography drops into
// /public/images/beauty/ later) with a parallax mark watermark, copper index,
// and hover lift/zoom. Staggered in-view reveal; reduced-motion → static.
import { motion, useReducedMotion } from "framer-motion";
import BeautyMark from "./BeautyMark";
import { beautyCopy } from "./copy";

export default function BeautyCollections({ lang }) {
  const t = beautyCopy(lang).collections;
  const reduced = useReducedMotion();

  return (
    <section id="collections" className="relative mx-auto max-w-6xl px-5 py-24 sm:py-32">
      <div className="mb-12 flex flex-col gap-3 sm:mb-16">
        <span className="text-[11px] font-bold uppercase tracking-[0.3em]" style={{ color: "var(--v-accent)" }}>
          {t.eyebrow}
        </span>
        <h2 className="font-beauty text-4xl font-bold tracking-tight sm:text-5xl" style={{ color: "var(--v-navy)" }}>
          {t.title}
        </h2>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {t.items.map((item, i) => (
          <motion.article
            key={i}
            initial={reduced ? false : { opacity: 0, y: 42 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.75, delay: i * 0.14, ease: [0.22, 0.9, 0.24, 1] }}
            className="group"
          >
            {/* satin image slot — replace with real photography via next/image */}
            <div
              className="v-satin relative aspect-[4/5] overflow-hidden rounded-[1.6rem] transition-transform duration-500 group-hover:-translate-y-2"
              style={{ boxShadow: "var(--v-shadow)" }}
            >
              <div className="absolute inset-0 grid place-items-center transition-transform duration-700 group-hover:scale-110 group-hover:rotate-6">
                <BeautyMark size={110} opacity={0.35} />
              </div>
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-x-0 top-0 h-px"
                style={{ background: "linear-gradient(90deg, transparent, var(--v-sheen), transparent)" }}
              />
              <span
                className="absolute start-5 top-5 font-beauty text-sm font-semibold italic"
                style={{ color: "var(--v-accent)" }}
              >
                0{i + 1}
              </span>
              {/* hover glow */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-[1.6rem] opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                style={{ boxShadow: "inset 0 0 90px rgba(200,125,78,0.22)" }}
              />
            </div>
            <h3 className="mt-5 font-beauty text-2xl font-bold" style={{ color: "var(--v-navy)" }}>
              {item.t}
            </h3>
            <p className="mt-1.5 text-[13.5px] leading-relaxed" style={{ color: "rgb(var(--v-ink-muted))" }}>
              {item.s}
            </p>
          </motion.article>
        ))}
      </div>
    </section>
  );
}
