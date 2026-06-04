// components/home/GlobeSection.jsx — "nationwide reach" band.
// Uses /images/globe-reach.png if present (gently floating, with glow + depth so a
// static render still feels alive); otherwise falls back to the animated CSS globe.
"use client";
import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Reveal } from "@/components/shared/Reveal";
import Globe from "@/components/shared/Globe";

const COPY = {
  fa: { tag: "دسترسی سراسری", title: "تأمین مطمئن در سراسر تاجیکستان", sub: "از دوشنبه تا دورترین نقاط — تحویل سریع، قیمت رقابتی و پشتیبانی محلی." },
  ru: { tag: "ОХВАТ ПО СТРАНЕ", title: "Надёжные поставки по всему Таджикистану", sub: "От Душанбе до самых отдалённых районов — быстрая доставка и местная поддержка." },
  tg: { tag: "ФАРОГИРИИ САРОСАРӢ", title: "Таъминоти боэътимод дар саросари Тоҷикистон", sub: "Аз Душанбе то дурдасттарин минтақаҳо — расондани зуд ва дастгирии маҳаллӣ." },
  en: { tag: "NATIONWIDE REACH", title: "Reliable supply across Tajikistan", sub: "From Dushanbe to the most remote regions — fast delivery, fair pricing and local support." },
};

export default function GlobeSection({ lang }) {
  const c = COPY[lang] || COPY.en;
  const [imgOk, setImgOk] = useState(false);
  const reduce = useReducedMotion();
  return (
    <section className="relative overflow-hidden bg-navy text-white py-16 md:py-24 noise">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/30 to-transparent" />
      <div className="container-x grid lg:grid-cols-2 gap-10 items-center">
        <Reveal>
          <div className="text-[11px] font-bold tracking-[0.18em] uppercase text-cyan-300 mb-3">{c.tag}</div>
          <h2 className="font-display text-2xl md:text-4xl font-extrabold leading-tight mb-4">{c.title}</h2>
          <p className="text-white/70 leading-[1.85] max-w-md">{c.sub}</p>
        </Reveal>
        <Reveal delay={0.1}>
          <div className="relative mx-auto w-full max-w-[460px]">
            {/* soft glow halo behind the render */}
            {imgOk && (
              <div className="pointer-events-none absolute inset-[10%] rounded-full blur-3xl opacity-70"
                   style={{ background: "radial-gradient(circle, rgba(56,130,246,0.45), rgba(139,47,247,0.18) 55%, transparent 72%)" }} />
            )}
            {/* the render gently floats so a static image still feels alive */}
            <motion.div
              className="relative"
              animate={reduce || !imgOk ? {} : { y: [0, -12, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            >
              <img
                src="/images/globe-reach.png" alt={c.title}
                onLoad={() => setImgOk(true)} onError={() => setImgOk(false)}
                className={imgOk ? "block w-full h-auto drop-shadow-[0_24px_60px_rgba(40,90,200,0.45)]" : "hidden"}
              />
            </motion.div>
            {!imgOk && <Globe />}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
