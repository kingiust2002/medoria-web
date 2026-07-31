import Link from "next/link";
import { getCategories, getProducts } from "@/lib/supabase";
import { getTranslations } from "@/lib/i18n";
import { buildAlternates, ogImage, robotsFor, safeJsonLd, SITE_URL } from "@/lib/seo";
import {
  buildHealthCategoryTree,
  healthCategoryName,
  rollupHealthCategoryCounts,
} from "@/lib/health/categories";
import Icon from "@/components/shared/Icon";
import Breadcrumb from "@/components/shared/Breadcrumb";
import PageHeaderVisual from "@/components/shared/PageHeaderVisual";
import SplitText from "@/components/shared/SplitText";
import CategoryTreeGrid from "@/components/health/CategoryTreeGrid";
import SeoCategoryDirectory from "@/components/health/SeoCategoryDirectory";

export const dynamic = "force-dynamic";

export async function generateMetadata(props) {
  const { lang } = await props.params;
  const t = getTranslations(lang);
  return {
    title: `${t.categories.title} — ${t.common.brand}`,
    description: t.categories.subtitle,
    alternates: buildAlternates(lang, "/categories"),
    robots: robotsFor(lang),
    openGraph: {
      title: `${t.categories.title} — ${t.common.brand}`,
      description: t.categories.subtitle,
      images: [{ url: ogImage(t.categories.title), width: 1200, height: 630, alt: t.categories.title }],
    },
  };
}

export default async function CategoriesPage(props) {
  const { lang } = await props.params;
  const t = getTranslations(lang);
  const [categories, products] = await Promise.all([getCategories(), getProducts()]);
  const tree = buildHealthCategoryTree(categories, { activeOnly: true });
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

  const itemList = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: t.categories.title,
    numberOfItems: tree.length,
    itemListElement: tree.map((node, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: healthCategoryName(node, lang),
      url: `${SITE_URL}/health/${lang}/categories/${node.slug}`,
    })),
  };

  return (
    <div className="bg-canvas-soft min-h-screen">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(itemList) }} />

      <div className="bg-canvas-soft border-b border-line relative overflow-hidden">
        <PageHeaderVisual name="categories-header" light={0.2} dark={0.3} lightFilter="saturate(1.4) contrast(1.25)" darkFilter="saturate(1.25) contrast(1.12) brightness(1.12)" tint={0.12} />
        <div className="blob w-[44vw] h-[44vw] -top-1/3 -end-[6%] animate-aurora" style={{ background: "radial-gradient(circle, rgba(139,47,247,0.14) 0%, transparent 70%)" }} />
        <div className="blob w-[34vw] h-[34vw] top-0 start-[10%] animate-aurora" style={{ background: "radial-gradient(circle, rgba(6,182,212,0.12) 0%, transparent 70%)", animationDelay: "4s" }} />
        <div className="container-x pt-12 md:pt-16 pb-16 md:pb-20 relative">
          <Breadcrumb lang={lang} className="mb-4" crumbs={[{ label: t.common.home, href: `/health/${lang}` }, { label: t.common.categories }]} />
          <div className="eyebrow mb-4"><span className="gradient-text">{t.home.catTag}</span></div>
          <h1 className="section-h-lg mb-3 leading-[1.2] pb-1"><SplitText text={t.categories.title} delay={0.1} /></h1>
          <p className="text-base text-ink-muted max-w-2xl">{t.categories.subtitle}</p>
        </div>
      </div>

      <div className="container-x py-10 md:py-14">
        {tree.length === 0 ? (
          <div className="card p-10 text-center text-ink-muted">
            {lang === "fa" ? "هنوز دسته فعالی منتشر نشده است." : lang === "tg" ? "Ҳоло гурӯҳи фаъол нашр нашудааст." : lang === "ru" ? "Активные категории пока не опубликованы." : "No active categories have been published yet."}
          </div>
        ) : (
          <>
            <CategoryTreeGrid
              lang={lang}
              items={tree}
              level={1}
              hrefFor={(node) => node.children?.length
                ? `/health/${lang}/categories/${node.slug}`
                : `/health/${lang}/catalog?category=${node.slug}`}
            />

            <div className="mt-8 md:mt-10">
              <SeoCategoryDirectory lang={lang} tree={tree} previewCount={6} />
            </div>
          </>
        )}

        <div className="mt-14 text-center">
          <p className="text-[14px] text-ink-muted mb-4">
            {lang === "fa" ? "محصول یا دسته موردنظر را پیدا نکردید؟" : lang === "tg" ? "Маҳсулот ё гурӯҳи лозимиро наёфтед?" : lang === "en" ? "Could not find the product or category you need?" : "Не нашли нужный товар или категорию?"}
          </p>
          <Link href={`/health/${lang}/contact`} className="btn-primary size-lg">{t.common.contactUs} <Icon name="arrow" size={15} /></Link>
        </div>
      </div>
    </div>
  );
}
