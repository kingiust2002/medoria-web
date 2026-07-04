// components/beauty/BeautyFooter.jsx — slim navy footer, official mark.
import Link from "next/link";
import { BeautyMarkImg } from "./BeautyBrand";
import { beautyCopy } from "./copy";

export default function BeautyFooter({ lang }) {
  const t = beautyCopy(lang);
  return (
    <footer className="relative overflow-hidden py-12 text-white" style={{ background: "#141D3C" }}>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, var(--v-copper), transparent)" }}
      />
      <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 px-5 text-center">
        <span dir="ltr" translate="no" aria-label="Medoria Beauty" className="flex items-center gap-3">
          <span className="rounded-full bg-white/95 p-2"><BeautyMarkImg size={24} /></span>
          <span aria-hidden="true" className="text-[12px] font-bold uppercase tracking-[0.34em] text-white/85">
            Beauty
          </span>
        </span>
        <p className="text-[12.5px] text-white/55">{t.footer.tag}</p>
        <nav className="flex items-center gap-4 text-[12px] text-white/45" aria-label="Medoria">
          <Link href={`/health/${lang}`} className="v-focus transition-colors hover:text-white">{t.nav.health}</Link>
          <span aria-hidden="true">·</span>
          <Link href="/" className="v-focus transition-colors hover:text-white">{t.nav.gateway}</Link>
        </nav>
        <p className="text-[11px] text-white/30">© {new Date().getFullYear()} Medoria</p>
      </div>
    </footer>
  );
}
