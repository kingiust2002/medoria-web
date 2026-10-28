"use client";
import Link from "next/link";
import { useT, usePanelLang } from "@/components/panel/PanelI18n";

// previous / next (and "page X of Y" when the total is known) for the warehouse tabs; every page is an address
export default function TabPager({ data, base, tab, total = null, pageCount = null }) {
  const t = useT();
  const { num } = usePanelLang();
  const href = (p) => `${base}?tab=${tab}&page=${p}${data.q ? `&q=${encodeURIComponent(data.q)}` : ""}${data.locationId ? `&location=${data.locationId}` : ""}${data.lowOnly ? "&low=1" : ""}`;
  const hasNext = pageCount != null ? data.page < pageCount : data.hasMore;
  if (data.page === 1 && !hasNext) return total != null ? <p className="mt-3 text-sm text-ink-muted tabular" data-testid="wh-range">{t("{total} مورد", { total: num(total) })}</p> : null;
  return (
    <nav aria-label={t("صفحه‌بندی")} className="mt-3 flex flex-wrap items-center justify-between gap-2" data-testid="wh-pager">
      {data.page > 1 ? <Link className="btn-ghost size-sm" rel="prev" href={href(data.page - 1)}>{t("قبلی")}</Link> : <span />}
      <span className="text-sm text-ink-muted tabular">{pageCount != null ? t("صفحه {page} از {count}", { page: num(data.page), count: num(pageCount) }) + ` · ${t("{total} مورد", { total: num(total) })}` : t("صفحه {page}", { page: num(data.page) })}</span>
      {hasNext ? <Link className="btn-ghost size-sm" rel="next" href={href(data.page + 1)}>{t("بعدی")}</Link> : <span />}
    </nav>
  );
}
