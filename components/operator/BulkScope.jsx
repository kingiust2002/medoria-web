"use client";
// components/operator/BulkScope.jsx — the two pieces of "all filtered results" (N9) shared by the lists of both panels:
//   <ScopeNotice>    shown in the bulk bar once every row of the page is ticked and more rows match the filters: "N on this page — select all M"
//   <ConfirmFiltered> says exactly how many rows will change and under which filters, and asks first (the server also refuses if the count moved)
import Icon from "@/components/shared/Icon";
import { Spinner } from "@/components/operator/ui";
import { useT } from "@/components/panel/PanelI18n";

export function ScopeNotice({ pageCount, total, all, onAll, onPage, num = (n) => n }) {
  const t = useT();
  if (all) {
    return (
      <p className="text-sm text-ink basis-full min-w-0 break-words" data-testid="scope-all">
        {t("همهٔ {total} نتیجهٔ فیلترشده انتخاب شده است.", { total: num(total) })}{" "}
        <button type="button" onClick={onPage} className="underline text-brand-violet font-semibold" data-testid="scope-page">{t("فقط این صفحه")}</button>
      </p>
    );
  }
  if (total <= pageCount) return null;
  return (
    <p className="text-sm text-ink basis-full min-w-0 break-words" data-testid="scope-offer">
      {t("همهٔ {count} مورد این صفحه انتخاب شد.", { count: num(pageCount) })}{" "}
      <button type="button" onClick={onAll} className="underline text-brand-violet font-semibold" data-testid="scope-select-all">{t("انتخاب همهٔ {total} نتیجهٔ فیلترشده", { total: num(total) })}</button>
    </p>
  );
}

export function ConfirmFiltered({ total, filters, what, busy, onConfirm, onCancel, approval = false, num = (n) => n }) {
  const t = useT();
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center p-4" role="dialog" aria-modal="true" aria-label={t("تأیید تغییر همهٔ نتایج فیلترشده")} data-testid="confirm-filtered">
      <div className="absolute inset-0 bg-navy/45 backdrop-blur-sm" onClick={busy ? undefined : onCancel} />
      <div className="relative card p-5 w-full max-w-md min-w-0">
        <h2 className="font-bold text-ink mb-2">{t("تأیید تغییر همهٔ نتایج فیلترشده")}</h2>
        <p className="text-sm text-ink-soft leading-7 break-words">{approval ? t("«{what}» برای {total} مورد، به‌صورت یک درخواست برای تأیید ارسال می‌شود؛ تا تأیید نشود چیزی تغییر نمی‌کند.", { what, total: num(total) }) : t("«{what}» روی {total} مورد اعمال می‌شود، نه فقط روی صفحهٔ فعلی.", { what, total: num(total) })}</p>
        <p className="text-xs text-ink-muted mt-2 break-words">{t("فیلترها: {filters}", { filters })}</p>
        <div className="flex flex-wrap gap-2 mt-5">
          <button type="button" onClick={onConfirm} disabled={busy} className="btn-primary size-md disabled:opacity-60" data-testid="confirm-filtered-yes">{busy ? <Spinner /> : <Icon name="check" size={16} />} {approval ? t("بله، برای تأیید ارسال شود") : t("بله، روی همهٔ {total} مورد اعمال شود", { total: num(total) })}</button>
          <button type="button" onClick={onCancel} disabled={busy} className="btn-ghost size-md">{t("انصراف")}</button>
        </div>
      </div>
    </div>
  );
}
