// app/page.jsx — Medoria gateway «LUMEN GATE» / Дарвозаи нур — the Medoria
// Aperture (SSR). One still-life scene rendered in TWO lights — glacial
// silver (Health, left of the aperture) and champagne copper (Beauty, right
// of it) — separated by a living optical boundary the visitor steers.
// Choosing a world IS moving the light. Campaign media is auto-detected by
// lib/gateway/media.js (image pair required-with-CSS-fallback; cinemagraph
// loops and macro specimens are optional future upgrades that appear by
// themselves when uploaded). Crawlable, complete without JS (aperture rests
// at 50%), never auto-forwards; all 8 world/language links live in the HTML.
import LumenStage from "@/components/gateway/LumenStage";
import { gatewayLumenMedia } from "@/lib/gateway/media";
import { DEFAULT_LOCALE, LANG_META } from "@/lib/i18n";

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

// The gateway shows the language links; fa stays reachable here even though
// inner pages hide it from their switcher (localization law).
// fa stays a live route (/health/fa, /beauty/fa) but is intentionally not
// linked from the gateway pills (owner request) — same "hidden fa" rule the
// inner switcher already follows.
const GATEWAY_LANGS = ["tg", "ru", "en"];

// The gateway now renders only the two world CTAs (Tajik-first). The former
// headline / hint / "choose your world" caption and the master parent logo
// were removed at the owner's request, so nothing else needs to be passed.
const GATEWAY_COPY = {
  health: { cta: "Ворид шудан ба Health" },
  beauty: { cta: "Кашф кардани Beauty" },
};

const langLabels = Object.fromEntries(GATEWAY_LANGS.map((c) => [c, LANG_META[c].name]));
const langDirs = Object.fromEntries(GATEWAY_LANGS.map((c) => [c, LANG_META[c].dir]));

export default function Gateway() {
  const media = gatewayLumenMedia();
  return (
    <main className="v-scope">
      <LumenStage
        media={media}
        copy={GATEWAY_COPY}
        defaultLang={DEFAULT_LOCALE}
        langs={GATEWAY_LANGS}
        langLabels={langLabels}
        langDirs={langDirs}
        year={new Date().getFullYear()}
      />
    </main>
  );
}
