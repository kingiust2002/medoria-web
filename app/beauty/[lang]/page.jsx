// app/beauty/[lang]/page.jsx — Medoria Beauty (pre-launch, noindex).
// The page mirrors the Health home skeleton section-for-section — hero →
// value bar → worlds (categories) → featured picks → showcase → marquee
// (brands slot) → why → audience → quote (trust slot) → partnership
// (procurement slot) → final CTA — in the nude-copper beauty identity.
import { notFound } from "next/navigation";
import { LOCALES } from "@/lib/i18n";
import { getBeautyMedia } from "@/lib/beauty/media";
import BeautyHero from "@/components/beauty/BeautyHero";
import BeautyValueBar from "@/components/beauty/BeautyValueBar";
import BeautyWorlds from "@/components/beauty/BeautyWorlds";
import BeautyFeatured from "@/components/beauty/BeautyFeatured";
import BeautyShowcase from "@/components/beauty/BeautyShowcase";
import BeautyMarquee from "@/components/beauty/BeautyMarquee";
import WhyBeauty from "@/components/beauty/WhyBeauty";
import BeautyAudience from "@/components/beauty/BeautyAudience";
import BeautyQuote from "@/components/beauty/BeautyQuote";
import BeautyPartnership from "@/components/beauty/BeautyPartnership";
import BeautyFinalCTA from "@/components/beauty/BeautyFinalCTA";
import { beautyCopy } from "@/components/beauty/copy";

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export function generateMetadata({ params }) {
  const { lang } = params;
  const t = beautyCopy(lang);
  return {
    title: "Medoria Beauty — Luxury cosmetics",
    description: t.hero.sub,
    robots: { index: false, follow: true },
    alternates: { canonical: `/beauty/${lang}` },
    openGraph: {
      type: "website",
      siteName: "Medoria",
      title: "Medoria Beauty",
      description: t.hero.sub,
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
      <BeautyHero lang={lang} media={media} />
      <BeautyValueBar lang={lang} />
      <BeautyWorlds lang={lang} media={media} />
      <BeautyFeatured lang={lang} media={media} />
      <BeautyShowcase lang={lang} media={media} />
      <BeautyMarquee lang={lang} />
      <WhyBeauty lang={lang} />
      <BeautyAudience lang={lang} />
      <BeautyQuote lang={lang} />
      <BeautyPartnership lang={lang} />
      <BeautyFinalCTA lang={lang} />
    </>
  );
}
