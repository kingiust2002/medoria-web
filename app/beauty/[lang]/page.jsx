// app/beauty/[lang]/page.jsx — MEDORIA BEAUTY · NUDE COPPER EDITORIAL.
// Sequence: Hero → Marquee → Three Worlds → Signature Moment → Story →
// Lookbook → Philosophy → Partnership CTA (footer in layout). Campaign media
// resolves server-side from /public/beauty via the asset manifest; every slot
// degrades to an elegant satin fallback. Still noindex until launch approval.
import { notFound } from "next/navigation";
import { LOCALES } from "@/lib/i18n";
import { getBeautyMedia } from "@/lib/beauty/media";
import BeautyHero from "@/components/beauty/BeautyHero";
import BeautyMarquee from "@/components/beauty/BeautyMarquee";
import BeautyCollections from "@/components/beauty/BeautyCollections";
import BeautySignature from "@/components/beauty/BeautySignature";
import BeautyStory from "@/components/beauty/BeautyStory";
import BeautyLookbook from "@/components/beauty/BeautyLookbook";
import BeautyPhilosophy from "@/components/beauty/BeautyPhilosophy";
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
  const media = getBeautyMedia();
  return (
    <>
      <BeautyHero lang={lang} media={media} />
      <BeautyMarquee lang={lang} />
      <BeautyCollections lang={lang} media={media} />
      <BeautySignature lang={lang} media={media} />
      <BeautyStory lang={lang} media={media} />
      <BeautyLookbook lang={lang} media={media} />
      <BeautyPhilosophy lang={lang} />
      <BeautyCTA lang={lang} media={media} />
    </>
  );
}
