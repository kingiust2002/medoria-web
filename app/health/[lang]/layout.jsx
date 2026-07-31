// app/[lang]/layout.jsx — per-locale shell: localized metadata defaults, Farsi
// noindex, global Organization + WebSite (SearchAction) JSON-LD, chrome.
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { LOCALES, LANG_META, getTranslations } from "@/lib/i18n";
import { SEO_KEYWORDS, robotsFor, SITE_URL, safeJsonLd } from "@/lib/seo";
import { getHealthNavTree } from "@/lib/health/navigation";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import FloatingWhatsApp from "@/components/shared/FloatingWhatsApp";
import AiAssistant from "@/components/shared/AiAssistant";
import ScrollProgress from "@/components/shared/ScrollProgress";

// Next.js 15 changed unconfigured server fetches to no-store. Supabase JS uses
// fetch internally, so preserve the previous public-catalog behavior here:
// individual pages still control freshness through their static `revalidate`
// values and operator mutations continue to call revalidatePath. Operator and
// API routes are outside this layout and remain uncached.
export const fetchCache = "default-cache";

// The Collection mega-menu follows the active database tree. Panel mutations
// revalidate Health routes; this interval is the fallback for external changes.
export const revalidate = 120;

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata(props) {
  const params = await props.params;
  const { lang } = params;
  if (!LOCALES.includes(lang)) return {};
  const t = getTranslations(lang);
  return {
    description: t.footer.desc,
    keywords: SEO_KEYWORDS[lang] || SEO_KEYWORDS.en,
    robots: robotsFor(lang),
    openGraph: { locale: lang },
    // Health's own mark — overrides the root's neutral combined favicon.
    icons: { icon: "/logo-mark.png", apple: "/logo-mark.png" },
  };
}

// Resolve the large category tree in its own streaming boundary. The first
// frame still contains a complete, usable header; the Collection entry becomes
// the cascading tree as soon as the slim locale-specific projection resolves.
async function HealthNav({ lang }) {
  const categoryTree = await getHealthNavTree(lang);
  return <Header lang={lang} categoryTree={categoryTree} />;
}

export default async function LangLayout(props) {
  const params = await props.params;

  const {
    children
  } = props;

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
      logo: `${SITE_URL}/logo-mark.png`,
      contactPoint: phone ? [{ "@type": "ContactPoint", telephone: phone, contactType: "sales", availableLanguage: ["English", "Russian", "Tajik"] }] : undefined,
      email: email || undefined,
    },
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: "Medoria",
      url: SITE_URL,
      potentialAction: {
        "@type": "SearchAction",
        target: `${SITE_URL}/health/${lang}/catalog?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    },
  ];

  return (
    <div dir={dir} data-lang={lang} data-vertical="health" className="min-h-screen flex flex-col bg-white text-slate-900">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      <ScrollProgress />
      <Suspense fallback={<Header lang={lang} categoryTree={[]} />}>
        <HealthNav lang={lang} />
      </Suspense>
      <main className="flex-1">{children}</main>
      <Footer lang={lang} t={t} />
      <AiAssistant lang={lang} />
      <FloatingWhatsApp />
    </div>
  );
}
