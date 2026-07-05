// components/beauty/BeautyQuote.jsx — sits in Health's Trust slot: instead of
// testimonials (none exist for Beauty yet — nothing is fabricated), a serif
// brand statement over a soft champagne wash keeps the section rhythm.
import { Reveal } from "@/components/shared/Reveal";
import { BeautyMarkImg } from "./BeautyBrand";
import { beautyCopy } from "./copy";

export default function BeautyQuote({ lang }) {
  const t = beautyCopy(lang).quote;
  return (
    <section className="py-14 md:py-20 bg-canvas-soft border-y border-line">
      <div className="container-x">
        <Reveal className="relative mx-auto max-w-3xl text-center">
          <div className="mx-auto mb-6 w-fit"><BeautyMarkImg size={36} /></div>
          <blockquote>
            <p className="font-beauty text-3xl md:text-5xl font-semibold italic leading-snug" style={{ color: "var(--v-navy)" }}>
              «{t.q}»
            </p>
          </blockquote>
          <p className="mt-5 text-[14px] text-ink-muted">{t.p}</p>
        </Reveal>
      </div>
    </section>
  );
}
