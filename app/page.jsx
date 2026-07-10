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
const GATEWAY_LANGS = ["tg", "ru", "en", "fa"];

// Full four-locale copy deck (tg is the rendered, first-class voice; the
// other locales are the approved translations should the gateway ever become
// locale-aware). Eyebrows are deliberate Latin micro-labels.
const GATEWAY_COPY = {
  tg: {
    eyebrow: "MEDORIA · TAJIKISTAN",
    headline: "Як хона. Ду ҷаҳон.",
    hint: "Нурро ҳаракат диҳед.",
    choose: "Ҷаҳони худро интихоб кунед",
    health: {
      eyebrow: "MEDORIA HEALTH",
      title: "Дақиқӣ. Эътимод. Ҳар рӯз.",
      line: "Барои клиникаҳо, дорухонаҳо ва беморхонаҳои Тоҷикистон.",
      cta: "Ворид шудан ба Health",
    },
    beauty: {
      eyebrow: "MEDORIA BEAUTY",
      title: "Зебоӣ, ки эҳсос мешавад.",
      line: "Барои салонҳо, бутикҳо ва мутахассисони зебоӣ.",
      cta: "Кашф кардани Beauty",
    },
  },
  ru: {
    eyebrow: "MEDORIA · TAJIKISTAN",
    headline: "Один дом. Два мира.",
    hint: "Двигайте свет.",
    choose: "Выберите свой мир",
    health: {
      eyebrow: "MEDORIA HEALTH",
      title: "Точность. Доверие. Каждый день.",
      line: "Для клиник, аптек и больниц Таджикистана.",
      cta: "Перейти в Health",
    },
    beauty: {
      eyebrow: "MEDORIA BEAUTY",
      title: "Красота, которую чувствуешь.",
      line: "Для салонов, бутиков и профессионалов красоты.",
      cta: "Открыть Beauty",
    },
  },
  en: {
    eyebrow: "MEDORIA · TAJIKISTAN",
    headline: "One house. Two worlds.",
    hint: "Move the light.",
    choose: "Choose your world",
    health: {
      eyebrow: "MEDORIA HEALTH",
      title: "Precision. Trust. Every day.",
      line: "For clinics, pharmacies and hospitals across Tajikistan.",
      cta: "Enter Health",
    },
    beauty: {
      eyebrow: "MEDORIA BEAUTY",
      title: "Beauty you can feel.",
      line: "For salons, boutiques and beauty professionals.",
      cta: "Discover Beauty",
    },
  },
  fa: {
    eyebrow: "MEDORIA · TAJIKISTAN",
    headline: "یک خانه. دو جهان.",
    hint: "نور را حرکت دهید.",
    choose: "جهان خود را انتخاب کنید",
    health: {
      eyebrow: "MEDORIA HEALTH",
      title: "دقت. اعتماد. هر روز.",
      line: "برای کلینیک‌ها، داروخانه‌ها و بیمارستان‌های تاجیکستان.",
      cta: "ورود به Health",
    },
    beauty: {
      eyebrow: "MEDORIA BEAUTY",
      title: "زیبایی‌ای که حس می‌شود.",
      line: "برای سالن‌ها، بوتیک‌ها و متخصصان زیبایی.",
      cta: "کشف Beauty",
    },
  },
};

const langLabels = Object.fromEntries(GATEWAY_LANGS.map((c) => [c, LANG_META[c].name]));
const langDirs = Object.fromEntries(GATEWAY_LANGS.map((c) => [c, LANG_META[c].dir]));

export default function Gateway() {
  const media = gatewayLumenMedia();
  return (
    <main className="v-scope">
      <LumenStage
        media={media}
        copy={GATEWAY_COPY[DEFAULT_LOCALE]}
        defaultLang={DEFAULT_LOCALE}
        langs={GATEWAY_LANGS}
        langLabels={langLabels}
        langDirs={langDirs}
        year={new Date().getFullYear()}
      />
    </main>
  );
}
