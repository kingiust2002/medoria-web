// app/[lang]/catalog/page.jsx — server wrapper (SEO) + client catalog.
import { Suspense } from "react";
import { LOCALES, getTranslations } from "@/lib/i18n";
import CatalogInner from "./CatalogInner";

export async function generateMetadata({ params }) {
  const { lang } = params;
  if (!LOCALES.includes(lang)) return {};
  const t = getTranslations(lang);
  return {
    title: `${t.catalog.title} — ${t.common.brand}`,
    description: t.catalog.subtitle,
    alternates: {
      canonical: `/${lang}/catalog`,
      languages: Object.fromEntries(LOCALES.map((l) => [l, `/${l}/catalog`])),
    },
  };
}

export default function CatalogPage({ params }) {
  return (
    <Suspense fallback={<div className="container-x py-20 text-center text-ink-muted">…</div>}>
      <CatalogInner params={params} />
    </Suspense>
  );
}
