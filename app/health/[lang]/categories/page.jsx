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
import Breadcrumb from "@/components/shared/Breadcrumb";
import PageHeaderVisual from "@/components/shared/PageHeaderVisual";
import SplitText from "@/components/shared/SplitText";

export const dynamic = "force-dynamic";

const FALLBACK_DESCRIPTION = {
  fa: "گروه‌های کالایی این بخش را بررسی کنید و محصول موردنظر را برای استعلام عمده انتخاب کنید.",
  tg: "Гурӯҳҳои молии ин бахшро бинед ва маҳсулоти лозимиро барои дархости яклухт интихоб кунед.",
  ru: "Просмотрите товарные группы раздела и выберите позиции для оптового запроса.",
  en: "Browse the product groups in this section and select items for a wholesale inquiry.",
};

function countLabel(count, lang) {
  if (!count) return lang === "fa" ? "بدون محصول" : lang === "tg" ? "бе маҳсулот" : lang === "ru" ? "нет товаров" : "no products";
  const noun = { fa: "محصول", tg: "мол", ru: count === 1 ? "товар" : "товаров", en: count === 1 ? "product" : "products" };
  return `${count} ${noun[lang] || noun.en}`;
}

function allProductsLabel(lang) {
  return lang === "fa" ? "همه محصولات" : lang === "tg" ? "Ҳамаи маҳсулот" : lang === "ru" ? "Все товары" : "All products";
}

function groupsLabel(lang) {
  return lang === "fa" ? "گروه‌ها و دسته‌های محصول" : lang === "tg" ? "Гурӯҳҳо ва категорияҳои маҳсулот" : lang === "ru" ? "Группы и категории товаров" : "Product groups and categories";
}

function quickAccessLabel(lang) {
  return lang === "fa" ? "دسترسی سریع" : lang === "tg" ? "Дастрасии зуд" : lang === "ru" ? "Быстрый переход" : "Quick access";
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
            <nav aria-label={quickAccessLabel(lang)} className="card p-4 md:p-5 mb-7 md:mb-9">
              <div className="flex items-center gap-2 mb-3 text-[11px] font-bold uppercase tracking-wide text-ink-faint">
                <Icon name="layers" size={14} />
                {quickAccessLabel(lang)}
              </div>
              <div className="flex flex-wrap gap-2">
                {tree.map((department) => (
                  <a
                    key={department.slug}
                    href={`#${department.slug}`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas-soft px-3 py-2 text-[11px] font-semibold text-ink-muted transition-all hover:border-brand-violet/40 hover:bg-brand-violet/[0.06] hover:text-brand-violet"
                  >
                    <Icon name={department.icon || "layers"} size={12} strokeWidth={2} />
                    {healthCategoryName(department, lang)}
                  </a>
                ))}
              </div>
            </nav>

            <div className="space-y-6 md:space-y-8">
              {tree.map((department) => (
                <section
                  key={department.slug}
                  id={department.slug}
                  className="card overflow-hidden scroll-mt-24"
                >
                  <div className="p-5 md:p-7 border-b border-line bg-canvas-soft/70">
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                      <div className="flex items-start gap-4 min-w-0">
                        <span className="w-13 h-13 md:w-14 md:h-14 rounded-2xl bg-brand-violet/[0.09] text-brand-violet grid place-items-center shrink-0">
                          <Icon name={department.icon || "layers"} size={27} strokeWidth={1.5} />
                        </span>
                        <div className="min-w-0">
                          <h2 className="font-display text-xl md:text-2xl font-extrabold text-ink leading-tight">
                            {healthCategoryName(department, lang)}
                          </h2>
                          <p className="mt-2 text-[13px] text-ink-muted leading-relaxed max-w-3xl">
                            {healthCategoryDescription(department, lang) || FALLBACK_DESCRIPTION[lang] || FALLBACK_DESCRIPTION.en}
                          </p>
                          <div className="mt-2 text-[11px] text-ink-faint">
                            {(department.children || []).length} {groupsLabel(lang)} · {countLabel(department.total_count, lang)}
                          </div>
                        </div>
                      </div>

                      <Link
                        href={`/health/${lang}/catalog?category=${department.slug}`}
                        className="btn-ghost size-sm shrink-0"
                      >
                        {allProductsLabel(lang)}
                        <Icon name={lang === "fa" ? "arrowL" : "arrow"} size={13} />
                      </Link>
                    </div>
                  </div>

                  <div className="p-4 md:p-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {(department.children || []).map((group) => (
                      <article key={group.slug} id={group.slug} className="rounded-2xl border border-line bg-canvas p-4 md:p-5 scroll-mt-24">
                        <div className="flex items-start justify-between gap-3">
                          <Link
                            href={`/health/${lang}/catalog?category=${group.slug}`}
                            className="group/link min-w-0 flex items-start gap-3"
                          >
                            <span className="w-10 h-10 rounded-xl bg-brand-violet/[0.07] text-brand-violet grid place-items-center shrink-0 group-hover/link:bg-brand-gradient group-hover/link:text-white transition-colors">
                              <Icon name={group.icon || "package"} size={19} strokeWidth={1.7} />
                            </span>
                            <span className="min-w-0">
                              <span className="block font-display font-bold text-[15px] text-ink leading-snug group-hover/link:text-brand-violet transition-colors">
                                {healthCategoryName(group, lang)}
                              </span>
                              <span className="block mt-1 text-[10px] text-ink-faint">{countLabel(group.total_count, lang)}</span>
                            </span>
                          </Link>
                          <Link
                            href={`/health/${lang}/catalog?category=${group.slug}`}
                            aria-label={`${allProductsLabel(lang)} — ${healthCategoryName(group, lang)}`}
                            className="w-8 h-8 rounded-lg border border-line text-ink-faint hover:text-brand-violet hover:border-brand-violet/30 grid place-items-center shrink-0 transition-colors"
                          >
                            <Icon name={lang === "fa" ? "arrowL" : "arrow"} size={13} />
                          </Link>
                        </div>

                        {group.children?.length ? (
                          <div className="mt-4 pt-4 border-t border-line/80 flex flex-wrap gap-2">
                            {group.children.map((leaf) => (
                              <Link
                                key={leaf.slug}
                                href={`/health/${lang}/catalog?category=${leaf.slug}`}
                                className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-canvas-soft px-3 py-2 text-[11px] font-medium text-ink-muted transition-all hover:border-brand-violet/40 hover:bg-brand-violet/[0.06] hover:text-brand-violet"
                              >
                                <span className="w-1.5 h-1.5 rounded-full bg-brand-violet/55 shrink-0" />
                                <span>{healthCategoryName(leaf, lang)}</span>
                                {leaf.total_count > 0 && <span className="text-[9px] text-ink-faint">{leaf.total_count}</span>}
                              </Link>
                            ))}
                          </div>
                        ) : (
                          <Link
                            href={`/health/${lang}/catalog?category=${group.slug}`}
                            className="mt-4 pt-4 border-t border-line/80 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-violet"
                          >
                            {allProductsLabel(lang)}
                            <Icon name={lang === "fa" ? "arrowL" : "arrow"} size={11} />
                          </Link>
                        )}
                      </article>
                    ))}
                  </div>
                </section>
              ))}
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
