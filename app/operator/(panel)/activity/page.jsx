// app/operator/(panel)/activity/page.jsx — the activity log of this panel only (what was done, never customer data).
import { getAdminClient } from "@/lib/operator/supabaseAdmin";
import { listAudit } from "@/lib/operator/security";
import { PageHeader } from "@/components/operator/ui";
import ActivityList from "@/components/operator/ActivityList";
import { requireHealthSession } from "@/lib/operator/panelGuard";
import { getT } from "@/lib/panel/server";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const t = await getT();
  await requireHealthSession();
  const rows = await listAudit(getAdminClient(), { panel: "health", limit: 200 });
  return (
    <>
      <PageHeader title={t("تاریخچه فعالیت")} subtitle={t("کارهای مهم پنل Health: حذف، تغییر وضعیت، ویرایش محصول، ورود و خروج")} />
      <p className="text-xs text-ink-muted mb-4 leading-relaxed">{t("پنل یک حساب مشترک دارد، پس این فهرست نمی‌گوید «چه کسی»؛ فقط «چه چیزی، چه زمانی، از کدام نشست» را نشان می‌دهد. نام مشتری، تلفن و متن پیام‌ها هرگز در آن ذخیره نمی‌شود. ۲۰۰ مورد آخر نمایش داده می‌شود.")}</p>
      <ActivityList rows={rows} />
    </>
  );
}
