// app/beauty/[lang]/worlds/[dept]/page.jsx — level 2: one department's groups.
// A real route segment (was `/worlds?dept=…`), so this prerenders per
// locale × department and is served from the CDN edge.
import { notFound } from "next/navigation";
import { LOCALES } from "@/lib/i18n";
import { getBeautyCategoryTree } from "@/lib/beauty/catalog";
import { getBeautyTranslations } from "@/components/beauty/i18n";
import WorldGrid from "@/components/beauty/WorldGrid";
import {
  copyFor, nameOf, hasKids, worldsHref, deptHref, groupHref, catalogHref, worldsDeptParams,
} from "@/lib/beauty/worlds";

export const revalidate = 600;
export const generateStaticParams = worldsDeptParams;

// Resolve the department (and its position, which fixes the gradient family for
// the whole subtree) from the cached tree.
async function resolve(lang, deptSlug) {
  if (!LOCALES.includes(lang)) return null;
  const tree = await getBeautyCategoryTree();
  const index = tree.findIndex((d) => d.slug === deptSlug);
  return index < 0 ? null : { dept: tree[index], index };
}

export async function generateMetadata(props) {
  const params = await props.params;
  const found = await resolve(params.lang, params.dept);
  if (!found) return {};
  const { lang } = params;
  const title = `${nameOf(found.dept, lang)} — Medoria Beauty`;
  return {
    title,
    description: copyFor(lang).rootSub,
    robots: { index: false, follow: true },
    alternates: { canonical: deptHref(lang, found.dept.slug) },
    openGraph: {
      type: "website",
      siteName: "Medoria",
      title,
      images: [{ url: "/og/beauty.jpg", width: 1200, height: 630, alt: "Medoria Beauty" }],
    },
  };
}

export default async function WorldDeptPage(props) {
  const params = await props.params;
  const { lang, dept: deptSlug } = params;
  const found = await resolve(lang, deptSlug);
  if (!found) notFound();
  const { dept, index } = found;
  const t = getBeautyTranslations(lang);
  const c = copyFor(lang);
  const heading = nameOf(dept, lang);

  return (
    <WorldGrid
      lang={lang}
      items={dept.children || []}
      heading={heading}
      gradIndex={index}
      crumbs={[
        { label: t.nav.home, href: `/beauty/${lang}` },
        { label: c.worlds, href: worldsHref(lang) },
        { label: heading },
      ]}
      backHref={worldsHref(lang)}
      browseAllHref={catalogHref(lang, dept.slug)}
      // A group with its own children opens level 3; a direct leaf goes to the
      // filtered catalog.
      hrefFor={(node) => (hasKids(node) ? groupHref(lang, dept.slug, node.slug) : catalogHref(lang, node.slug))}
    />
  );
}
