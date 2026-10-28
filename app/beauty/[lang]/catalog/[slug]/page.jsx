// app/beauty/[lang]/catalog/[slug]/page.jsx — Beauty product page. Server-first
// and editorial: gallery, brand line, serif name, price-or-request, WhatsApp/
// Telegram inquiry, specs, related pieces. ISR like Health's product pages —
// served from cache, re-rendered at most every 5 minutes per slug; operator
// saves refresh instantly via revalidatePath from the panel.
import { publicDocumentItems } from "@/lib/productDocuments";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LOCALES } from "@/lib/i18n";
import {
  getBeautyProductBySlug, getBeautyProductVariants, getBeautyProductDocuments, getRelatedBeautyProducts, getBeautyCategories, beautyImageUrl,
} from "@/lib/beauty/catalog";
import { getBeautyTranslations } from "@/components/beauty/i18n";
import { isOnRequest } from "@/lib/price";
import { SITE_URL, safeJsonLd } from "@/lib/seo";
import BeautyProductView, { COPY } from "@/components/beauty/BeautyProductView";
import Icon from "@/components/shared/Icon";
import { variantsJsonLd } from "@/lib/operator/variants";
import { beautyRobots } from "@/lib/beauty/seo";

export const revalidate = 300;

// Empty on purpose: no DB dependency at build time. Each slug renders on its
// first request and is then cached/revalidated (dynamicParams default).
export async function generateStaticParams() {
  return [];
}


export async function generateMetadata(props) {
  const params = await props.params;
  const { lang, slug } = params;
  if (!LOCALES.includes(lang)) return {};
  const t = getBeautyTranslations(lang);
  const p = await getBeautyProductBySlug(slug);
  if (!p) return { title: t.common.brand };
  const name = p[`name_${lang}`] || p.name_en;
  const desc = (p[`description_${lang}`] || p.description_en || "").slice(0, 160);
  const og = p.image_url ? beautyImageUrl(p.image_url) : undefined;
  return {
    title: `${name}${p.brand ? ` — ${p.brand}` : ""} — ${t.common.brand}`,
    description: desc,
    robots: await beautyRobots(lang),
    openGraph: { title: name, description: desc, type: "website", ...(og ? { images: [{ url: og }] } : {}) },
  };
}


export default async function BeautyProductPage(props) {
  const params = await props.params;
  const { lang, slug } = params;
  if (!LOCALES.includes(lang)) notFound();
  const t = getBeautyTranslations(lang);
  const c = COPY[lang] || COPY.en;

  // throwOnError: a DB blip during ISR revalidation keeps the stale page
  // alive instead of caching a "not found" for a real product.
  const product = await getBeautyProductBySlug(slug, { throwOnError: true });
  if (!product) {
    return (
      <div className="container-x py-20 text-center">
        <Icon name="sparkles" size={48} className="text-ink-faint mx-auto mb-4" strokeWidth={1.2} />
        <p className="text-ink-muted">{c.back}</p>
        <Link href={`/beauty/${lang}/catalog`} className="btn-primary size-md mt-6 inline-flex">{c.back}</Link>
      </div>
    );
  }

  const [related, cats, variants, docRows] = await Promise.all([
    getRelatedBeautyProducts(product, 4),
    getBeautyCategories(),
    getBeautyProductVariants(product.id),       // [] for an ordinary product and before migration 44
    getBeautyProductDocuments(product.id),      // published, still valid documents; [] before migration 48
  ]);
  const documents = publicDocumentItems(docRows, lang, beautyImageUrl);
  const name = product[`name_${lang}`] || product.name_en || product.name_ru;
  const desc = product[`description_${lang}`] || product.description_en;
  const onRequest = isOnRequest(product);
  const pageUrl = `${SITE_URL}/beauty/${lang}/catalog/${product.slug || product.id}`;
  const images = [product.image_url, ...(Array.isArray(product.gallery_urls) ? product.gallery_urls : [])]
    .filter(Boolean).map((x) => beautyImageUrl(x));

  const productLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    ...(product.sku ? { sku: product.sku } : {}),
    ...(product.brand ? { brand: { "@type": "Brand", name: product.brand } } : {}),
    ...(desc ? { description: String(desc).slice(0, 500) } : {}),
    ...(images.length ? { image: images } : {}),
    ...(!onRequest ? {
      offers: {
        "@type": "Offer", price: Number(product.price).toFixed(2), priceCurrency: "USD",
        availability: product.in_stock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
        url: pageUrl,
      },
    } : {}),
  };
  const jsonLd = safeJsonLd(variantsJsonLd({ base: productLd, variants, name, url: pageUrl }) || productLd);

  return <BeautyProductView product={product} variants={variants} documents={documents} related={related} cats={cats} lang={lang} jsonLd={jsonLd} />;
}
