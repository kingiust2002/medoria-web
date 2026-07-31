import Link from "next/link";
import Icon from "@/components/shared/Icon";
import { Stagger, StaggerItem } from "@/components/shared/Reveal";
import { healthCategoryName } from "@/lib/health/categories";

function countLabel(count, lang) {
  if (!count) return lang === "fa" ? "بدون محصول" : lang === "tg" ? "бе маҳсулот" : lang === "ru" ? "нет товаров" : "no products";
  const noun = {
    fa: "محصول",
    tg: "мол",
    ru: count === 1 ? "товар" : "товаров",
    en: count === 1 ? "product" : "products",
  };
  return `${count} ${noun[lang] || noun.en}`;
}

function childLabel(count, lang) {
  if (lang === "fa") return `${count} زیرگروه`;
  if (lang === "tg") return `${count} зергурӯҳ`;
  if (lang === "ru") return `${count} подкатегорий`;
  return `${count} subcategories`;
}

const GRADIENTS = [
  "linear-gradient(145deg, #7c3aed 0%, #4f46e5 52%, #0ea5e9 100%)",
  "linear-gradient(145deg, #0891b2 0%, #2563eb 52%, #6d28d9 100%)",
  "linear-gradient(145deg, #9333ea 0%, #db2777 52%, #f97316 100%)",
  "linear-gradient(145deg, #0f766e 0%, #0ea5e9 50%, #4f46e5 100%)",
  "linear-gradient(145deg, #4338ca 0%, #7c3aed 48%, #c026d3 100%)",
  "linear-gradient(145deg, #0369a1 0%, #0284c7 45%, #7c3aed 100%)",
];

export default function CategoryTreeGrid({ lang, items = [], level = 1, hrefFor }) {
  const isRoot = level === 1;

  return (
    <Stagger className={`grid gap-4 sm:gap-5 ${isRoot ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-2 lg:grid-cols-3"}`}>
      {items.map((node, index) => {
        const hasChildren = Boolean(node.children?.length);
        const href = hrefFor(node);
        const gradient = GRADIENTS[index % GRADIENTS.length];

        return (
          <StaggerItem key={node.id || node.slug}>
            <Link
              href={href}
              className="group block relative overflow-hidden rounded-2xl border border-line focus-ring shadow-sm hover:shadow-lg transition-shadow"
            >
              <div className={`relative ${isRoot ? "aspect-[16/9]" : "aspect-[4/3]"}`} style={{ background: gradient }}>
                <div className="absolute inset-0 opacity-30" style={{ background: "radial-gradient(circle at 20% 15%, rgba(255,255,255,.55), transparent 35%), radial-gradient(circle at 85% 80%, rgba(255,255,255,.24), transparent 40%)" }} />
                <div className="absolute inset-0 grid place-items-center transition-transform duration-500 group-hover:scale-105">
                  <span className={`grid place-items-center rounded-3xl bg-white/15 backdrop-blur-sm text-white shadow-inner ${isRoot ? "w-24 h-24" : "w-18 h-18"}`}>
                    <Icon name={node.icon || "layers"} size={isRoot ? 46 : 34} strokeWidth={1.35} />
                  </span>
                </div>
                <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(15,23,42,.72) 0%, rgba(15,23,42,.14) 56%, transparent 78%)" }} />

                {isRoot && (
                  <span className="absolute top-4 start-4 inline-flex items-center justify-center min-w-8 h-8 px-2 rounded-full bg-white/20 backdrop-blur-sm text-white text-[11px] font-bold tracking-wide">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                )}

                <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5 flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className={`text-white font-bold drop-shadow leading-tight ${isRoot ? "text-xl sm:text-2xl font-display" : "text-[15px] sm:text-base"}`}>
                      {healthCategoryName(node, lang)}
                    </h2>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] sm:text-[11px] text-white/75">
                      {hasChildren && <span>{childLabel(node.children.length, lang)}</span>}
                      <span>{countLabel(node.total_count, lang)}</span>
                    </div>
                  </div>
                  <span className="shrink-0 grid place-items-center w-9 h-9 rounded-full bg-white/20 backdrop-blur-sm text-white transition-colors group-hover:bg-white/30">
                    <Icon name={hasChildren ? "chevronLeft" : "arrowUpRight"} size={16} className={hasChildren ? "rtl:rotate-180" : ""} />
                  </span>
                </div>
              </div>
            </Link>
          </StaggerItem>
        );
      })}
    </Stagger>
  );
}
