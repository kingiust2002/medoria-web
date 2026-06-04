// app/[lang]/page.jsx — Home
import { LOCALES, getTranslations } from "@/lib/i18n";
import Hero from "@/components/home/Hero";
import StatsBar from "@/components/home/StatsBar";
import CategoryGrid from "@/components/home/CategoryGrid";
import FeaturedProducts from "@/components/home/FeaturedProducts";
import Showcase from "@/components/home/Showcase";
import Brands from "@/components/home/Brands";
import Certifications from "@/components/home/Certifications";
import WhyMedoria from "@/components/home/WhyMedoria";
import ScrollyHowItWorks from "@/components/home/ScrollyHowItWorks";
import GlobeSection from "@/components/home/GlobeSection";
import Audience from "@/components/home/Audience";
import Trust from "@/components/home/Trust";
import Procurement from "@/components/home/Procurement";
import FinalCTA from "@/components/home/FinalCTA";

export async function generateMetadata({ params }) {
  const { lang } = params;
  if (!LOCALES.includes(lang)) return {};
  const t = getTranslations(lang);
  return {
    title: `${t.common.brand} — ${t.home.heroH1Pre} ${t.home.heroH1Accent}`,
    description: t.home.heroSub,
    alternates: {
      canonical: `/${lang}`,
      languages: Object.fromEntries(LOCALES.map((l) => [l, `/${l}`])),
    },
    openGraph: {
      title: `${t.common.brand} — ${t.home.heroH1Pre} ${t.home.heroH1Accent}`,
      description: t.home.heroSub,
      type: "website",
      images: [{ url: "/logo.png", width: 512, height: 512, alt: t.common.brand }],
    },
  };
}

export default function HomePage({ params }) {
  const { lang } = params;
  return (
    <>
      <Hero lang={lang} />
      <StatsBar lang={lang} />
      <CategoryGrid lang={lang} />
      <FeaturedProducts lang={lang} />
      <Showcase lang={lang} />
      <Brands lang={lang} />
      <Certifications lang={lang} />
      <WhyMedoria lang={lang} />
      <ScrollyHowItWorks lang={lang} />
      <GlobeSection lang={lang} />
      <Audience lang={lang} />
      <Trust lang={lang} />
      <Procurement lang={lang} />
      <FinalCTA lang={lang} />
    </>
  );
}
