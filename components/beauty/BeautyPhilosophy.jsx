"use client";
// components/beauty/BeautyPhilosophy.jsx — three concise brand pillars with
// thin copper rules; quiet typographic close before the CTA.
import { motion, useReducedMotion } from "framer-motion";
import { beautyCopy } from "./copy";

export default function BeautyPhilosophy({ lang }) {
  const t = beautyCopy(lang).philosophy;
  const reduced = useReducedMotion();

  return (
    <section className="mx-auto max-w-6xl px-5 py-20 sm:py-24">
      <span className="text-[11px] font-bold uppercase tracking-[0.3em]" style={{ color: "var(--v-accent)" }}>
        {t.eyebrow}
      </span>
      <div className="mt-8 grid gap-10 sm:grid-cols-3">
        {t.pillars.map((p, i) => (
          <motion.div
            key={i}
            initial={reduced ? false : { opacity: 0, y: 22 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-60px" }}
            transition={{ duration: 0.6, delay: i * 0.1 }}
          >
            <span aria-hidden="true" className="block h-px w-12" style={{ background: "var(--v-copper)" }} />
            <h3 className="font-beauty mt-4 text-2xl font-semibold" style={{ color: "var(--v-navy)" }}>
              {p.t}
            </h3>
            <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: "rgb(var(--v-ink-muted))" }}>
              {p.s}
            </p>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
