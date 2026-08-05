// app/beauty/[lang]/worlds/page.jsx — level 1 of «World»: the seven departments.
//
// This route reads NO searchParams and NO request state, so it prerenders and is
// served straight from the CDN edge nearest the visitor. Drilling in used to be
// `?dept=…` on this same page, which silently forced a per-request render on
// every hit (x-vercel-cache was permanently MISS) — the depth now lives in real
// route segments (./[dept] and ./[dept]/[group]) so all three levels are static.
import { notFound } from "next/navigation";
import { LOCALES } from "@/lib/i18n";
import { getBeautyCategoryTree } from "@/lib/beauty/catalog";
import { getBeautyTranslations } from "@/components/beauty/i18n";
import WorldGrid from "@/components/beauty/WorldGrid";
import { copyFor, deptHref, worldsHref, worldsLangParams } from "@/lib/beauty/worlds";

export const revalidate = 600;
export const generateStaticParams = worldsLangParams;

export function generateMetadata({ params }) {
  const { lang } = params;
  if (!LOCALES.includes(lang)) return {};
  const c = copyFor(lang);
  const title = `${c.root} — Medoria Beauty`;
  return {
    title,
    description: c.rootSub,
    robots: { index: false, follow: true },
    alternates: { canonical: worldsHref(lang) },
    openGraph: {
      type: "website",
      siteName: "Medoria",
      title,
      description: c.rootSub,
      images: [{ url: "/og/beauty.jpg", width: 1200, height: 630, alt: "Medoria Beauty" }],
    },
  };
}

export default async function WorldsPage({ params }) {
  const { lang } = params;
  if (!LOCALES.includes(lang)) notFound();
  const t = getBeautyTranslations(lang);
  const c = copyFor(lang);
  const tree = await getBeautyCategoryTree();

  return (
    <WorldGrid
      lang={lang}
      items={tree}
      variant="dept"
      heading={c.root}
      sub={c.rootSub}
      crumbs={[{ label: t.nav.home, href: `/beauty/${lang}` }, { label: c.worlds }]}
      headerImg="worlds-header"
      hrefFor={(node) => deptHref(lang, node.slug)}
    />
  );
}
