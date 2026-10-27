// app/beauty/operator/(panel)/activity/page.jsx — the activity log of this panel only (what was done, never customer data).
import { getAdminClient } from "@/lib/operator/supabaseAdmin";
import { listAudit } from "@/lib/operator/security";
import { PageHeader } from "@/components/operator/ui";
import ActivityList from "@/components/operator/ActivityList";
import { requireBeautySession } from "@/lib/operator/panelGuard";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  await requireBeautySession();
  const rows = await listAudit(getAdminClient(), { panel: "beauty", limit: 200 });
  return (
    <>
      <PageHeader title="تاریخچه فعالیت" subtitle="کارهای مهم پنل بیوتی: حذف، تغییر وضعیت، ویرایش محصول، ورود و خروج" />
      <p className="text-xs text-ink-muted mb-4 leading-relaxed">
        پنل یک حساب مشترک دارد، پس این فهرست نمی‌گوید «چه کسی»؛ فقط «چه چیزی، چه زمانی، از کدام نشست» را نشان می‌دهد. نام مشتری، تلفن و متن پیام‌ها هرگز در آن ذخیره نمی‌شود. ۲۰۰ مورد آخر نمایش داده می‌شود.
      </p>
      <ActivityList rows={rows} />
    </>
  );
}
