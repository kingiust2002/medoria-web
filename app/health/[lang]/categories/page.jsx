import Link from "next/link";
import { getCategories, getProducts } from "@/lib/supabase";
import { getTranslations } from "@/lib/i18n";
import {
  buildHealthCategoryTree,
  healthCategoryDescription,
  healthCategoryName,
  rollupHealthCategoryCounts,
} from "@/lib/health/categories";
import Icon from "@/components/shared/Icon";
import TiltCard from "@/components/shared/TiltCard";
import Breadcrumb from "@/components/shared/Breadcrumb";
import PageHeaderVisual from "@/components/shared/PageHeaderVisual";
import SpotlightCard from "@/components/shared/SpotlightCard";
import SplitText from "@/components/shared/SplitText";

export const dynamic = "force-dynamic";

const FALLBACK_DESCRIPTION = {
  fa: "گروه‌های کالایی این بخش را بررسی کنید و محصول موردنظر را برای استعلام عمده انتخاب کنید.",
  tg: "Гурӯҳҳои молии ин бахшро бинед ва маҳсулоти лозимиро барои дархости яклухт интихоб кунед.",
  ru: "Просмотрите товарные группы раздела и выберите позиции для оптового запроса.",
  en: "Browse the product groups in this section and select items for a wholesale inquiry.",
};

function countLabel(count, lang) {
  if (!count) return lang === "fa" ? "به‌زودی" : lang === "tg" ? "ба зудӣ" : lang === "ru" ? "скоро" : "coming soon";
  const noun = { fa: "محصول", tg: "мол", ru: count === 1 ? "товар" : "товаров", en: count === 1 ? "product" : "products" };
  return `${count} ${noun[lang] || noun.en}`;
}

function subcategoryHeading(lang) {
  return lang === "fa" ? "زیرگروه‌های این بخش" : lang === "tg" ? "Зергурӯҳҳои ин бахш" : lang === "ru" ? "Подкатегории раздела" : "Subcategories";
}

function moreLabel(count, lang) {
  return lang === "fa" ? `${count} زیرگروه دیگر` : lang === "tg" ? `${count} зергурӯҳи дигар` : lang === "ru" ? `Ещё ${count}` : `${count} more`;
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

  return (
    <div className="bg-canvas-soft min-h-screen">
      <div className="bg-canvas-soft border-b border-line relative overflow-hidden">
        <PageHeaderVisual name="categories-header" light={0.2} dark={0.3} lightFilter="saturate(1.4) contrast(1.25)" darkFilter="saturate(1.25) contrast(1.12) brightness(1.12)" tint={0.12} />
        <div className="blob w-[44vw] h-[44vw] -top-1/3 -end-[6%] animate-aurora" style={{ background: "radial-gradient(circle, rgba(139,47,247,0.14) 0%, transparent 70%)" }} />
        <div className="blob w-[34vw] h-[34vw] top-0 start-[10%] animate-aurora" style={{ background: "radial-gradient(circle, rgba(6,182,212,0.12) 0%, transparent 70%)", animationDelay: "4s" }} />
        <div className="container-x pt-12 md:pt-16 pb-16 md:pb-20 relative">
          <Breadcrumb lang={lang} className="mb-4" crumbs={[{ label: t.common.home, href: `/health/${lang}` }, { label: t.common.categories }]} />
          <div className="eyebrow mb-4"><span className="gradient-text">{t.home.catTag}</span></div>
          <h1 className="section-h-lg mb-3 leading-[1.2] pb-1"><SplitText text={t.categories.title} delay={0.1} /></h1>
          <p className="text-base text-ink-muted max-w-xl">{t.categories.subtitle}</p>
        </div>
      </div>

      <div className="container-x py-10 md:py-14">
        {tree.length === 0 ? (
          <div className="card p-10 text-center text-ink-muted">
            {lang === "fa" ? "هنوز دسته فعالی منتشر نشده است." : lang === "tg" ? "Ҳоло гурӯҳи фаъол нашр нашудааст." : lang === "ru" ? "Активные категории пока не опубликованы." : "No active categories have been published yet."}
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {tree.map((category) => {
              const hasChildren = Boolean(category.children?.length);
              const href = hasChildren ? `/health/${lang}/categories/${category.slug}` : `/health/${lang}/catalog?category=${category.slug}`;
              const visibleChildren = category.children?.slice(0, 6) || [];
              const remainingChildren = Math.max(0, (category.children?.length || 0) - visibleChildren.length);

              return (
                <TiltCard key={category.slug} className="h-full rounded-2xl" max={5}>
                  <SpotlightCard className="h-full rounded-2xl">
                    <article className="card card-hover overflow-hidden group h-full flex flex-col sm:flex-row">
                      <Link
                        href={href}
                        aria-label={healthCategoryName(category, lang)}
                        className="h-28 sm:h-auto sm:w-36 md:w-40 shrink-0 img-ph flex items-center justify-center text-brand-violet group-hover:bg-brand-gradient group-hover:text-white transition-colors"
                      >
                        <Icon name={category.icon || "layers"} size={56} strokeWidth={1.3} className="relative" />
                      </Link>

                      <div className="p-5 md:p-6 flex-1 flex flex-col min-w-0">
                        <Link href={href} className="block">
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <h2 className="font-display text-lg md:text-xl font-bold text-ink group-hover:text-brand-violet transition-colors">
                              {healthCategoryName(category, lang)}
                            </h2>
                            <span className="text-[11px] text-ink-faint shrink-0 pt-1">{countLabel(category.total_count, lang)}</span>
                          </div>
                          <p className="text-[13px] text-ink-muted leading-relaxed">
                            {healthCategoryDescription(category, lang) || FALLBACK_DESCRIPTION[lang] || FALLBACK_DESCRIPTION.en}
                          </p>
                        </Link>

                        {hasChildren && (
                          <div className="mt-5 pt-4 border-t border-line/80">
                            <div className="flex items-center justify-between gap-3 mb-3">
                              <span className="text-[11px] font-bold uppercase tracking-wide text-ink-faint">
                                {subcategoryHeading(lang)}
                              </span>
                              <span className="text-[10px] text-ink-faint">{category.children.length}</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {visibleChildren.map((child) => {
                                const childHasChildren = Boolean(child.children?.length);
                                const childHref = childHasChildren
                                  ? `/health/${lang}/categories/${child.slug}`
                                  : `/health/${lang}/catalog?category=${child.slug}`;
                                return (
                                  <Link
                                    key={child.slug}
                                    href={childHref}
                                    className="inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas-soft px-3 py-2 text-[11px] font-semibold text-ink-muted transition-all hover:border-brand-violet/40 hover:bg-brand-violet/[0.06] hover:text-brand-violet"
                                  >
                                    <Icon name={child.icon || "package"} size={12} strokeWidth={2} />
                                    <span>{healthCategoryName(child, lang)}</span>
                                  </Link>
                                );
                              })}
                              {remainingChildren > 0 && (
                                <Link
                                  href={href}
                                  className="inline-flex items-center rounded-full px-3 py-2 text-[11px] font-semibold text-brand-violet hover:underline"
                                >
                                  + {moreLabel(remainingChildren, lang)}
                                </Link>
                              )}
                            </div>
                          </div>
                        )}

                        <Link href={href} className="mt-5 inline-flex items-center gap-1 text-[12px] font-semibold text-brand-violet self-start">
                          {hasChildren ? (lang === "fa" ? "مشاهده همه زیرگروه‌ها" : lang === "tg" ? "Дидани ҳамаи зергурӯҳҳо" : lang === "ru" ? "Смотреть все подкатегории" : "View all subcategories") : t.categories.viewProducts}
                          <Icon name={lang === "fa" ? "arrowL" : "arrow"} size={12} />
                        </Link>
                      </div>
                    </article>
                  </SpotlightCard>
                </TiltCard>
              );
            })}
          </div>
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
