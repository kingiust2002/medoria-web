// app/beauty/[lang]/page.jsx — Medoria Beauty premium teaser (noindex/follow).
// A luxury pre-launch page, NOT a catalog. The curated landing + sector-scoped
// products land in a later PR.
import { notFound } from "next/navigation";
import { LOCALES } from "@/lib/i18n";
import BeautyTeaser from "@/components/beauty/BeautyTeaser";

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export function generateMetadata({ params }) {
  const { lang } = params;
  return {
    title: "Medoria Beauty — Coming soon",
    robots: { index: false, follow: true },
    alternates: { canonical: `/beauty/${lang}` },
    openGraph: {
      type: "website",
      siteName: "Medoria",
      title: "Medoria Beauty",
      description: "Premium cosmetics & beauty — arriving soon.",
      images: [{ url: "/og/beauty.jpg", width: 1200, height: 630, alt: "Medoria Beauty" }],
    },
  };
}

export default function BeautyPage({ params }) {
  const { lang } = params;
  if (!LOCALES.includes(lang)) notFound();
  return <BeautyTeaser lang={lang} />;
}
