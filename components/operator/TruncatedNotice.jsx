"use client";
// Shown above a list that loaded its maximum number of rows (lib/operator/listLimits.js): says what is missing and where to find it.
import Icon from "@/components/shared/Icon";
import { useT } from "@/components/panel/PanelI18n";

export default function TruncatedNotice({ limit, variant = "list" }) {
  const t = useT();
  if (!limit) return null;
  return (
    <p role="note" data-testid="list-truncated" className="mb-4 text-sm rounded-xl px-3 py-2.5 flex items-center gap-2 bg-primary/10 text-primary">
      <Icon name="alertTriangle" size={16} className="shrink-0" />
      <span className="min-w-0 break-words">{variant === "stats" ? t("آمار بر پایهٔ {limit} محصول و درخواست جدیدتر محاسبه شده است.", { limit }) : t("فقط {limit} مورد جدیدتر نشان داده شد؛ برای پیدا کردن بقیه از جستجوی بالای صفحه استفاده کنید.", { limit })}</span>
    </p>
  );
}
