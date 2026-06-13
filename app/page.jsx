// app/page.jsx — Medoria gateway (SSR, premium split-world, light-first).
// Always at "/"; never auto-forwards. Two worlds defined by accent lighting on a
// shared alabaster base, with a central Medoria nexus on the axis. CSS-only
// hover/focus expansion (motion-safe, lg-only). Fully crawlable & works JS-off.
import Lockup from "@/components/layout/Lockup";
import SplitWorld from "@/components/gateway/SplitWorld";
import Nexus from "@/components/gateway/Nexus";
import { SWITCHER_LOCALES, DEFAULT_LOCALE, LANG_META } from "@/lib/i18n";

export const metadata = {
  title: "Medoria — Health & Beauty in Tajikistan",
  description:
    "Choose your Medoria world — Medoria Health for medical supplies and consumables, or Medoria Beauty for premium cosmetics. Serving clinics, pharmacies and beauty professionals across Tajikistan.",
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: "Medoria",
    title: "Medoria — Health & Beauty",
    description: "Medoria Health for medical supplies. Medoria Beauty for premium cosmetics.",
  },
};

const langLabels = Object.fromEntries(SWITCHER_LOCALES.map((c) => [c, LANG_META[c].name]));

export default function Gateway() {
  return (
    <main className="v-scope relative flex min-h-[100svh] flex-col overflow-hidden">
      {/* alabaster studio wash — light, static, decorative */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: "linear-gradient(180deg,#FFFFFF 0%,#FAFAFA 100%)" }}
      />

      <header className="relative z-30 flex flex-col items-center px-6 pt-10 text-center">
        <Lockup size={28} />
        <p className="mt-3 text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: "rgb(var(--v-ink-muted))" }}>
          Choose your world
        </p>
      </header>

      <div className="relative z-10 flex flex-1 flex-col lg:flex-row">
        <SplitWorld
          vertical="health"
          tagline="Medical supplies & consumables — trusted by clinics, pharmacies and hospitals."
          enterLabel="Enter Medoria Health"
          defaultLang={DEFAULT_LOCALE}
          langs={SWITCHER_LOCALES}
          langLabels={langLabels}
        />
        {/* soft luminous seam — no hard border */}
        <div
          aria-hidden="true"
          className="hidden w-px self-stretch lg:block"
          style={{ background: "linear-gradient(180deg, transparent, rgba(15,23,42,0.09), transparent)" }}
        />
        <SplitWorld
          vertical="beauty"
          tagline="Cosmetics & beauty essentials — curated, premium, arriving soon."
          enterLabel="Enter Medoria Beauty"
          defaultLang={DEFAULT_LOCALE}
          langs={SWITCHER_LOCALES}
          langLabels={langLabels}
        />
      </div>

      <Nexus />

      <footer className="relative z-30 px-6 pb-6 text-center text-xs" style={{ color: "rgb(var(--v-ink-muted))" }}>
        © {new Date().getFullYear()} Medoria
      </footer>
    </main>
  );
}
