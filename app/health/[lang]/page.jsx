// app/[lang]/page.jsx — Home
import { LOCALES, getTranslations } from "@/lib/i18n";
import { buildAlternates, ogImage } from "@/lib/seo";
import Hero from "@/components/home/Hero";
import StatsBar from "@/components/home/StatsBar";
import CategoryGrid from "@/components/home/CategoryGrid";
import FeaturedProducts from "@/components/home/FeaturedProducts";
import Showcase from "@/components/home/Showcase";
import Certifications from "@/components/home/Certifications";
import WhyMedoria from "@/components/home/WhyMedoria";
import Audience from "@/components/home/Audience";
import Procurement from "@/components/home/Procurement";
import FinalCTA from "@/components/home/FinalCTA";

export async function generateMetadata({ params }) {
  const { lang } = params;
  if (!LOCALES.includes(lang)) return {};
  const t = getTranslations(lang);
  return {
    title: `${t.common.brand} — ${t.home.heroH1Pre} ${t.home.heroH1Accent}`,
    description: t.home.heroSub,
    alternates: buildAlternates(lang, ""),
    openGraph: {
      title: `${t.common.brand} — ${t.home.heroH1Pre} ${t.home.heroH1Accent}`,
      description: t.home.heroSub,
      type: "website",
      images: [{ url: ogImage(), width: 1200, height: 630, alt: t.common.brand }],
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
      <Certifications lang={lang} />
      <WhyMedoria lang={lang} />
      <Audience lang={lang} />
      <Procurement lang={lang} />
      <FinalCTA lang={lang} />
    </>
  );
}
