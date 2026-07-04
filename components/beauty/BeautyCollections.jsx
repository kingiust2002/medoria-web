"use client";
// components/beauty/BeautyCollections.jsx — Three Beauty Worlds.
// Asymmetric editorial composition (not ecommerce cards): the Skincare panel
// runs tall while Makeup and Tools stagger beside it with offset rhythm; each
// world = dedicated media slot (distinct crop) + serif title + one line + a
// quiet "explore" affordance. Staggered mask reveals; static under reduced motion.
import { motion, useReducedMotion } from "framer-motion";
import MediaSlot from "./MediaSlot";
import { beautyCopy } from "./copy";

const SLOT_IDS = ["world-skincare", "world-makeup", "world-tools"];
// Distinct crop strategy per world (documented in the asset manifest).
const CROPS = ["50% 30%", "50% 50%", "50% 65%"];

export default function BeautyCollections({ lang, media }) {
  const t = beautyCopy(lang).collections;
  const reduced = useReducedMotion();

  const reveal = (i) => ({
    initial: reduced ? false : { opacity: 0, y: 36, clipPath: "inset(8% 0 8% 0)" },
    whileInView: { opacity: 1, y: 0, clipPath: "inset(0% 0 0% 0)" },
    viewport: { once: true, margin: "-70px" },
    transition: { duration: 0.8, delay: i * 0.12, ease: [0.22, 0.9, 0.24, 1] },
  });

  const World = ({ i, tall }) => {
    const item = t.items[i];
    return (
      <motion.article {...reveal(i)} className={`group ${tall ? "md:row-span-2" : ""}`}>
        <div
          className={`relative overflow-hidden rounded-[1.4rem] transition-transform duration-500 group-hover:-translate-y-1.5 ${
            tall ? "aspect-[3/4] md:aspect-auto md:h-full md:min-h-[560px]" : "aspect-[4/3]"
          }`}
          style={{ boxShadow: "var(--v-shadow)" }}
        >
          <MediaSlot
            src={media?.[SLOT_IDS[i]]}
            alt=""
            sizes="(min-width: 768px) 44vw, 92vw"
            objectPosition={CROPS[i]}
            markSize={96}
            className="absolute inset-0"
          />
          {/* overlapping caption plate */}
          <div className="v-glass absolute bottom-4 start-4 end-4 rounded-xl p-4 sm:end-auto sm:min-w-[240px]">
            <span className="font-beauty text-sm italic" style={{ color: "var(--v-accent)" }}>
              0{i + 1}
            </span>
            <h3 className="font-beauty mt-1 text-2xl font-semibold" style={{ color: "var(--v-navy)" }}>
              {item.t}
            </h3>
            <p className="mt-1 text-[13px] leading-relaxed" style={{ color: "rgb(var(--v-ink-muted))" }}>
              {item.s}
            </p>
          </div>
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-[1.4rem] opacity-0 transition-opacity duration-500 group-hover:opacity-100"
            style={{ boxShadow: "inset 0 0 80px rgba(200,125,78,0.18)" }}
          />
        </div>
      </motion.article>
    );
  };

  return (
    <section id="collections" className="relative mx-auto max-w-6xl px-5 py-24 sm:py-32">
      <div className="mb-12 max-w-xl sm:mb-16">
        <span className="text-[11px] font-bold uppercase tracking-[0.3em]" style={{ color: "var(--v-accent)" }}>
          {t.eyebrow}
        </span>
        <h2 className="font-beauty mt-3 text-4xl font-semibold tracking-tight sm:text-5xl" style={{ color: "var(--v-navy)" }}>
          {t.title}
        </h2>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <World i={0} tall />
        <World i={1} />
        <World i={2} />
      </div>
    </section>
  );
}
