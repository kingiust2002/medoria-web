// app/page.jsx — Medoria gateway «Оинаи нур» / The Light Mirror (SSR).
// ONE full-viewport still-life scene rendered in TWO lights: glacial-clinical
// (Health) left of a luminous seam, golden-champagne (Beauty) right of it.
// Moving the pointer moves the light — choosing between the worlds IS the
// interaction. Campaign photography is auto-detected from
// /public/images/gateway/mirror-{cool,warm}.* (lib/gateway/media.js); until
// both files exist a built-in CSS grading placeholder keeps the experience
// complete. Crawlable, works JS-off (seam rests at 50%); never auto-forwards.
import MirrorStage from "@/components/gateway/MirrorStage";
import { gatewayMirrorImages } from "@/lib/gateway/media";
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
  hint: "Нурро ҳаракат диҳед — ҷаҳони худро интихоб кунед.",
  health: {
    tagline: "Дақиқии клиникӣ бо эътимоди премиум — барои клиникаҳо, дорухонаҳо ва беморхонаҳо.",
    cta: "Ворид шудан ба Health",
  },
  beauty: {
    tagline: "Зебоии интихобӣ бо ҳисси нафосат — барои салонҳо, бутикҳо ва мутахассисон.",
    cta: "Кашф кардани Beauty",
  },
};

export default function Gateway() {
  const images = gatewayMirrorImages();
  return (
    <main className="v-scope">
      <MirrorStage
        images={images}
        copy={COPY}
        defaultLang={DEFAULT_LOCALE}
        langs={SWITCHER_LOCALES}
        langLabels={langLabels}
      />
    </main>
  );
}
