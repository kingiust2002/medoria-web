import Link from "next/link";
import Icon from "@/components/shared/Icon";
import HealthCategoryIcon, { resolveHealthCategoryIcons } from "@/components/health/HealthCategoryIcon";
import { flattenHealthCategoryTree, healthCategoryName } from "@/lib/health/categories";

function labels(lang, count) {
  if (lang === "fa") return { title: "دسترسی سریع دسته‌بندی‌ها", all: `نمایش فهرست کامل ${count} دسته` };
  if (lang === "tg") return { title: "Дастрасии зуд ба гурӯҳҳо", all: `Намоиши рӯйхати пурраи ${count} гурӯҳ` };
  if (lang === "ru") return { title: "Быстрый доступ к категориям", all: `Показать полный список: ${count}` };
  return { title: "Quick category access", all: `Show the complete list of ${count} categories` };
}

function hrefFor(node, lang) {
  return node.children?.length
    ? `/health/${lang}/categories/${node.slug}`
    : `/health/${lang}/catalog?category=${node.slug}`;
}

export default function SeoCategoryDirectory({ lang, tree = [], previewCount = 6 }) {
  const flat = flattenHealthCategoryTree(tree).map(({ node, depth }) => ({ node, depth }));
  const copy = labels(lang, flat.length);
  const preview = flat.slice(0, previewCount);
  const previewIcons = resolveHealthCategoryIcons(preview.map(({ node }) => node));

  if (!flat.length) return null;

  return (
    <nav aria-label={copy.title} className="card p-4 md:p-5">
      <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-ink-faint">
        <Icon name="layers" size={14} />
        {copy.title}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {preview.map(({ node }, index) => (
          <Link
            key={`preview-${node.slug}`}
            href={hrefFor(node, lang)}
            className="inline-flex items-center gap-1.5 rounded-full border border-line bg-canvas-soft px-3 py-2 text-[11px] font-semibold text-ink-muted transition-all hover:border-brand-violet/40 hover:bg-brand-violet/[0.06] hover:text-brand-violet"
          >
            <HealthCategoryIcon name={previewIcons[index]} size={12} strokeWidth={2} />
            {healthCategoryName(node, lang)}
          </Link>
        ))}
      </div>

      {flat.length > previewCount && (
        <details className="mt-3 group">
          <summary className="cursor-pointer select-none inline-flex items-center gap-1.5 text-[11px] font-semibold text-brand-violet hover:underline">
            {copy.all}
            <Icon name="chevronDown" size={13} className="transition-transform group-open:rotate-180" />
          </summary>
          <div className="mt-4 max-h-[28rem] overflow-auto rounded-xl border border-line bg-canvas-soft p-3 md:p-4">
            <div className="columns-1 sm:columns-2 lg:columns-3 gap-6">
              {flat.map(({ node, depth }) => (
                <Link
                  key={`all-${node.slug}`}
                  href={hrefFor(node, lang)}
                  className="mb-1.5 flex break-inside-avoid items-start gap-2 rounded-lg px-2 py-1.5 text-[11px] text-ink-muted hover:bg-brand-violet/[0.06] hover:text-brand-violet"
                  style={{ paddingInlineStart: `${8 + Math.min(depth, 2) * 12}px` }}
                >
                  <span className={`mt-1.5 rounded-full bg-brand-violet/55 shrink-0 ${depth === 0 ? "w-2 h-2" : "w-1.5 h-1.5"}`} />
                  <span>{healthCategoryName(node, lang)}</span>
                </Link>
              ))}
            </div>
          </div>
        </details>
      )}
    </nav>
  );
}
