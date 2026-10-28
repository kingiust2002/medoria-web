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
import { getLiveFeatured } from "@/lib/featuredLive";

export async function generateMetadata(props) {
  const params = await props.params;
  const { lang } = params;
  if (!LOCALES.includes(lang)) return {};
  const t = getTranslations(lang);
  return {
    title: t.seo.homeTitle,
    description: t.seo.homeDesc,
    alternates: buildAlternates(lang, ""),
    openGraph: {
      title: t.seo.homeTitle,
      description: t.seo.homeDesc,
      type: "website",
      images: [{ url: ogImage(), width: 1200, height: 630, alt: t.common.brand }],
    },
  };
}

export default async function HomePage(props) {
  const params = await props.params;
  const { lang } = params;
  const live = await getLiveFeatured("health", 6);        // the operators' own featured list; empty = the old rule inside the components
  return (
    <>
      <Hero lang={lang} featured={live.slice(0, 3)} />
      <StatsBar lang={lang} />
      <CategoryGrid lang={lang} />
      <FeaturedProducts lang={lang} featured={live} />
      <Showcase lang={lang} />
      <Certifications lang={lang} />
      <WhyMedoria lang={lang} />
      <Audience lang={lang} />
      <Procurement lang={lang} />
      <FinalCTA lang={lang} />
    </>
  );
}
