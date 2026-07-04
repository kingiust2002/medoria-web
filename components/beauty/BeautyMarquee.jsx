"use client";
// components/beauty/BeautyMarquee.jsx — luxury editorial transition band.
// Large serif words separated by the official mark; the CSS marquee pauses
// whenever the band leaves the viewport (IntersectionObserver → class toggle)
// and under reduced motion via the global rule.
import { useEffect, useRef, useState } from "react";
import { BeautyMarkImg } from "./BeautyBrand";
import { beautyCopy } from "./copy";

export default function BeautyMarquee({ lang }) {
  const words = beautyCopy(lang).marquee;
  const ref = useRef(null);
  const [paused, setPaused] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setPaused(false);
      return;
    }
    const io = new IntersectionObserver(([e]) => setPaused(!e.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const Row = ({ hidden }) => (
    <div aria-hidden={hidden || undefined} className="flex shrink-0 items-center">
      {words.map((w, i) => (
        <span key={i} className="flex items-center gap-6 pe-6">
          <span
            className="font-beauty whitespace-nowrap text-5xl font-semibold italic tracking-tight sm:text-6xl"
            style={{ color: i % 2 ? "var(--v-accent)" : "var(--v-navy)", opacity: 0.9 }}
          >
            {w}
          </span>
          <BeautyMarkImg size={20} opacity={0.5} />
        </span>
      ))}
    </div>
  );

  return (
    <section
      ref={ref}
      aria-label={words.join(" · ")}
      className={`relative overflow-hidden border-y py-8 ${paused ? "v-marquee-paused" : ""}`}
      style={{ borderColor: "rgb(var(--v-line))", background: "rgb(var(--v-surface) / 0.5)" }}
    >
      <div dir="ltr" className="flex w-max animate-marquee [animation-duration:52s]">
        <Row />
        <Row hidden />
      </div>
    </section>
  );
}
