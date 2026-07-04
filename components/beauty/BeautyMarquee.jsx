// components/beauty/BeautyMarquee.jsx — giant serif marquee band (CSS-only,
// reuses the existing `animate-marquee` keyframes; pauses under reduced motion
// via the global rule). Decorative editorial texture between sections.
import BeautyMark from "./BeautyMark";
import { beautyCopy } from "./copy";

export default function BeautyMarquee({ lang }) {
  const words = beautyCopy(lang).marquee;
  const Row = ({ hidden }) => (
    <div aria-hidden={hidden || undefined} className="flex shrink-0 items-center">
      {words.map((w, i) => (
        <span key={i} className="flex items-center">
          <span
            className="font-beauty whitespace-nowrap px-6 text-5xl font-semibold italic tracking-tight sm:text-6xl"
            style={{ color: i % 2 ? "var(--v-accent)" : "var(--v-navy)", opacity: 0.92 }}
          >
            {w}
          </span>
          <BeautyMark size={22} opacity={0.55} />
        </span>
      ))}
    </div>
  );
  return (
    <section
      aria-label={words.join(" · ")}
      className="relative overflow-hidden border-y py-7"
      style={{ borderColor: "rgb(var(--v-line))", background: "rgb(var(--v-surface) / 0.5)" }}
    >
      <div dir="ltr" className="flex w-max animate-marquee">
        <Row />
        <Row hidden />
      </div>
    </section>
  );
}
