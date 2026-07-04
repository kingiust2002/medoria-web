// components/beauty/BeautyFooter.jsx — slim navy footer for the Beauty world.
import Link from "next/link";
import BeautyMark from "./BeautyMark";
import { beautyCopy } from "./copy";

export default function BeautyFooter({ lang }) {
  const t = beautyCopy(lang);
  return (
    <footer className="relative overflow-hidden py-12 text-white" style={{ background: "var(--v-navy)" }}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, var(--v-copper), transparent)" }}
      />
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 px-5 text-center">
        <span className="flex items-center gap-2.5">
          <BeautyMark size={26} />
          <span className="font-beauty text-lg font-bold">
            Medoria <span className="italic" style={{ color: "var(--v-champagne)" }}>Beauty</span>
          </span>
        </span>
        <p className="text-[12.5px] text-white/55">{t.footer.tag}</p>
        <nav className="flex items-center gap-4 text-[12px] text-white/45">
          <Link href={`/health/${lang}`} className="v-focus transition-colors hover:text-white">{t.nav.health}</Link>
          <span aria-hidden="true">·</span>
          <Link href="/" className="v-focus transition-colors hover:text-white">{t.nav.gateway}</Link>
        </nav>
        <p className="text-[11px] text-white/30">© {new Date().getFullYear()} Medoria</p>
      </div>
    </footer>
  );
}
