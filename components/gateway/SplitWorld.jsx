// components/gateway/SplitWorld.jsx
// One immersive world column on the gateway. Pure SSR, crawlable, JS-off.
// The ~55/45 hover & focus expansion is CSS-only and motion-safe — disabled
// under prefers-reduced-motion and below lg (stacked on mobile). Nothing here
// requires JavaScript to read or use.
import Link from "next/link";
import Lockup from "@/components/layout/Lockup";

export default function SplitWorld({ vertical, tagline, enterLabel, defaultLang, langs, langLabels }) {
  return (
    <section
      data-vertical={vertical}
      className="group/world relative isolate flex flex-1 flex-col items-center justify-center gap-6 px-6 py-14 text-center transition-[flex-grow] duration-500 ease-out motion-safe:lg:hover:grow-[1.22] motion-safe:lg:focus-within:grow-[1.22]"
    >
      {/* ambient world lighting — glow, not a colour block */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{ background: "radial-gradient(120% 85% at 50% 32%, var(--v-glow), transparent 70%)" }}
      />
      <Lockup vertical={vertical} size={30} />
      <p className="max-w-[19rem] text-[15px] leading-relaxed" style={{ color: "rgb(var(--v-ink-muted))" }}>
        {tagline}
      </p>
      <Link
        href={`/${vertical}/${defaultLang}`}
        className="v-cta v-focus inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold shadow-[var(--v-shadow)] transition-transform duration-300 hover:scale-[1.03]"
      >
        {enterLabel}
        <span aria-hidden="true">→</span>
      </Link>
      <ul className="flex items-center gap-2">
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
    </section>
  );
}
