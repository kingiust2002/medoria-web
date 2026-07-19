// app/beauty/[lang]/catalog/[slug]/page.jsx — Beauty product page. Server-first
// and editorial: gallery, brand line, serif name, price-or-request, WhatsApp/
// Telegram inquiry, specs, related pieces. ISR like Health's product pages —
// served from cache, re-rendered at most every 5 minutes per slug; operator
// saves refresh instantly via revalidatePath from the panel.
import Link from "next/link";
import { notFound } from "next/navigation";
import { LOCALES } from "@/lib/i18n";
import {
  getBeautyProductBySlug, getRelatedBeautyProducts, getBeautyCategories, beautyImageUrl,
} from "@/lib/beauty/catalog";
import { getBeautyTranslations } from "@/components/beauty/i18n";
import { waLink, tgLink, productInquiryMessage } from "@/lib/whatsapp";
import { isOnRequest, formatPrice } from "@/lib/price";
import { SITE_URL, safeJsonLd } from "@/lib/seo";
import Icon from "@/components/shared/Icon";
import Breadcrumb from "@/components/shared/Breadcrumb";
import BeautyProductCard from "@/components/beauty/catalog/BeautyProductCard";
import BeautyGallery from "./BeautyGallery";
import BeautyQuoteButton from "@/components/beauty/BeautyQuoteButton";
import BeautyViewTracker from "./BeautyViewTracker";

export const revalidate = 300;

// Empty on purpose: no DB dependency at build time. Each slug renders on its
// first request and is then cached/revalidated (dynamicParams default).
export async function generateStaticParams() {
  return [];
}

const COPY = {
  tg: { sku: "Код (SKU)", brand: "Бренд", category: "Самт", minOrder: "Ҳадди ақалли фармоиш", inStock: "Дар анбор ҳаст", outStock: "Дар анбор нест", specs: "Хусусиятҳо", related: "Аз ҳамин самт", back: "Ба коллексия", requestPrice: "Нархро пурсед", requestQuote: "Дархости нарх", ask: "Дархост тавассути WhatsApp", askTg: "Дархост тавассути Telegram" },
  ru: { sku: "Код (SKU)", brand: "Бренд", category: "Направление", minOrder: "Мин. заказ", inStock: "В наличии", outStock: "Нет в наличии", specs: "Характеристики", related: "Из этого направления", back: "В коллекцию", requestPrice: "Запросить цену", requestQuote: "Запросить цену", ask: "Запрос в WhatsApp", askTg: "Запрос в Telegram" },
  en: { sku: "SKU", brand: "Brand", category: "Category", minOrder: "Min. order", inStock: "In stock", outStock: "Out of stock", specs: "Details", related: "From this world", back: "Back to collection", requestPrice: "Request price", requestQuote: "Request a quotation", ask: "Inquire on WhatsApp", askTg: "Inquire on Telegram" },
  fa: { sku: "کد (SKU)", brand: "برند", category: "دسته", minOrder: "حداقل سفارش", inStock: "موجود", outStock: "ناموجود", specs: "مشخصات", related: "از همین دنیا", back: "بازگشت به کالکشن", requestPrice: "استعلام قیمت", requestQuote: "درخواست استعلام قیمت", ask: "استعلام در واتساپ", askTg: "استعلام در تلگرام" },
};

export async function generateMetadata({ params }) {
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
    robots: lang === "fa" ? { index: false, follow: true } : undefined,
    openGraph: { title: name, description: desc, type: "website", ...(og ? { images: [{ url: og }] } : {}) },
  };
}

function Meta({ label, value }) {
  if (value == null || value === "" || value === "—") return null;
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-line last:border-0 text-[13px]">
      <span className="text-ink-faint">{label}</span>
      <span className="text-ink font-medium text-end">{value}</span>
    </div>
  );
}

export default async function BeautyProductPage({ params }) {
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

  const [related, cats] = await Promise.all([
    getRelatedBeautyProducts(product, 4),
    getBeautyCategories(),
  ]);
  const cat = cats.find((x) => x.id === product.category_id) || null;
  const catLabel = cat ? (cat[`name_${lang}`] || cat.name_en || cat.slug) : null;

  const name = product[`name_${lang}`] || product.name_en || product.name_ru;
  const desc = product[`description_${lang}`] || product.description_en;
  const onRequest = isOnRequest(product);
  const pageUrl = `${SITE_URL}/beauty/${lang}/catalog/${product.slug || product.id}`;
  const inquiry = productInquiryMessage(product, lang, { url: pageUrl });
  const specs = product.specs && typeof product.specs === "object" && !Array.isArray(product.specs) ? product.specs : null;
  const images = [product.image_url, ...(Array.isArray(product.gallery_urls) ? product.gallery_urls : [])]
    .filter(Boolean).map((x) => beautyImageUrl(x));

  const jsonLd = safeJsonLd({
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
  });

  return (
    <div className="bg-canvas-soft min-h-screen">
      <BeautyViewTracker id={product.id} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />

      <div className="container-x pt-8 md:pt-10">
        <Breadcrumb lang={lang} className="mb-6" crumbs={[
          { label: t.nav.home, href: `/beauty/${lang}` },
          { label: t.nav.collections, href: `/beauty/${lang}/catalog` },
          ...(cat ? [{ label: catLabel, href: `/beauty/${lang}/catalog?cat=${cat.slug}` }] : []),
          { label: name },
        ]} />
      </div>

      <div className="container-x pb-12 md:pb-16">
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-start">
          {/* Gallery */}
          <BeautyGallery images={images} alt={name} badge={product.badge} />

          {/* Info */}
          <div>
            {product.brand && (
              <Link href={`/beauty/${lang}/catalog?brand=${encodeURIComponent(product.brand)}`}
                className="inline-block text-[11px] font-semibold tracking-[0.22em] uppercase text-[color:var(--v-accent)] mb-2" dir="ltr">
                {product.brand}
              </Link>
            )}
            <h1 className="bv-display text-3xl md:text-4xl text-ink mb-3">{name}</h1>

            <div className="flex flex-wrap items-center gap-2 mb-5">
              {catLabel && (
                <Link href={`/beauty/${lang}/catalog?cat=${cat.slug}`} className="tag bg-line-soft text-ink-muted hover:text-ink transition-colors">
                  {catLabel}
                </Link>
              )}
              <span className={`tag ${product.in_stock ? "bg-ok/10 text-ok" : "bg-line-soft text-ink-faint"}`}>
                {product.in_stock ? c.inStock : c.outStock}
              </span>
            </div>

            {/* Price + CTAs */}
            <div className="card p-5 mb-6">
              <div className="flex items-end justify-between gap-4 mb-4">
                <div>
                  <div className={`font-bold ${onRequest ? "text-[color:var(--v-accent)] text-xl" : "text-ink text-3xl"}`}>
                    {onRequest ? c.requestPrice : formatPrice(product.price)}
                  </div>
                  {!onRequest && product.unit && <div className="text-[12px] text-ink-faint mt-1">/ {product.unit}</div>}
                </div>
                {product.min_order_qty > 1 && (
                  <div className="text-[12px] text-ink-muted text-end">{c.minOrder}: <b className="tabular">{product.min_order_qty}</b></div>
                )}
              </div>
              <div className="flex flex-col sm:flex-row gap-2.5">
                <a href={waLink(inquiry)} target="_blank" rel="noopener noreferrer" className="btn-wa size-lg flex-1">
                  <Icon name="chat" size={17} /> {c.ask}
                </a>
                <a href={tgLink(inquiry)} target="_blank" rel="noopener noreferrer" className="btn-tg size-lg flex-1">
                  <Icon name="send" size={17} /> {c.askTg}
                </a>
              </div>
              <div className="mt-2.5">
                <BeautyQuoteButton product={product} lang={lang} label={c.requestQuote} />
              </div>
            </div>

            {desc && <p className="text-[14px] md:text-[15px] text-ink-soft leading-relaxed mb-6 whitespace-pre-line">{desc}</p>}

            {/* Meta + specs */}
            <div className="card-flat p-5">
              <Meta label={c.sku} value={product.sku} />
              <Meta label={c.brand} value={product.brand} />
              <Meta label={c.category} value={catLabel} />
              {specs && Object.entries(specs).map(([k, v]) => <Meta key={k} label={k} value={String(v ?? "")} />)}
            </div>
          </div>
        </div>

        {/* Related */}
        {related.length > 0 && (
          <div className="mt-14 md:mt-20">
            <h2 className="section-h mb-6">{c.related}</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-5">
              {related.map((p) => (
                <BeautyProductCard key={p.id} product={p} lang={lang} requestLabel={c.requestPrice} />
              ))}
            </div>
          </div>
        )}

        <div className="mt-12">
          <Link href={`/beauty/${lang}/catalog`} className="btn-ghost size-md">
            <Icon name={lang === "fa" ? "arrow" : "arrowL"} size={15} /> {c.back}
          </Link>
        </div>
      </div>
    </div>
  );
}
