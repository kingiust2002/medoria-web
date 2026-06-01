// app/[lang]/layout.jsx
import { notFound } from "next/navigation";
import { LOCALES, LANG_META, getTranslations } from "@/lib/i18n";
import Header from "@/components/layout/Header";
import TopBar from "@/components/layout/TopBar";
import Footer from "@/components/layout/Footer";
import FloatingWhatsApp from "@/components/shared/FloatingWhatsApp";
import AiAssistant from "@/components/shared/AiAssistant";

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export function generateMetadata({ params }) {
  const { lang } = params;
  if (!LOCALES.includes(lang)) return {};
  const t = getTranslations(lang);
  const title = `${t.common.brand} — ${t.home.heroH1Pre} ${t.home.heroH1Accent}`;
  return {
    title: t.common.brand,
    description: t.footer.desc,
    keywords: ["medical supplies", "Tajikistan", "B2B", "медицинские расходники", "Душанбе", t.common.brand],
    alternates: {
      languages: Object.fromEntries(LOCALES.map((l) => [l, `/${l}`])),
    },
    openGraph: {
      title,
      description: t.footer.desc,
      siteName: t.common.brand,
      locale: lang,
      type: "website",
      images: [{ url: "/logo.png", width: 512, height: 512, alt: t.common.brand }],
    },
    twitter: {
      card: "summary",
      title,
      description: t.footer.desc,
      images: ["/logo.png"],
    },
  };
}

export default function LangLayout({ children, params }) {
  const { lang } = params;
  if (!LOCALES.includes(lang)) notFound();
  const dir = LANG_META[lang].dir;

  return (
    <div lang={lang} dir={dir} className={dir === "rtl" ? "font-farsi" : "font-sans"}>
      {/* Set html attributes via script to avoid SSR mismatch */}
      <script
        dangerouslySetInnerHTML={{
          __html: `document.documentElement.lang="${lang}";document.documentElement.dir="${dir}";`,
        }}
      />
      <TopBar lang={lang} />
      <Header lang={lang} />
      <main>{children}</main>
      <Footer lang={lang} />
      <FloatingWhatsApp lang={lang} />
      <AiAssistant lang={lang} />
    </div>
  );
}
