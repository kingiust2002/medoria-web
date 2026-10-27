"use client";
// Confirmation dialog for deleting one customer request. Shared by the Health
// and Beauty panels; each passes its own server action as `onDelete`, so the
// dialog itself knows nothing about which table is touched.
import { useState } from "react";
import Icon from "@/components/shared/Icon";
import { Spinner } from "@/components/operator/ui";
import { useT, usePanelLang } from "@/components/panel/PanelI18n";


function Row({ label, value, ltr }) {
  if (value == null || value === "") return null;
  return (
    <div className="flex gap-2 min-w-0">
      <span className="text-ink-faint shrink-0">{label}:</span>
      <span className="text-ink-soft truncate" dir={ltr ? "ltr" : "rtl"}>{value}</span>
    </div>
  );
}

export default function DeleteQuoteModal({ quote, statusLabel, onClose, onDelete, onDone }) {
  const t = useT();
  const { date: fmtDate } = usePanelLang();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function run() {
    setErr(""); setBusy(true);
    let res;
    try { res = await onDelete(quote.id); } catch { res = null; }
    setBusy(false);
    if (res?.ok || res?.notFound) onDone(res);       // gone either way: refresh the list
    else setErr(t(res?.error) || t("حذف ناموفق بود. دوباره تلاش کنید."));
  }

  const message = quote.message ? String(quote.message).slice(0, 160) + (String(quote.message).length > 160 ? "…" : "") : "";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" onClick={busy ? undefined : onClose}>
      <div className="absolute inset-0 bg-navy/40 backdrop-blur-sm" />
      <div onClick={(e) => e.stopPropagation()} dir="rtl" role="dialog" aria-modal="true" aria-labelledby="del-quote-title" className="relative card p-6 w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain animate-fade-in">
        <div className="flex items-center justify-between mb-4">
          <h2 id="del-quote-title" className="font-bold text-lg text-ink">{t("حذف این درخواست؟")}</h2>
          <button type="button" onClick={onClose} disabled={busy} aria-label={t("بستن")} className="grid place-items-center w-9 h-9 rounded-lg hover:bg-line-soft text-ink-muted"><Icon name="close" size={18} /></button>
        </div>

        {err && <div role="alert" className="mb-4 text-sm rounded-xl px-3 py-2.5 flex items-center gap-2 bg-warn/10 text-warn"><Icon name="alertTriangle" size={16} /> {err}</div>}

        <div className="rounded-xl bg-canvas-soft border border-line p-3 text-sm grid gap-1.5 mb-3">
          <Row label={t("نام")} value={quote.name || t("بدون نام")} />
          <Row label={t("سازمان")} value={quote.organization} />
          <Row label={t("تلفن")} value={quote.phone} ltr />
          <Row label={t("محصول")} value={quote.product_name || t("درخواست عمومی")} />
          <Row label={t("کد محصول")} value={quote.product_sku} ltr />
          <Row label={t("تاریخ ثبت")} value={fmtDate(quote.created_at)} />
          <Row label={t("وضعیت")} value={statusLabel} />
          {message && <p className="text-ink-soft leading-relaxed whitespace-pre-wrap pt-1.5 border-t border-line mt-1">{message}</p>}
        </div>

        <p className="text-sm text-ink-soft leading-relaxed">{t("فقط همین درخواست برای همیشه حذف می‌شود و قابل بازگشت نیست. اگر فقط می‌خواهید آن را کنار بگذارید، به‌جای حذف وضعیتش را «بسته‌شده» یا «اسپم» کنید.")}</p>

        <div className="flex gap-2 mt-5 sticky bottom-0 -mx-6 -mb-6 px-6 pb-6 pt-3 bg-surface border-t border-line">
          <button type="button" onClick={run} disabled={busy} className="btn-primary size-md flex-1 disabled:opacity-60 !bg-warn hover:!bg-warn/90">
            {busy ? <Spinner /> : <Icon name="trash" size={17} />}{busy ? t("در حال حذف…") : t("حذف درخواست")}
          </button>
          <button type="button" onClick={onClose} disabled={busy} className="btn-ghost size-md">{t("انصراف")}</button>
        </div>
      </div>
    </div>
  );
}
