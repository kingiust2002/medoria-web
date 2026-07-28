// app/beauty/[lang]/worlds/[dept]/[group]/page.jsx — level 3: a group's
// subgroups. Leaves link into the filtered catalog. Prerendered per
// locale × department × group.
import { notFound } from "next/navigation";
import { LOCALES } from "@/lib/i18n";
import { getBeautyCategoryTree } from "@/lib/beauty/catalog";
import { getBeautyTranslations } from "@/components/beauty/i18n";
import WorldGrid from "@/components/beauty/WorldGrid";
import {
  copyFor, nameOf, worldsHref, deptHref, groupHref, catalogHref, worldsGroupParams,
} from "@/lib/beauty/worlds";

export const revalidate = 600;
export const generateStaticParams = worldsGroupParams;

async function resolve(lang, deptSlug, groupSlug) {
  if (!LOCALES.includes(lang)) return null;
  const tree = await getBeautyCategoryTree();
  const index = tree.findIndex((d) => d.slug === deptSlug);
  if (index < 0) return null;
  const dept = tree[index];
  const group = (dept.children || []).find((g) => g.slug === groupSlug);
  return group ? { dept, group, index } : null;
}

export async function generateMetadata(props) {
  const params = await props.params;
  const found = await resolve(params.lang, params.dept, params.group);
  if (!found) return {};
  const { lang } = params;
  const title = `${nameOf(found.group, lang)} — Medoria Beauty`;
  return {
    title,
    description: copyFor(lang).rootSub,
    robots: { index: false, follow: true },
    alternates: { canonical: groupHref(lang, found.dept.slug, found.group.slug) },
    openGraph: {
      type: "website",
      siteName: "Medoria",
      title,
      images: [{ url: "/og/beauty.jpg", width: 1200, height: 630, alt: "Medoria Beauty" }],
    },
  };
}

export default async function WorldGroupPage(props) {
  const params = await props.params;
  const { lang, dept: deptSlug, group: groupSlug } = params;
  const found = await resolve(lang, deptSlug, groupSlug);
  if (!found) notFound();
  const { dept, group, index } = found;
  const t = getBeautyTranslations(lang);
  const c = copyFor(lang);
  const heading = nameOf(group, lang);

  return (
    <WorldGrid
      lang={lang}
      items={group.children || []}
      heading={heading}
      gradIndex={index}
      crumbs={[
        { label: t.nav.home, href: `/beauty/${lang}` },
        { label: c.worlds, href: worldsHref(lang) },
        { label: nameOf(dept, lang), href: deptHref(lang, dept.slug) },
        { label: heading },
      ]}
      backHref={deptHref(lang, dept.slug)}
      browseAllHref={catalogHref(lang, group.slug)}
      hrefFor={(node) => catalogHref(lang, node.slug)}
    />
  );
}
