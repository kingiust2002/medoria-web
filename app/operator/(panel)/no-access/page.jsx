// app/operator/(panel)/no-access/page.jsx — shown to a signed-in person who opens a page their permissions do not include.
import Link from "next/link";
import { requireHealthSession } from "@/lib/operator/panelGuard";
import { getPanel } from "@/lib/panel/server";
import { PageHeader } from "@/components/operator/ui";

export const dynamic = "force-dynamic";

export default async function NoAccessPage() {
  const { t } = await getPanel();
  await requireHealthSession();
  return (
    <>
      <PageHeader title={t("دسترسی ندارید")} subtitle={t("حساب شما اجازهٔ باز کردن این صفحه را ندارد. اگر لازم است، از مدیر اصلی بخواهید دسترسی را تنظیم کند.")} />
      <Link href="/operator" className="btn-ghost size-sm">{t("بازگشت به داشبورد")}</Link>
    </>
  );
}
