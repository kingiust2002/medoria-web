// app/[lang]/page.jsx
import Hero from "@/components/home/Hero";
import StatsBar from "@/components/home/StatsBar";
import CategoryGrid from "@/components/home/CategoryGrid";
import FeaturedProducts from "@/components/home/FeaturedProducts";
import WhyMedoria from "@/components/home/WhyMedoria";
import Process from "@/components/home/Process";
import Audience from "@/components/home/Audience";
import FinalCTA from "@/components/home/FinalCTA";

export default function HomePage({ params }) {
  const { lang } = params;
  return (
    <>
      <Hero lang={lang} />
      <StatsBar lang={lang} />
      <CategoryGrid lang={lang} />
      <FeaturedProducts lang={lang} />
      <WhyMedoria lang={lang} />
      <Process lang={lang} />
      <Audience lang={lang} />
      <FinalCTA lang={lang} />
    </>
  );
}
