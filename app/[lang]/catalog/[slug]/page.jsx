// app/[lang]/catalog/[slug]/page.jsx — server wrapper: SEO + JSON-LD + client.
import Link from "next/link";
import { getProductBySlug, imageUrl } from "@/lib/supabase";
import { LOCALES, getTranslations, getCategoryName } from "@/lib/i18n";
import { buildAlternates, SITE_URL } from "@/lib/seo";
import { isOnRequest } from "@/lib/price";
import Icon from "@/components/shared/Icon";
import ProductDetailClient from "./ProductDetailClient";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { lang, slug } = params;
  const t = getTranslations(lang);
  const p = await getProductBySlug(slug);
  if (!p) return { title: `${t.common.brand}` };

  const name = p[`name_${lang}`] || p.name_en;
  const desc = (p[`description_${lang}`] || p.description_en || t.product.metaFallback || "").slice(0, 160);
  const path = `/catalog/${p.slug || p.id}`;
  const og = p.image_url ? imageUrl(p.image_url) : "/logo.png";

  return {
    title: `${name}${p.sku ? ` — ${p.sku}` : ""} — ${t.common.brand}`,
    description: desc,
    alternates: buildAlternates(lang, path),
    openGraph: {
      title: name,
      description: desc,
      type: "website",
      images: [{ url: og }],
    },
  };
}

export default async function ProductPage({ params }) {
  const { lang, slug } = params;
  const t = getTranslations(lang);
  const product = await getProductBySlug(slug);

  if (!product) {
    return (
      <div className="container-x py-20 text-center">
        <Icon name="package" size={48} className="text-ink-faint mx-auto mb-4" strokeWidth={1.2} />
        <p className="text-ink-muted">{t.common.noResults}</p>
        <Link href={`/${lang}/catalog`} className="btn-primary size-md mt-6 inline-flex">
          {t.product.backToCatalog.replace(/[←→]/g, "").trim()}
        </Link>
      </div>
    );
  }

  const name = product[`name_${lang}`] || product.name_en;
  const desc = product[`description_${lang}`] || product.description_en || "";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    ...(product.sku ? { sku: product.sku } : {}),
    ...(product.brand ? { brand: { "@type": "Brand", name: product.brand } } : {}),
    ...(desc ? { description: desc } : {}),
    category: getCategoryName(product.category, lang),
    offers: {
      "@type": "Offer",
      availability: product.in_stock
        ? "https://schema.org/InStock"
        : "https://schema.org/PreOrder",
      ...(isOnRequest(product) ? {} : { price: Number(product.price), priceCurrency: "USD" }),
    },
  };

  const crumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: t.common.home, item: `${SITE_URL}/${lang}` },
      { "@type": "ListItem", position: 2, name: t.common.catalog, item: `${SITE_URL}/${lang}/catalog` },
      { "@type": "ListItem", position: 3, name: getCategoryName(product.category, lang), item: `${SITE_URL}/${lang}/catalog?category=${product.category}` },
      { "@type": "ListItem", position: 4, name },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify([jsonLd, crumbLd]) }}
      />
      <ProductDetailClient product={product} lang={lang} />
    </>
  );
}
