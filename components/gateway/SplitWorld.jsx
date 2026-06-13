// components/gateway/SplitWorld.jsx — one immersive world on the gateway.
// SSR / crawlable / JS-off. Hosts a decorative `scene`, a rotated Latin edge
// label, a descriptor chip, the Medoria lockup, Tajik-first tagline + CTA, and
// language entry pills. The ~55/45 hover & focus expansion is CSS-only and
// motion-safe (lg only). Nothing here requires JavaScript.
import Link from "next/link";
import Lockup from "@/components/layout/Lockup";

export default function SplitWorld({ vertical, side, scene, edgeLabel, chip, tagline, cta, defaultLang, langs, langLabels }) {
  const alignEdge = side === "left" ? "lg:items-start lg:text-start" : "lg:items-end lg:text-end";
  return (
    <section
      data-vertical={vertical}
      className="group/world relative isolate flex flex-1 items-center justify-center overflow-hidden px-6 py-16 transition-[flex-grow] duration-500 ease-out motion-safe:lg:hover:grow-[1.18] motion-safe:lg:focus-within:grow-[1.18]"
    >
      {scene}

      {/* decorative Latin edge label (rotated) */}
      <span
        aria-hidden="true"
        className={`absolute top-1/2 hidden -translate-y-1/2 text-[10px] font-bold uppercase tracking-[0.3em] lg:block ${side === "left" ? "left-5" : "right-5"}`}
        style={{
          writingMode: "vertical-rl",
          transform: side === "left" ? "rotate(180deg)" : "none",
          color: "rgb(var(--v-ink-muted))",
          opacity: 0.55,
        }}
      >
        {edgeLabel}
      </span>

      <div className={`relative z-10 flex max-w-sm flex-col items-center text-center ${alignEdge}`}>
        <span
          className="mb-5 inline-block rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em]"
          style={{ color: "var(--v-accent)", border: "1px solid rgb(var(--v-ring))", background: "rgb(var(--v-surface) / 0.55)" }}
        >
          {chip}
        </span>
        <Lockup vertical={vertical} size={40} />
        <p className="mt-4 max-w-xs text-[15px] leading-relaxed" style={{ color: "rgb(var(--v-ink-muted))" }}>
          {tagline}
        </p>
        <Link
          href={`/${vertical}/${defaultLang}`}
          className="v-btn v-focus mt-7 inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold transition-colors duration-300"
        >
          {cta}
          <span aria-hidden="true">→</span>
        </Link>
        <ul className="mt-6 flex items-center gap-2">
          {langs.map((code) => (
            <li key={code}>
              <Link
                href={`/${vertical}/${code}`}
                className="v-focus rounded-md px-2.5 py-1 text-[12px] font-semibold transition-colors"
                style={{ color: "rgb(var(--v-ink-muted))", border: "1px solid rgb(var(--v-line))" }}
              >
                {langLabels[code]}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
