// app/beauty/[lang]/page.jsx — Medoria Beauty (pre-launch, noindex).
// EXACT copy of the Health home composition — the same twelve sections in the
// same order (verbatim component copies in components/beauty/home/*) —
// beauty-ized: beauty i18n, beauty links, official beauty logos, and the
// copper/navy reskin applied by the [data-vertical="beauty"] token scope.
import { notFound } from "next/navigation";
import { LOCALES } from "@/lib/i18n";
import { getBeautyMedia } from "@/lib/beauty/media";
import { getBeautyCategoryTree, beautyImageUrl } from "@/lib/beauty/catalog";
import { nameOf, deptHref, DEPT_IMG, copyFor } from "@/lib/beauty/worlds";
import { CATEGORY_IMG } from "@/lib/beauty/categoryImages";
import Hero from "@/components/beauty/home/Hero";
import StatsBar from "@/components/beauty/home/StatsBar";
import CategoryGrid from "@/components/beauty/home/CategoryGrid";
import FeaturedProducts from "@/components/beauty/home/FeaturedProducts";
import Showcase from "@/components/beauty/home/Showcase";
import Certifications from "@/components/beauty/home/Certifications";
import WhyMedoria from "@/components/beauty/home/WhyMedoria";
import Audience from "@/components/beauty/home/Audience";
import Procurement from "@/components/beauty/home/Procurement";
import FinalCTA from "@/components/beauty/home/FinalCTA";
import FilDorThread from "@/components/beauty/home/FilDorThread";
import { getBeautyTranslations } from "@/components/beauty/i18n";

export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}

export async function generateMetadata(props) {
  const { lang } = await props.params;
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

export default async function BeautyPage(props) {
  const { lang } = await props.params;
  if (!LOCALES.includes(lang)) notFound();
  const media = getBeautyMedia();

  // The hero is a client component, so it cannot read the category tree
  // itself. Flatten the seven departments to exactly what it renders — name,
  // link, tile, child count — rather than shipping the whole nested tree
  // (45 groups and 141 leaves) into the browser for seven chips.
  const tree = await getBeautyCategoryTree();
  const c = copyFor(lang);
  const depts = tree.map((d) => ({
    slug: d.slug,
    name: nameOf(d, lang),
    href: deptHref(lang, d.slug),
    icon: d.icon || null,
    img: beautyImageUrl(d.image_url) || CATEGORY_IMG[d.slug] || DEPT_IMG[d.slug] || null,
    count: d.children?.length || 0,
    countLabel: c.items,
  }));

  return (
    // Relative wrapper so the «Fil d'Or» thread overlay can span every section
    // it stitches together (stations are marked with data-fil-node).
    <div className="relative">
      <Hero lang={lang} banner={media["hero-banner"]} depts={depts} />
      <StatsBar lang={lang} />
      <CategoryGrid lang={lang} />
      <FeaturedProducts lang={lang} />
      <Showcase lang={lang} />
      <Certifications lang={lang} />
      <WhyMedoria lang={lang} />
      <Audience lang={lang} />
      <Procurement lang={lang} />
      <FinalCTA lang={lang} />
      <FilDorThread />
    </div>
  );
}
