import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCategories, getProducts } from "@/lib/supabase";
import { getTranslations } from "@/lib/i18n";
import {
  buildHealthCategoryTree,
  findHealthCategory,
  getHealthCategoryPath,
  healthCategoryName,
  rollupHealthCategoryCounts,
} from "@/lib/health/categories";
import Breadcrumb from "@/components/shared/Breadcrumb";
import Icon from "@/components/shared/Icon";
import SpotlightCard from "@/components/shared/SpotlightCard";
import TiltCard from "@/components/shared/TiltCard";

export const dynamic = "force-dynamic";

function countLabel(count, lang) {
  if (!count) return lang === "fa" ? "به‌زودی" : lang === "tg" ? "ба зудӣ" : lang === "ru" ? "скоро" : "coming soon";
  const noun = { fa: "محصول", tg: "мол", ru: count === 1 ? "товар" : "товаров", en: count === 1 ? "product" : "products" };
  return `${count} ${noun[lang] || noun.en}`;
}

export default async function HealthCategoryPage(props) {
  const { lang, slug } = await props.params;
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
  const crumbs = [
    { label: t.common.home, href: `/health/${lang}` },
    { label: t.common.categories, href: `/health/${lang}/categories` },
    ...path.slice(0, -1).map((node) => ({ label: healthCategoryName(node, lang), href: `/health/${lang}/categories/${node.slug}` })),
    { label: healthCategoryName(category, lang) },
  ];

  return (
    <div className="bg-canvas-soft min-h-screen">
      <div className="border-b border-line bg-canvas-soft">
        <div className="container-x py-10 md:py-14">
          <Breadcrumb lang={lang} className="mb-4" crumbs={crumbs} />
          <div className="flex items-center gap-4">
            <span className="w-14 h-14 rounded-2xl bg-brand-violet/10 text-brand-violet grid place-items-center shrink-0">
              <Icon name={category.icon || "layers"} size={28} />
            </span>
            <div>
              <h1 className="font-display text-3xl md:text-4xl font-extrabold text-ink tracking-tight">{healthCategoryName(category, lang)}</h1>
              <p className="text-sm text-ink-muted mt-2">{lang === "fa" ? "زیردسته موردنظر را انتخاب کنید." : lang === "tg" ? "Зергурӯҳи лозимиро интихоб кунед." : lang === "ru" ? "Выберите нужную подкатегорию." : "Choose the relevant subcategory."}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="container-x py-10 md:py-14">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {category.children.map((child) => {
            const hasChildren = Boolean(child.children?.length);
            const href = hasChildren ? `/health/${lang}/categories/${child.slug}` : `/health/${lang}/catalog?category=${child.slug}`;
            return (
              <TiltCard key={child.slug} className="h-full rounded-2xl" max={5}>
                <SpotlightCard className="h-full rounded-2xl">
                  <Link href={href} className="card card-hover group h-full p-5 flex items-start gap-4">
                    <span className="w-12 h-12 rounded-xl bg-brand-violet/[0.08] text-brand-violet group-hover:bg-brand-gradient group-hover:text-white grid place-items-center shrink-0 transition-colors">
                      <Icon name={child.icon || "package"} size={23} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <h2 className="font-display font-bold text-ink group-hover:text-brand-violet transition-colors">{healthCategoryName(child, lang)}</h2>
                        <span className="text-[10px] text-ink-faint shrink-0">{countLabel(child.total_count, lang)}</span>
                      </div>
                      <span className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-violet">
                        {hasChildren ? (lang === "fa" ? "مشاهده زیرمجموعه‌ها" : lang === "tg" ? "Дидани зербахшҳо" : lang === "ru" ? "Смотреть разделы" : "View sections") : t.categories.viewProducts}
                        <Icon name={lang === "fa" ? "arrowL" : "arrow"} size={12} />
                      </span>
                    </div>
                  </Link>
                </SpotlightCard>
              </TiltCard>
            );
          })}
        </div>

        <div className="mt-10 flex flex-wrap gap-3">
          <Link href={`/health/${lang}/catalog?category=${category.slug}`} className="btn-primary size-md">{lang === "fa" ? "همه محصولات این بخش" : lang === "tg" ? "Ҳамаи маҳсулоти бахш" : lang === "ru" ? "Все товары раздела" : "All products in this section"}</Link>
          <Link href={`/health/${lang}/categories`} className="btn-ghost size-md">{lang === "fa" ? "همه دسته‌ها" : lang === "tg" ? "Ҳамаи гурӯҳҳо" : lang === "ru" ? "Все категории" : "All categories"}</Link>
        </div>
      </div>
    </div>
  );
}
