"use client";
// The customer-request report of BOTH panels: numbers for the last 7 / 30 / 90 days and (with quotes.export) the CSV. The numbers
// are computed on the server from status / dates / assignee labels only; no customer text reaches this screen.
import Link from "next/link";
import { PageHeader, StatCard, SectionCard, Badge } from "@/components/operator/ui";
import AuditExportButton from "@/components/operator/AuditExportButton";
import { QUOTE_STATUS_FA, QUOTE_STATUS_TONE } from "@/lib/operator/constants";
import { useT } from "@/components/panel/PanelI18n";
import { useCan } from "@/components/panel/Capabilities";
import { REPORT_PERIODS } from "@/lib/operator/quoteReport";

export default function QuotesReport({ report, base, exportAction }) {
  const t = useT();
  const canExport = useCan("quotes.export");
  return (
    <>
      <PageHeader title={t("گزارش استعلام‌ها")} subtitle={t("آخرین {days} روز", { days: report.days })}>
        <Link href={base} className="btn-ghost size-md">{t("بازگشت به استعلام‌ها")}</Link>
      </PageHeader>
      <div role="tablist" className="flex flex-wrap gap-1.5 mb-4">
        {REPORT_PERIODS.map((d) => (
          <Link key={d} role="tab" aria-selected={report.days === d} href={`${base}/report?days=${d}`} data-testid={`report-days-${d}`}
            className={`btn-ghost size-sm ${report.days === d ? "!border-brand-violet/50 !text-brand-violet !bg-brand-violet/5" : ""}`}>{t("{days} روز", { days: d })}</Link>
        ))}
      </div>
      {report.unavailable && <p role="alert" className="mb-4 text-sm rounded-xl px-3 py-2.5 bg-warn/10 text-warn">{t("گزارش در دسترس نیست.")}</p>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5" data-testid="report-stats">
        <StatCard icon="quote" label={t("کل درخواست‌ها")} value={report.total} />
        <StatCard icon="clock" label={t("میانگین زمان پاسخ (ساعت)")} value={report.avgFirstResponseHours ?? "—"} tone="blue" />
        <StatCard icon="alertTriangle" label={t("بی‌پاسخ بیش از ۲۴ ساعت")} value={report.overdue} tone="warn" />
        <StatCard icon="check" label={t("پیگیری امروز / عقب‌افتاده")} value={`${report.followUpsToday} / ${report.followUpsOverdue}`} tone="ok" />
      </div>
      <div className="grid md:grid-cols-2 gap-4 min-w-0">
        <SectionCard title={t("بر اساس وضعیت")} icon="layers">
          <ul className="flex flex-col gap-2" data-testid="report-by-status">
            {Object.entries(report.byStatus).length === 0 && <li className="text-sm text-ink-muted">—</li>}
            {Object.entries(report.byStatus).map(([s, n]) => (
              <li key={s} className="flex items-center justify-between gap-3 min-w-0"><Badge tone={QUOTE_STATUS_TONE[s] || "neutral"}>{QUOTE_STATUS_FA[s] ? t(QUOTE_STATUS_FA[s]) : s}</Badge><b className="tabular">{n}</b></li>
            ))}
          </ul>
        </SectionCard>
        <SectionCard title={t("بر اساس مسئول")} icon="user">
          <ul className="flex flex-col gap-2" data-testid="report-by-assignee">
            {report.byAssignee.length === 0 && <li className="text-sm text-ink-muted">—</li>}
            {report.byAssignee.map((a) => (
              <li key={a.name || "__none"} className="flex items-center justify-between gap-3 min-w-0"><span className="min-w-0 break-words text-sm text-ink-soft">{a.name || t("بدون مسئول")}</span><b className="tabular">{a.count}</b></li>
            ))}
          </ul>
        </SectionCard>
      </div>
      {canExport && (
        <div className="mt-5">
          <AuditExportButton filters={report.days} exportAction={exportAction} testId="quotes-export" />
          <p className="text-xs text-ink-faint mt-2">{t("فایل CSV شامل اطلاعات تماس مشتریان است؛ ثبت دانلود در تاریخچه می‌ماند.")}</p>
        </div>
      )}
    </>
  );
}
