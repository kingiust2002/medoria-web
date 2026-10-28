// app/beauty/operator/(panel)/activity/page.jsx — the activity log of the Beauty panel only: what was done, by which person, with what
// result. Restricted to audit.view; the CSV needs audit.export. Never customer data.
import Link from "next/link";
import { getAdminClient } from "@/lib/operator/supabaseAdmin";
import { auditPeople, cleanFilters, readAudit, RESULTS } from "@/lib/operator/auditView";
import { PageHeader } from "@/components/operator/ui";
import ActivityList from "@/components/operator/ActivityList";
import AuditExportButton from "@/components/operator/AuditExportButton";
import { exportActivityCsv } from "@/lib/beauty/operator/auditActions";
import { mayView } from "@/lib/operator/access";
import { requireBeautySession } from "@/lib/operator/panelGuard";
import { getT } from "@/lib/panel/server";
import { tr } from "@/lib/panel/i18n";

export const dynamic = "force-dynamic";

const RESULT_LABEL = { attempt: tr("تلاش"), success: tr("موفق"), failure: tr("ناموفق"), rejected: tr("رد شد") };

export default async function ActivityPage({ searchParams }) {
  const t = await getT();
  const session = await requireBeautySession("audit.view");
  const filters = cleanFilters((await searchParams) || {});
  const admin = getAdminClient();
  const [view, people] = await Promise.all([readAudit(admin, { panel: "beauty", filters }), auditPeople(admin, "beauty")]);
  return (
    <>
      <PageHeader title={t("تاریخچه فعالیت")} subtitle={t("کارهای مهم پنل بیوتی: چه کسی، چه کاری، با چه نتیجه‌ای")} />
      <p className="text-xs text-ink-muted mb-4 leading-relaxed">{t("نام مشتری، تلفن و متن پیام‌ها هرگز در این فهرست ذخیره نمی‌شود. فقط تغییر فیلدهای کاتالوگ (قبل و بعد) ثبت می‌شود. هر صفحه ۵۰ مورد دارد.")}</p>

      <form method="get" className="card p-4 mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 items-end" data-testid="audit-filters">
        <label className="block text-xs text-ink-soft">{t("شخص")}
          <select name="who" defaultValue={filters.who || ""} className="input w-full mt-1"><option value="">{t("همه")}</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        </label>
        <label className="block text-xs text-ink-soft">{t("نتیجه")}
          <select name="result" defaultValue={filters.result || ""} className="input w-full mt-1"><option value="">{t("همه")}</option>{RESULTS.map((r) => <option key={r} value={r}>{t(RESULT_LABEL[r])}</option>)}</select>
        </label>
        <label className="block text-xs text-ink-soft">{t("کد عملیات")}
          <input name="action" defaultValue={filters.action || ""} dir="ltr" placeholder="product.update" className="input w-full mt-1" />
        </label>
        <label className="block text-xs text-ink-soft">{t("از تاریخ")}
          <input type="date" name="from" defaultValue={filters.from || ""} dir="ltr" className="input w-full mt-1" />
        </label>
        <label className="block text-xs text-ink-soft">{t("تا تاریخ")}
          <input type="date" name="to" defaultValue={filters.to || ""} dir="ltr" className="input w-full mt-1" />
        </label>
        <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-5">
          <button type="submit" className="btn-primary size-sm">{t("اعمال فیلتر")}</button>
          <Link href="/beauty/operator/activity" className="btn-ghost size-sm">{t("پاک کردن فیلتر")}</Link>
          {mayView(session, "beauty", "audit.export") && <AuditExportButton filters={filters} exportAction={exportActivityCsv} />}
        </div>
      </form>

      <ActivityList rows={view.rows} names={view.names} query={filters} hasMore={view.hasMore} page={view.page} basePath="/beauty/operator/activity" />
    </>
  );
}
