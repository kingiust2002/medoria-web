import Link from "next/link";
import Icon from "@/components/shared/Icon";
import TiltCard from "@/components/shared/TiltCard";
import SpotlightCard from "@/components/shared/SpotlightCard";
import { healthCategoryDescription, healthCategoryName } from "@/lib/health/categories";

function countLabel(count, lang) {
  if (!count) {
    if (lang === "fa") return "به‌زودی";
    if (lang === "tg") return "ба зудӣ";
    if (lang === "ru") return "скоро";
    return "coming soon";
  }

  const noun = {
    fa: "محصول",
    tg: "мол",
    ru: count === 1 ? "товар" : "товаров",
    en: count === 1 ? "product" : "products",
  };
  return `${count} ${noun[lang] || noun.en}`;
}

function actionLabel(hasChildren, childCount, lang) {
  if (!hasChildren) {
    if (lang === "fa") return "مشاهده محصولات";
    if (lang === "tg") return "Дидани маҳсулот";
    if (lang === "ru") return "Смотреть товары";
    return "Explore products";
  }

  if (lang === "fa") return `مشاهده ${childCount} زیرگروه`;
  if (lang === "tg") return `Дидани ${childCount} зергурӯҳ`;
  if (lang === "ru") return `Смотреть подкатегории: ${childCount}`;
  return `Explore ${childCount} subcategories`;
}

function fallbackDescription(hasChildren, lang) {
  if (hasChildren) {
    if (lang === "fa") return "گروه‌های تخصصی این بخش را مرحله‌به‌مرحله بررسی کنید و سپس وارد محصولات موردنظر شوید.";
    if (lang === "tg") return "Гурӯҳҳои махсуси ин бахшро қадам ба қадам дида, баъд ба маҳсулоти лозим гузаред.";
    if (lang === "ru") return "Перейдите к специализированным группам этого раздела, а затем выберите нужные товары.";
    return "Browse the specialist groups in this section, then continue to the relevant products.";
  }

  if (lang === "fa") return "محصولات این دسته را بررسی کنید و مشخصات و شرایط تأمین عمده را ببینید.";
  if (lang === "tg") return "Маҳсулоти ин гурӯҳ ва шартҳои таъминоти яклухтро баррасӣ кунед.";
  if (lang === "ru") return "Просмотрите товары этой категории, характеристики и условия оптовой поставки.";
  return "Review products in this category, including specifications and wholesale availability.";
}

export default function CategoryTreeGrid({ lang, items = [], hrefFor }) {
  return (
    <div role="list" className="grid grid-cols-1 md:grid-cols-2 gap-5">
      {items.map((node) => {
        const hasChildren = Boolean(node.children?.length);
        const childCount = node.children?.length || 0;
        const name = healthCategoryName(node, lang);
        const description = healthCategoryDescription(node, lang) || fallbackDescription(hasChildren, lang);

        return (
          <div role="listitem" key={node.id || node.slug} className="h-full">
            <TiltCard className="h-full rounded-2xl" max={5}>
              <SpotlightCard className="h-full rounded-2xl">
                <Link
                  href={hrefFor(node)}
                  aria-label={`${name} — ${actionLabel(hasChildren, childCount, lang)}`}
                  className="card card-hover overflow-hidden group flex h-full"
                >
                  <div className="w-32 md:w-40 shrink-0 img-ph flex items-center justify-center text-brand-violet group-hover:bg-brand-gradient group-hover:text-white transition-colors">
                    <Icon name={node.icon || (hasChildren ? "layers" : "package")} size={56} strokeWidth={1.3} className="relative" />
                  </div>

                  <div className="p-5 md:p-6 flex-1 flex flex-col min-w-0">
                    <div className="flex items-baseline justify-between gap-3 mb-2">
                      <h2 className="font-display text-lg md:text-xl font-bold text-ink group-hover:text-brand-violet transition-colors leading-tight">
                        {name}
                      </h2>
                      <span className="text-[11px] text-ink-faint shrink-0">
                        {countLabel(node.total_count, lang)}
                      </span>
                    </div>

                    <p className="text-[13px] text-ink-muted leading-relaxed mb-4 flex-1">
                      {description}
                    </p>

                    <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-violet">
                      {actionLabel(hasChildren, childCount, lang)}
                      <Icon name={lang === "fa" ? "arrowL" : "arrow"} size={12} />
                    </span>
                  </div>
                </Link>
              </SpotlightCard>
            </TiltCard>
          </div>
        );
      })}
    </div>
  );
}
