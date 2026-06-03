// components/shared/Breadcrumb.jsx
// Premium breadcrumb: a glass pill with chevron separators and a gradient
// current-page label. RTL-aware (chevron flips for Farsi). Used across all pages.
import { Fragment } from "react";
import Link from "next/link";
import Icon from "./Icon";

export default function Breadcrumb({ lang, crumbs = [], className = "" }) {
  if (!crumbs.length) return null;
  const sep = lang === "fa" ? "chevronLeft" : "chevronRight";
  return (
    <nav
      aria-label="Breadcrumb"
      className={`inline-flex max-w-full items-center gap-1.5 overflow-x-auto no-scrollbar rounded-full border border-line bg-surface/70 backdrop-blur px-3.5 py-1.5 text-[12.5px] shadow-soft ${className}`}
    >
      {crumbs.map((cr, i) => {
        const last = i === crumbs.length - 1;
        return (
          <Fragment key={i}>
            {i > 0 && <Icon name={sep} size={13} className="text-ink-faint shrink-0" />}
            {cr.href && !last ? (
              <Link
                href={cr.href}
                className="whitespace-nowrap font-medium text-ink-muted hover:text-brand-violet transition-colors"
              >
                {cr.label}
              </Link>
            ) : (
              <span
                aria-current={last ? "page" : undefined}
                className={`whitespace-nowrap font-semibold ${last ? "gradient-text truncate max-w-[42vw]" : "text-ink"}`}
              >
                {cr.label}
              </span>
            )}
          </Fragment>
        );
      })}
    </nav>
  );
}
