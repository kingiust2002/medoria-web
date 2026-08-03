import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCategories, getProducts } from "@/lib/supabase";
import { getTranslations } from "@/lib/i18n";
import { buildAlternates, ogImage, robotsFor, safeJsonLd, SITE_URL } from "@/lib/seo";
import {
  buildHealthCategoryTree,
  findHealthCategory,
  getHealthCategoryPath,
  healthCategoryDescription,
  healthCategoryName,
  rollupHealthCategoryCounts,
} from "@/lib/health/categories";
import Breadcrumb from "@/components/shared/Breadcrumb";
import Icon from "@/components/shared/Icon";
import CategoryTreeGrid from "@/components/health/CategoryTreeGrid";
import HealthCategoryIcon from "@/components/health/HealthCategoryIcon";
import SeoCategoryDirectory from "@/components/health/SeoCategoryDirectory";

export const dynamic = "force-dynamic";

const FALLBACK_DESCRIPTION = {
  fa: "برای مشاهده گروه‌ها و دسته‌های تخصصی این بخش، مرحله بعد را انتخاب کنید.",
  tg: "Барои дидани гурӯҳҳо ва категорияҳои махсуси ин бахш, қадами навбатиро интихоб кунед.",
  ru: "Выберите следующий уровень, чтобы перейти к группам и специализированным категориям этого раздела.",
  en: "Choose the next level to browse the product groups and specialist categories in this section.",
};

export async function generateMetadata({ params }) {
  const { lang, slug } = params;
  const t = getTranslations(lang);

  try {
    const categories = await getCategories();
    const tree = buildHealthCategoryTree(categories, { activeOnly: true });
    const category = findHealthCategory(tree, slug);
    if (!category) return {};

    const name = healthCategoryName(category, lang);
    const description = healthCategoryDescription(category, lang) || FALLBACK_DESCRIPTION[lang] || FALLBACK_DESCRIPTION.en;
    return {
      title: `${name} — ${t.common.brand}`,
      description,
      alternates: buildAlternates(lang, `/categories/${category.slug}`),
      robots: robotsFor(lang),
      openGraph: {
        title: `${name} — ${t.common.brand}`,
        description,
        images: [{ url: ogImage(name), width: 1200, height: 630, alt: name }],
      },
    };
  } catch {
    return { title: t.common.brand, robots: robotsFor(lang) };
  }
}

export default async function HealthCategoryPage({ params }) {
  const { lang, slug } = params;
  const t = getTranslations(lang);
  const [categories, products] = await Promise.all([getCategories(), getProducts()]);
  const tree = buildHealthCategoryTree(categories, { activeOnly: true });
  const category = findHealthCategory(tree, slug);

  if (!category) notFound();
  if (!category.children?.length) redirect(`/health/${lang}/catalog?category=${category.slug}`);

  const counts = new Map();
  for (const product of products) {
    if (product.category_id != null) {
      const key = String(product.category_id);
      counts.set(key, (counts.get(key) || 0) + 1);
    } else if (product.category) {
      const key = `slug:${product.category}`;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }
  rollupHealthCategoryCounts(tree, counts);

  const path = getHealthCategoryPath(tree, slug);
  const parent = path.length > 1 ? path[path.length - 2] : null;
  const categoryName = healthCategoryName(category, lang);
  const description = healthCategoryDescription(category, lang) || FALLBACK_DESCRIPTION[lang] || FALLBACK_DESCRIPTION.en;
  const crumbs = [
    { label: t.common.home, href: `/health/${lang}` },
    { label: t.common.categories, href: `/health/${lang}/categories` },
    ...path.slice(0, -1).map((node) => ({
      label: healthCategoryName(node, lang),
      href: `/health/${lang}/categories/${node.slug}`,
    })),
    { label: categoryName },
  ];

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: categoryName,
    numberOfItems: category.children.length,
    itemListElement: category.children.map((node, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: healthCategoryName(node, lang),
      url: node.children?.length
        ? `${SITE_URL}/health/${lang}/categories/${node.slug}`
        : `${SITE_URL}/health/${lang}/catalog?category=${node.slug}`,
    })),
  };

  return (
    <div className="bg-canvas-soft min-h-screen pb-16 md:pb-20">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(itemList) }} />

      <div className="border-b border-line bg-canvas-soft">
        <div className="container-x py-9 md:py-12">
          <Breadcrumb lang={lang} className="mb-5" crumbs={crumbs} />
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-5">
            <div className="flex items-start gap-4 min-w-0">
              <span className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-brand-violet/10 text-brand-violet grid place-items-center shrink-0">
                <HealthCategoryIcon node={category} size={30} strokeWidth={1.5} />
              </span>
              <div className="min-w-0">
                <h1 className="font-display text-3xl md:text-4xl font-extrabold text-ink tracking-tight leading-tight">{categoryName}</h1>
                <p className="text-sm text-ink-muted mt-2 max-w-2xl leading-relaxed">{description}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Link
                href={parent ? `/health/${lang}/categories/${parent.slug}` : `/health/${lang}/categories`}
                className="btn-ghost size-md"
              >
                <Icon name={lang === "fa" ? "arrow" : "arrowL"} size={15} />
                {lang === "fa" ? "مرحله قبل" : lang === "tg" ? "Қадами пешина" : lang === "ru" ? "Назад" : "Back"}
              </Link>
              <Link href={`/health/${lang}/catalog?category=${category.slug}`} className="btn-primary size-md">
                {lang === "fa" ? "همه محصولات این بخش" : lang === "tg" ? "Ҳамаи маҳсулоти бахш" : lang === "ru" ? "Все товары раздела" : "All products in this section"}
                <Icon name="arrowUpRight" size={15} />
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="container-x py-10 md:py-14">
        <CategoryTreeGrid
          lang={lang}
          items={category.children}
          hrefFor={(node) => node.children?.length
            ? `/health/${lang}/categories/${node.slug}`
            : `/health/${lang}/catalog?category=${node.slug}`}
        />

        <div className="mt-8 md:mt-10">
          <SeoCategoryDirectory lang={lang} tree={category.children} previewCount={5} />
        </div>
      </div>
    </div>
  );
}
