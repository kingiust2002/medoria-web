"use client";
// The pager under (and the counter above) a server-paged list: "26–50 of 1,234", previous / next, the page numbers around the current page, and the
// page size. Plain links, so every page is an address. Works at 320 px: the numbers hide on a phone, previous / next and "page X of Y" stay.
import Link from "next/link";
import { pageWindow, PAGE_SIZES } from "@/lib/operator/listQuery";
import { useT, usePanelLang } from "@/components/panel/PanelI18n";

export default function ListPager({ data, href, onSize }) {
  const t = useT();
  const { num: number } = usePanelLang();
  const { page, pageCount, total, size } = data;
  const from = total === 0 ? 0 : (page - 1) * size + 1, to = Math.min(total, page * size);
  const cls = "inline-flex items-center justify-center min-w-9 h-9 px-2 rounded-lg border border-line text-sm";
  const on = "border-brand-violet/60 text-brand-violet bg-brand-violet/5 font-semibold";
  return (
    <nav aria-label={t("صفحه‌بندی")} data-testid="list-pager" className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 justify-between">
      <p className="text-sm text-ink-muted tabular" data-testid="list-range">{t("نمایش {from}–{to} از {total}", { from: number(from), to: number(to), total: number(total) })}</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {page > 1 ? <Link href={href({ page: page - 1 }, false)} rel="prev" className={`${cls} hover:border-brand-violet/40`}>{t("قبلی")}</Link> : <span className={`${cls} opacity-40`} aria-disabled="true">{t("قبلی")}</span>}
        <span className="hidden sm:flex items-center gap-1.5">
          {pageWindow(page, pageCount).map((p, i) => p === "gap"
            ? <span key={`g${i}`} className="px-1 text-ink-faint" aria-hidden="true">…</span>
            : <Link key={p} href={href({ page: p }, false)} aria-current={p === page ? "page" : undefined} className={`${cls} ${p === page ? on : "hover:border-brand-violet/40"} tabular`}>{number(p)}</Link>)}
        </span>
        <span className="sm:hidden text-sm text-ink-muted tabular px-1">{t("صفحه {page} از {count}", { page: number(page), count: number(pageCount) })}</span>
        {page < pageCount ? <Link href={href({ page: page + 1 }, false)} rel="next" className={`${cls} hover:border-brand-violet/40`}>{t("بعدی")}</Link> : <span className={`${cls} opacity-40`} aria-disabled="true">{t("بعدی")}</span>}
      </div>
      {onSize && (
        <label className="flex items-center gap-2 text-sm text-ink-muted">{t("تعداد در صفحه")}
          <select value={size} onChange={(e) => onSize(Number(e.target.value))} className="input !h-9 w-auto" data-testid="list-size">
            {PAGE_SIZES.map((n) => <option key={n} value={n}>{number(n)}</option>)}
          </select>
        </label>
      )}
    </nav>
  );
}
