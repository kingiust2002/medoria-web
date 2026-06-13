// app/[lang]/catalog/page.jsx — server wrapper (SEO) + client catalog.
// Category views are self-canonical & indexable; search/filter views are
// canonicalised to the clean catalog and noindexed (thin/duplicate control).
import { Suspense } from "react";
import { LOCALES, CATEGORIES, getTranslations, getCategoryName } from "@/lib/i18n";
import { buildAlternates } from "@/lib/seo";
import CatalogInner from "./CatalogInner";

export async function generateMetadata({ params, searchParams }) {
  const { lang } = params;
  if (!LOCALES.includes(lang)) return {};
  const t = getTranslations(lang);

  const category = typeof searchParams?.category === "string" ? searchParams.category : null;
  const validCat = category && CATEGORIES.some((c) => c.slug === category) ? category : null;
  const isThin = Boolean(searchParams?.q) || (category && !validCat) || Boolean(searchParams?.brand) || Boolean(searchParams?.badge);

  if (isThin) {
    return {
      title: `${t.catalog.title} — ${t.common.brand}`,
      description: t.catalog.subtitle,
      alternates: buildAlternates(lang, "/catalog"),
      robots: { index: false, follow: true },
    };
  }

  const path = validCat ? `/catalog?category=${validCat}` : "/catalog";
  return {
    title: validCat ? `${getCategoryName(validCat, lang)} — ${t.common.brand}` : `${t.catalog.title} — ${t.common.brand}`,
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
