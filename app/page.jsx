// app/page.jsx — Medoria gateway v2 (SSR, art-directed split-world, light-first).
// Two worlds defined by accent lighting + frosted-glass scenes on an alabaster
// base, a frosted Medoria nexus on the axis, Tajik-first copy, and ~55/45 CSS
// hover/focus expansion. Crawlable, works JS-off; never auto-forwards.
import Lockup from "@/components/layout/Lockup";
import SplitWorld from "@/components/gateway/SplitWorld";
import Nexus from "@/components/gateway/Nexus";
import HealthScene from "@/components/gateway/HealthScene";
import BeautyScene from "@/components/gateway/BeautyScene";
import { SWITCHER_LOCALES, DEFAULT_LOCALE, LANG_META } from "@/lib/i18n";

export const metadata = {
  title: "Medoria — Health & Beauty in Tajikistan",
  description:
    "Як бренд, ду самти касбӣ — Medoria Health барои маводи тиббӣ ва Medoria Beauty барои косметикаи премиум.",
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: "Medoria",
    title: "Medoria — Health & Beauty",
    description: "Medoria Health for medical supplies. Medoria Beauty for premium cosmetics.",
    images: [{ url: "/og/health.jpg", width: 1200, height: 630, alt: "Medoria — Health & Beauty" }],
  },
};

const langLabels = Object.fromEntries(SWITCHER_LOCALES.map((c) => [c, LANG_META[c].name]));

const COPY = {
  eyebrow: "Як бренд. Ду самти касбӣ.",
  health: { tagline: "Қарорҳои клиникӣ бо эътимоди премиум.", cta: "Ворид шудан ба Health" },
  beauty: { tagline: "Зебоии интихобӣ бо нафосати ором.", cta: "Кашф кардани Beauty" },
};

export default function Gateway() {
  return (
    <main className="v-scope relative flex min-h-[100svh] flex-col overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{ background: "linear-gradient(180deg,#FFFFFF 0%,#FAFBFC 100%)" }}
      />

      <header className="relative z-30 flex flex-col items-center px-6 pt-9 text-center">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.34em]" style={{ color: "rgb(var(--v-ink-muted))", opacity: 0.7 }}>
          Medoria · Tajikistan
        </p>
        <Lockup size={26} />
        <p className="mt-3 text-[13px]" style={{ color: "rgb(var(--v-ink-muted))" }}>{COPY.eyebrow}</p>
      </header>

      <div className="relative z-10 flex flex-1 flex-col lg:flex-row">
        <SplitWorld
          vertical="health"
          side="left"
          scene={<HealthScene />}
          edgeLabel="CLINICAL · HEALTH"
          chip="GLACIAL · SURGICAL · CLEAN"
          tagline={COPY.health.tagline}
          cta={COPY.health.cta}
          defaultLang={DEFAULT_LOCALE}
          langs={SWITCHER_LOCALES}
          langLabels={langLabels}
        />
        <div
          aria-hidden="true"
          className="hidden w-px self-stretch lg:block"
          style={{ background: "linear-gradient(180deg,transparent,rgba(15,23,42,0.08),transparent)" }}
        />
        <SplitWorld
          vertical="beauty"
          side="right"
          scene={<BeautyScene />}
          edgeLabel="BEAUTY · LUXURY"
          chip="ROSE · CHAMPAGNE · ELEGANT"
          tagline={COPY.beauty.tagline}
          cta={COPY.beauty.cta}
          defaultLang={DEFAULT_LOCALE}
          langs={SWITCHER_LOCALES}
          langLabels={langLabels}
        />
      </div>

      <Nexus />

      <footer className="relative z-30 px-6 pb-6 text-center text-[11px]" style={{ color: "rgb(var(--v-ink-muted))", opacity: 0.8 }}>
        © {new Date().getFullYear()} Medoria
      </footer>
    </main>
  );
}
