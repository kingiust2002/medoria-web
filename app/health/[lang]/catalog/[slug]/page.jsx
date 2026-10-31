// app/[lang]/catalog/[slug]/page.jsx — server wrapper: SEO + JSON-LD + client.
import { notFound } from "next/navigation";
import { getProductBySlug, getProductVariants, imageUrl } from "@/lib/supabase";
import { variantsJsonLd } from "@/lib/operator/variants";
import { LOCALES, getTranslations, getCategoryName } from "@/lib/i18n";
import { buildAlternates, SITE_URL, safeJsonLd } from "@/lib/seo";
import { isOnRequest } from "@/lib/price";
import ProductDetailClient from "./ProductDetailClient";

// ISR instead of force-dynamic: product pages are served from the CDN cache
// and re-render at most every 5 minutes per slug — Supabase sees revalidations,
// not every pageview. Operator saves refresh instantly via revalidateHealthPublic
// (lib/health/revalidate.js); a short fetch lifetime (lib/supabase.js) covers edits
// made any other way, e.g. directly in the database.
export const revalidate = 300;

// Empty on purpose: no DB dependency at build time. Each slug renders on its
// first request and is then cached/revalidated (dynamicParams default).
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata(props) {
  const params = await props.params;
  const { lang, slug } = params;
  const t = getTranslations(lang);
  const p = await getProductBySlug(slug);
  if (!p) return { title: `${t.common.brand}` };

  const name = p[`name_${lang}`] || p.name_en;
  const desc = (p[`description_${lang}`] || p.description_en || t.product.metaFallback || "").slice(0, 160);
  const path = `/catalog/${p.slug || p.id}`;
  const og = p.image_url ? imageUrl(p.image_url) : "/logo.png";

  return {
    title: `${name}${p.sku ? ` — ${p.sku}` : ""}`,
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

export default async function ProductPage(props) {
  const params = await props.params;
  const { lang, slug } = params;
  const t = getTranslations(lang);
  // throwOnError: a DB blip during ISR revalidation keeps the stale page
  // alive instead of caching a "not found" for a real product.
  const product = await getProductBySlug(slug, { throwOnError: true });

  // Unknown slug OR archived product (getProductBySlug only returns active rows):
  // a real 404, not a 200 "no results" page (see not-found.jsx).
  if (!product) notFound();

  const variants = await getProductVariants(product.id);        // [] for an ordinary product and before migration 44
  const name = product[`name_${lang}`] || product.name_en;
  const desc = product[`description_${lang}`] || product.description_en || "";
  const productLd = {
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

  const jsonLd = variantsJsonLd({ base: productLd, variants, name, url: `${SITE_URL}/health/${lang}/catalog/${product.slug || product.id}` }) || productLd;

  const crumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: t.common.home, item: `${SITE_URL}/health/${lang}` },
      { "@type": "ListItem", position: 2, name: t.common.catalog, item: `${SITE_URL}/health/${lang}/catalog` },
      { "@type": "ListItem", position: 3, name: getCategoryName(product.category, lang), item: `${SITE_URL}/health/${lang}/catalog?category=${product.category}` },
      { "@type": "ListItem", position: 4, name },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd([jsonLd, crumbLd]) }}
      />
      <ProductDetailClient product={product} lang={lang} variants={variants} />
    </>
  );
}
