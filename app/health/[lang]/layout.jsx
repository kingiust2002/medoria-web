// app/[lang]/layout.jsx — per-locale shell: localized metadata defaults, Farsi
// noindex, global Organization + WebSite (SearchAction) JSON-LD, chrome.
import { notFound } from "next/navigation";
import { LOCALES, LANG_META, getTranslations } from "@/lib/i18n";
import { SEO_KEYWORDS, robotsFor, SITE_URL, safeJsonLd } from "@/lib/seo";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import FloatingWhatsApp from "@/components/shared/FloatingWhatsApp";
import AiAssistant from "@/components/shared/AiAssistant";
import ScrollProgress from "@/components/shared/ScrollProgress";

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export function generateMetadata({ params }) {
  const { lang } = params;
  if (!LOCALES.includes(lang)) return {};
  const t = getTranslations(lang);
  return {
    description: t.footer.desc,
    keywords: SEO_KEYWORDS[lang] || SEO_KEYWORDS.en,
    robots: robotsFor(lang),
    openGraph: { locale: lang },
  };
}

export default function LangLayout({ children, params }) {
  const { lang } = params;
  if (!LOCALES.includes(lang)) notFound();
  const dir = LANG_META[lang].dir;
  const t = getTranslations(lang);

  const phone = process.env.NEXT_PUBLIC_PHONE;
  const email = process.env.NEXT_PUBLIC_EMAIL;
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "Medoria",
      url: SITE_URL,
      logo: `${SITE_URL}/logo.png`,
      description: t.footer.desc,
      areaServed: { "@type": "Country", name: "Tajikistan" },
      contactPoint: [{
        "@type": "ContactPoint",
        contactType: "sales",
        availableLanguage: ["en", "ru", "tg"],
        ...(phone ? { telephone: phone } : {}),
        ...(email ? { email } : {}),
      }],
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Medoria",
      url: SITE_URL,
      inLanguage: ["en", "ru", "tg"],
      potentialAction: {
        "@type": "SearchAction",
        target: `${SITE_URL}/health/${lang}/catalog?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
  ];

  return (
    <div lang={lang} dir={dir} data-vertical="health" className={dir === "rtl" ? "font-farsi" : "font-sans"}>
      {/* Set html attributes via script to avoid SSR mismatch */}
      <script
        dangerouslySetInnerHTML={{
          __html: `document.documentElement.lang="${lang}";document.documentElement.dir="${dir}";`,
        }}
      />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      <ScrollProgress />
      {/* subtle film-grain overlay — premium textured feel, never blocks input */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-[70] opacity-[0.035] mix-blend-soft-light"
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }}
      />
      <Header lang={lang} />
      <main>{children}</main>
      <Footer lang={lang} />
      <FloatingWhatsApp lang={lang} />
      <AiAssistant lang={lang} />
    </div>
  );
}
