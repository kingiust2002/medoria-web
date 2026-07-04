// app/beauty/[lang]/page.jsx — Medoria Beauty landing (pre-launch).
// Full nude-luxury editorial experience: hero, marquee, collections, story,
// scroll-scrubbed lookbook, partnership CTA. Still noindex until real product
// photography + catalog land — flip robots when Beauty officially launches.
import { notFound } from "next/navigation";
import { LOCALES } from "@/lib/i18n";
import BeautyHero from "@/components/beauty/BeautyHero";
import BeautyMarquee from "@/components/beauty/BeautyMarquee";
import BeautyCollections from "@/components/beauty/BeautyCollections";
import BeautyStory from "@/components/beauty/BeautyStory";
import BeautyLookbook from "@/components/beauty/BeautyLookbook";
import BeautyCTA from "@/components/beauty/BeautyCTA";
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
  return (
    <>
      <BeautyHero lang={lang} />
      <BeautyMarquee lang={lang} />
      <BeautyCollections lang={lang} />
      <BeautyStory lang={lang} />
      <BeautyLookbook lang={lang} />
      <BeautyCTA lang={lang} />
    </>
  );
}
