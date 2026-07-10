// app/page.jsx — Medoria gateway v3 "The Atelier Doors" (SSR, cinematic).
// One alabaster stage, two living worlds. A center light-seam draws first,
// the worlds open outward from it like glass doors, then the real designed
// wordmark lockups rise with their taglines (pure-CSS choreography — plays
// without JS, collapses to the final frame under reduced motion). JS adds
// pointer parallax, magnetic CTAs and sparse ambient dust on capable
// desktops only. Crawlable, works JS-off; never auto-forwards.
import GatewayStage from "@/components/gateway/GatewayStage";
import { SWITCHER_LOCALES, DEFAULT_LOCALE, LANG_META } from "@/lib/i18n";

export const metadata = {
  title: "Medoria — Health & Beauty in Tajikistan",
  description:
    "Як бренд, ду ҷаҳони касбӣ — Medoria Health барои маводи тиббӣ ва Medoria Beauty барои косметикаи премиум.",
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
  eyebrow: "MEDORIA · TAJIKISTAN",
  headline: "Як хона. Ду ҷаҳон.",
  health: {
    chip: "GLACIAL · PRECISE · CLEAN",
    tagline: "Дақиқии клиникӣ бо эътимоди премиум — барои клиникаҳо, дорухонаҳо ва беморхонаҳо.",
    cta: "Ворид шудан ба Health",
  },
  beauty: {
    chip: "ROSE · CHAMPAGNE · VELVET",
    tagline: "Зебоии интихобӣ бо ҳисси нафосат — барои салонҳо, бутикҳо ва мутахассисон.",
    cta: "Кашф кардани Beauty",
  },
};

export default function Gateway() {
  return (
    <main className="v-scope noise relative flex min-h-[100svh] flex-col overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 90% at 50% -20%, #FFFFFF 40%, rgba(250,251,252,0.6) 70%, rgba(244,246,249,0.9) 100%)," +
            "linear-gradient(180deg, #FFFFFF 0%, #FAFBFC 100%)",
        }}
      />

      <header className="relative z-30 flex flex-col items-center px-6 pt-10 text-center">
        <p
          className="gw-rise mb-3 text-[10px] font-bold uppercase tracking-[0.34em]"
          style={{ "--d": "0.15s", color: "rgb(var(--v-ink-muted) / 0.7)" }}
        >
          {COPY.eyebrow}
        </p>
        <span dir="ltr" translate="no" aria-label="Medoria" className="gw-rise inline-flex items-center gap-2.5 select-none" style={{ "--d": "0.25s" }}>
          <img src="/logo-mark.png" alt="" aria-hidden="true" width={30} height={30} style={{ width: 30, height: 30 }} className="shrink-0 object-contain" />
          <img src="/brand/gateway/medoria-health.png" alt="Medoria" width={141} height={26} fetchPriority="high" style={{ height: 26, width: "auto" }} className="object-contain" />
        </span>
        <p className="gw-rise mt-3.5 font-display text-[17px] font-semibold tracking-tight" style={{ "--d": "0.38s", color: "rgb(var(--v-ink))" }}>
          {COPY.headline}
        </p>
      </header>

      <GatewayStage
        copy={COPY}
        defaultLang={DEFAULT_LOCALE}
        langs={SWITCHER_LOCALES}
        langLabels={langLabels}
      />

      <footer
        className="gw-rise relative z-30 flex items-center justify-center gap-3 px-6 pb-6 text-center text-[11px]"
        style={{ "--d": "1.45s", color: "rgb(var(--v-ink-muted) / 0.8)" }}
      >
        <span>© {new Date().getFullYear()} Medoria</span>
        <span aria-hidden="true" className="h-3 w-px" style={{ background: "rgb(var(--v-line))" }} />
        <span dir="ltr" translate="no">Health · Beauty</span>
      </footer>
    </main>
  );
}
