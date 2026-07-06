// app/beauty/[lang]/page.jsx — Medoria Beauty (pre-launch, noindex).
// EXACT copy of the Health home composition — the same twelve sections in the
// same order (verbatim component copies in components/beauty/home/*) —
// beauty-ized: beauty i18n, beauty links, official beauty logos, and the
// copper/navy reskin applied by the [data-vertical="beauty"] token scope.
import { notFound } from "next/navigation";
import { LOCALES } from "@/lib/i18n";
import { getBeautyMedia } from "@/lib/beauty/media";
import Hero from "@/components/beauty/home/Hero";
import StatsBar from "@/components/beauty/home/StatsBar";
import CategoryGrid from "@/components/beauty/home/CategoryGrid";
import FeaturedProducts from "@/components/beauty/home/FeaturedProducts";
import Showcase from "@/components/beauty/home/Showcase";
import Brands from "@/components/beauty/home/Brands";
import Certifications from "@/components/beauty/home/Certifications";
import WhyMedoria from "@/components/beauty/home/WhyMedoria";
import Audience from "@/components/beauty/home/Audience";
import Trust from "@/components/beauty/home/Trust";
import Procurement from "@/components/beauty/home/Procurement";
import FinalCTA from "@/components/beauty/home/FinalCTA";
import { getBeautyTranslations } from "@/components/beauty/i18n";

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export function generateMetadata({ params }) {
  const { lang } = params;
  const t = getBeautyTranslations(lang);
  return {
    title: "Medoria Beauty — Luxury cosmetics",
    description: t.home.heroSub,
    robots: { index: false, follow: true },
    alternates: { canonical: `/beauty/${lang}` },
    openGraph: {
      type: "website",
      siteName: "Medoria",
      title: "Medoria Beauty",
      description: t.home.heroSub,
      images: [{ url: "/og/beauty.jpg", width: 1200, height: 630, alt: "Medoria Beauty" }],
    },
  };
}

export default function BeautyPage({ params }) {
  const { lang } = params;
  if (!LOCALES.includes(lang)) notFound();
  const media = getBeautyMedia();
  return (
    <>
      <Hero lang={lang} banner={media["hero-banner"]} />
      <StatsBar lang={lang} />
      <CategoryGrid lang={lang} />
      <FeaturedProducts lang={lang} />
      <Showcase lang={lang} />
      <Brands lang={lang} />
      <Certifications lang={lang} />
      <WhyMedoria lang={lang} />
      <Audience lang={lang} />
      <Trust lang={lang} />
      <Procurement lang={lang} />
      <FinalCTA lang={lang} />
    </>
  );
}
