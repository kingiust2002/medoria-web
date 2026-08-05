// app/beauty/[lang]/page.jsx — Medoria Beauty (pre-launch, noindex).
// EXACT copy of the Health home composition — the same twelve sections in the
// same order (verbatim component copies in components/beauty/home/*) —
// beauty-ized: beauty i18n, beauty links, official beauty logos, and the
// copper/navy reskin applied by the [data-vertical="beauty"] token scope.
import { notFound } from "next/navigation";
import { LOCALES } from "@/lib/i18n";
import { getBeautyMedia } from "@/lib/beauty/media";
import { getBeautyCategoryTree, getBeautyProducts, beautyImageUrl } from "@/lib/beauty/catalog";
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

// The home page now reads the catalog (the hero card and the «Featured»
// section both render starred products), so it can no longer be frozen at
// build time. Panel saves already call revalidatePath("/beauty/<lang>"); this
// is the safety net for edits made outside those actions.
export const revalidate = 600;

// How many starred products the hero card shows. The card is a narrow column
// beside the headline — beyond four rows it stops being a shop window and
// starts being a list, so the operator's extra picks stay in the «Featured»
// section further down the page instead of stretching the card.
const HERO_FEATURED = 4;

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

export default async function BeautyPage({ params }) {
  const { lang } = params;
  if (!LOCALES.includes(lang)) notFound();
  const media = getBeautyMedia();

  // The hero is a client component, so it cannot read the category tree
  // itself. Flatten the seven departments to exactly what it renders — name,
  // link, tile, child count — rather than shipping the whole nested tree
  // (45 groups and 141 leaves) into the browser for seven chips.
  // The hero's floating card is a shop window for the products the operator
  // starred (is_featured), so it needs the products too — fetched alongside
  // the tree rather than after it, since neither depends on the other.
  const [tree, featuredRows] = await Promise.all([
    getBeautyCategoryTree(),
    getBeautyProducts({ featured: true, limit: HERO_FEATURED }),
  ]);
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

  // Same treatment as `depts`: flatten to exactly the four fields the card
  // renders instead of shipping whole product rows into the browser.
  const featured = featuredRows.map((p) => ({
    slug: String(p.slug || p.id),
    name: p[`name_${lang}`] || p.name_en || p.name_ru || p.name_tg || p.sku || "",
    brand: p.brand || null,
    img: p.image_url ? beautyImageUrl(p.image_url) : null,
    href: `/beauty/${lang}/catalog/${p.slug || p.id}`,
  }));

  return (
    // Relative wrapper so the «Fil d'Or» thread overlay can span every section
    // it stitches together (stations are marked with data-fil-node).
    <div className="relative">
      <Hero lang={lang} banner={media["hero-banner"]} depts={depts} featured={featured} />
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
