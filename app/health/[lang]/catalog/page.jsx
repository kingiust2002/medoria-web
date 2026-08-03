// app/health/[lang]/catalog/page.jsx — server wrapper (SEO) + client catalog.
import { Suspense } from "react";
import { LOCALES, getTranslations } from "@/lib/i18n";
import { getCategories } from "@/lib/supabase";
import { buildHealthCategoryTree, findHealthCategory, healthCategoryName } from "@/lib/health/categories";
import { buildAlternates } from "@/lib/seo";
import CatalogInner from "./CatalogInner";

export async function generateMetadata({ params, searchParams }) {
  const { lang } = params;
  if (!LOCALES.includes(lang)) return {};
  const t = getTranslations(lang);

  const categorySlug = typeof searchParams?.category === "string" ? searchParams.category : null;
  let category = null;
  if (categorySlug) {
    const rows = await getCategories();
    category = findHealthCategory(buildHealthCategoryTree(rows, { activeOnly: true }), categorySlug);
  }

  const isThin = Boolean(searchParams?.q)
    || Boolean(categorySlug && !category)
    || Boolean(searchParams?.brand)
    || Boolean(searchParams?.badge);

  if (isThin) {
    return {
      title: `${t.catalog.title} — ${t.common.brand}`,
      description: t.catalog.subtitle,
      alternates: buildAlternates(lang, "/catalog"),
      robots: { index: false, follow: true },
    };
  }

  const path = category ? `/catalog?category=${category.slug}` : "/catalog";
  return {
    title: category ? `${healthCategoryName(category, lang)} — ${t.common.brand}` : `${t.catalog.title} — ${t.common.brand}`,
    description: t.catalog.subtitle,
    alternates: buildAlternates(lang, path),
  };
}

export default function CatalogPage({ params }) {
  return (
    <Suspense fallback={<div className="container-x py-20 text-center text-ink-muted">…</div>}>
      <CatalogInner params={params} />
    </Suspense>
  );
}
